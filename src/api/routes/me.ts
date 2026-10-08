import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { auth } from '../../auth'
import { db } from '../../database'
import { account } from '../../database/schema'
import { getDiscordClient } from '../../music/lavalink'
import type { AppEnv } from '../types'

const DISCORD_API = 'https://discord.com/api'
const ADMINISTRATOR = 0x8
const FETCH_TIMEOUT_MS = 5_000

interface DiscordGuild {
  id: string
  name: string
  owner?: boolean
  permissions?: string
}

export const me = new Hono<AppEnv>()
  .get('/', (c) => {
    const payload = c.get('jwtPayload')
    return c.json({
      id: payload.sub,
      email: payload.email,
      discordId: payload.discord_id,
      name: payload.name,
      avatarUrl: payload.image,
    })
  })
  /**
   * The caller's Discord servers that the bot is also in, with the admin bit
   * already resolved. The web BFF calls this right after sign-in to seed its
   * guild cookies — the Discord provider token never leaves this service.
   */
  .get('/guilds', async (c) => {
    const payload = c.get('jwtPayload')

    const [linked] = await db
      .select({ id: account.id })
      .from(account)
      .where(and(eq(account.userId, payload.sub), eq(account.providerId, 'discord')))
      .limit(1)
    if (!linked) {
      return c.json({ error: 'This account is not linked to Discord.' }, 403)
    }

    let accessToken: string | undefined
    let userGuilds: DiscordGuild[]
    try {
      // Refreshes the stored Discord token first when it has expired.
      const token = await auth.api.getAccessToken({
        body: { accountId: linked.id, userId: payload.sub },
      })
      accessToken = token.accessToken
    } catch (error) {
      console.error('[api] failed to get Discord access token:', error)
      return c.json({ error: 'Discord is not connected for this account.' }, 403)
    }

    try {
      const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (!res.ok) throw new Error(`Discord responded ${res.status}`)
      userGuilds = (await res.json()) as DiscordGuild[]
    } catch (error) {
      console.error('[api] failed to fetch Discord guilds:', error)
      return c.json({ error: 'Could not load your Discord servers. Please try again.' }, 502)
    }

    const client = getDiscordClient()
    const guilds = userGuilds.flatMap((guild) => {
      if (!client?.guilds.cache.has(guild.id)) return []
      const isAdmin =
        guild.owner === true || (Number(guild.permissions ?? '0') & ADMINISTRATOR) !== 0
      return [{ id: guild.id, name: guild.name, isAdmin }]
    })

    return c.json({ guilds })
  })
