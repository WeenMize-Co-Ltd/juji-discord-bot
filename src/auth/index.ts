import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { jwt } from 'better-auth/plugins'
import { authSecret, authUrl, clientId, clientSecret } from '../config'
import { db } from '../database'
import * as schema from '../database/schema'

/**
 * Better Auth instance — the single source of truth for Discord login.
 *
 * It runs *inside the bot* so that Postgres stays owned by this service; the
 * web BFF (Next.js) only proxies `/api/auth/*` and forwards the session cookie,
 * so the browser never reaches this server directly.
 *
 * `authUrl` is the public web origin: Better Auth uses it for OAuth callback
 * URLs (`{authUrl}/api/auth/callback/discord`), cookie settings, issuer/audience
 * and `trustedOrigins`.
 */
export const auth = betterAuth({
  baseURL: authUrl,
  secret: authSecret,
  trustedOrigins: [authUrl],
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  // Discord OAuth is the only sign-in method.
  emailAndPassword: { enabled: false },
  telemetry: { enabled: false },
  user: {
    additionalFields: {
      // Discord snowflake — the identity the bot uses for guild access and the
      // `discord_id` JWT claim.
      discordId: { type: 'string', required: true, input: true },
      globalName: { type: 'string', required: false, input: true },
    },
  },
  socialProviders: {
    discord: {
      clientId,
      clientSecret,
      scope: ['identify', 'email', 'guilds'],
      mapProfileToUser: (profile) => ({
        // Discord returns `email: null` for phone-only accounts; Better Auth
        // requires a unique email, so fall back to a reserved invalid one.
        email: profile.email ?? `${profile.id}@discord.placeholder.invalid`,
        discordId: profile.id,
        globalName: profile.global_name ?? profile.username,
      }),
    },
  },
  session: {
    // Sliding 30-day session — refreshed at most once per day.
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  plugins: [
    jwt({
      // ES256 keeps the bot's own verifier (WebCrypto ECDSA P-256) unchanged.
      jwks: { keyPairConfig: { alg: 'ES256' } },
      jwt: {
        issuer: authUrl,
        audience: authUrl,
        expirationTime: '15m',
        // Flat claims consumed by the REST/WS middleware. The plugin types the
        // user as `any`; pin it to the fields configured in additionalFields.
        definePayload: ({ user }) => {
          const u = user as unknown as {
            name: string
            image?: string | null
            discordId: string
            globalName?: string | null
          }
          return {
            discord_id: u.discordId,
            name: u.globalName ?? u.name,
            image: u.image,
          }
        },
      },
    }),
  ],
})
