import { requireEnv } from '.'

/**
 * Better Auth is hosted by this bot (see `src/auth/`); the web BFF proxies
 * `/api/auth/*` here. `authUrl` must be the *public web origin* — Better Auth
 * derives OAuth callback URLs, issuer/audience and trusted origins from it,
 * and the browser never talks to the bot directly.
 *
 * Normalized to the URL origin so a stray trailing slash or path in the env
 * can't produce mismatched `iss`/`aud`/trusted-origin values.
 */
export const authUrl = new URL(requireEnv('BETTER_AUTH_URL')).origin

/** Signing/encryption secret for Better Auth sessions and cookies. */
export const authSecret = requireEnv('BETTER_AUTH_SECRET')

/** Expected `iss`/`aud` claims on JWTs minted by the Better Auth jwt plugin. */
export const authIssuer = authUrl
export const authAudience = authUrl
