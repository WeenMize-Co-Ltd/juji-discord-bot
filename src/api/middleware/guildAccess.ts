import { createMiddleware } from 'hono/factory'
import { getDiscordClient } from '../../music/lavalink'
import { redis } from '../../redis/client'
import type { AppEnv } from '../types'

/** How long a confirmed membership is trusted before Discord is asked again. */
const ALLOW_TTL_SECONDS = 60
/** Denials expire sooner, so a user who just joined isn't locked out for long. */
const DENY_TTL_SECONDS = 15

function cacheKey(guildId: string, discordUserId: string): string {
  return `guildaccess:${guildId}:${discordUserId}`
}

/**
 * Asks Discord whether the user is a member of the guild.
 *
 * `guild.members.fetch()` is a REST call — the `GuildMembers` intent is not enabled
 * and is not needed — so the result is cached in Redis to keep one API call from
 * riding on every request.
 */
async function isGuildMember(guildId: string, discordUserId: string): Promise<boolean> {
  const key = cacheKey(guildId, discordUserId)
  try {
    const cached: unknown = await redis.send('GET', [key])
    if (cached === '1') return true
    if (cached === '0') return false
  } catch {
    /* redis unavailable — fall through and ask Discord directly */
  }

  const client = getDiscordClient()
  if (!client) return false

  const guild =
    client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId).catch(() => null))
  const member = guild ? await guild.members.fetch(discordUserId).catch(() => null) : null
  const allowed = member !== null

  try {
    const ttl = allowed ? ALLOW_TTL_SECONDS : DENY_TTL_SECONDS
    await redis.send('SET', [key, allowed ? '1' : '0', 'EX', String(ttl)])
  } catch {
    /* best-effort: a failed cache write must not fail the request */
  }
  return allowed
}

/**
 * Authorizes `/api/guilds/:guildId/*`.
 *
 * `authMiddleware` only proves the caller holds a valid Supabase token — without this
 * every authenticated user could drive any guild the bot is in. Mount it directly after
 * `authMiddleware`; downstream handlers read the verified id from `c.get('guildId')`.
 */
export const guildAccess = createMiddleware<AppEnv>(async (c, next) => {
  const guildId = c.req.param('guildId')
  if (!guildId) return c.json({ error: 'A guild id is required.' }, 400)

  // Supabase stores the Discord snowflake from the OAuth provider here.
  const discordUserId = c.get('jwtPayload').user_metadata?.provider_id
  if (!discordUserId) {
    return c.json({ error: 'This account is not linked to Discord.' }, 403)
  }

  if (!(await isGuildMember(guildId, discordUserId))) {
    return c.json({ error: 'You do not have access to this guild.' }, 403)
  }

  c.set('guildId', guildId)
  await next()
  return undefined
})

/** Same check, for call sites without a Hono context (the websocket upgrade). */
export async function canAccessGuild(
  guildId: string,
  discordUserId: string | undefined,
): Promise<boolean> {
  if (!discordUserId) return false
  return isGuildMember(guildId, discordUserId)
}
