import { createMiddleware } from 'hono/factory'
import { getDiscordClient } from '../../music/lavalink'
import { redis } from '../../redis/client'
import type { AppEnv } from '../types'

const ALLOW_TTL_SECONDS = 120
const ALLOW_TTL_JITTER_SECONDS = 30
const DENY_TTL_SECONDS = 30
const LOCAL_TTL_MS = 30_000
const LOCAL_MAX = 1_000
const UNKNOWN_MEMBER = 10007

interface AccessDecision {
  allowed: boolean
  expiresAt: number
}

const local = new Map<string, AccessDecision>()
const inflight = new Map<string, Promise<boolean>>()

function cacheKey(guildId: string, discordUserId: string): string {
  return `guildaccess:${guildId}:${discordUserId}`
}

function remember(key: string, allowed: boolean): void {
  if (local.size >= LOCAL_MAX) {
    const oldest = local.keys().next().value
    if (oldest !== undefined) local.delete(oldest)
  }
  local.set(key, { allowed, expiresAt: Date.now() + LOCAL_TTL_MS })
}

function isUnknownMember(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'code' in error && error.code === UNKNOWN_MEMBER
  )
}

async function askDiscord(
  guildId: string,
  discordUserId: string,
): Promise<{ allowed: boolean; cacheable: boolean }> {
  const client = getDiscordClient()
  if (!client) return { allowed: false, cacheable: false }

  let guild = client.guilds.cache.get(guildId)
  if (!guild) {
    try {
      guild = await client.guilds.fetch(guildId)
    } catch {
      return { allowed: false, cacheable: false }
    }
  }

  try {
    await guild.members.fetch(discordUserId)
    return { allowed: true, cacheable: true }
  } catch (error) {
    return { allowed: false, cacheable: isUnknownMember(error) }
  }
}

async function lookupGuildMember(
  guildId: string,
  discordUserId: string,
  key: string,
): Promise<boolean> {
  try {
    const cached: unknown = await redis.send('GET', [key])
    if (cached === '1') {
      remember(key, true)
      return true
    }
    if (cached === '0') {
      remember(key, false)
      return false
    }
  } catch {
    /* redis unavailable — fall through and ask Discord directly */
  }

  const decision = await askDiscord(guildId, discordUserId)
  if (!decision.cacheable) return decision.allowed

  remember(key, decision.allowed)
  try {
    const ttl = decision.allowed
      ? ALLOW_TTL_SECONDS + Math.floor(Math.random() * ALLOW_TTL_JITTER_SECONDS)
      : DENY_TTL_SECONDS
    await redis.send('SET', [key, decision.allowed ? '1' : '0', 'EX', String(ttl)])
  } catch {
    /* best-effort: a failed cache write must not fail the request */
  }
  return decision.allowed
}

async function isGuildMember(guildId: string, discordUserId: string): Promise<boolean> {
  const key = cacheKey(guildId, discordUserId)

  const localHit = local.get(key)
  if (localHit && localHit.expiresAt > Date.now()) return localHit.allowed

  // Coalesce concurrent checks (a page load fires several API/stream requests at once).
  const pending = inflight.get(key)
  if (pending) return pending

  const decision = lookupGuildMember(guildId, discordUserId, key).finally(() => {
    inflight.delete(key)
  })
  inflight.set(key, decision)
  return decision
}

export const guildAccess = createMiddleware<AppEnv>(async (c, next) => {
  const guildId = c.req.param('guildId')
  if (!guildId) return c.json({ error: 'A guild id is required.' }, 400)

  const discordUserId = c.get('jwtPayload').discord_id
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

export async function canAccessGuild(
  guildId: string,
  discordUserId: string | undefined,
): Promise<boolean> {
  if (!discordUserId) return false
  return isGuildMember(guildId, discordUserId)
}
