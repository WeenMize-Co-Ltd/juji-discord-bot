import { and, count, countDistinct, desc, eq, gte, isNotNull, max, ne, sql, sum } from 'drizzle-orm'
import { databaseClient, db } from './client'
import { listenEvents, playEvents, tracks, users } from './schema'
import { statsCacheTtlSeconds } from '../config'
import { redis } from '../redis/client'

export type StatsRange = '7d' | '30d' | 'all'
export const statsRangeValues = ['7d', '30d', 'all'] as const

export interface StatsSummary {
  totalPlays: number
  totalListeningSec: number
  uniqueTracks: number
  uniqueListeners: number
}

export interface TopListener {
  discordUserId: string
  displayName: string
  avatarUrl: string
  listenedSec: number
}

/**
 * Discord's fallback avatar for accounts that never set one. Post-migration usernames
 * pick the variant from the snowflake; there are 6.
 */
function defaultAvatarUrl(discordUserId: string): string {
  const index = (BigInt(discordUserId) >> 22n) % 6n
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`
}

/** Never hands the frontend an empty string — it always gets something renderable. */
function avatarFor(discordUserId: string, stored: string | null): string {
  if (stored) return stored
  try {
    return defaultAvatarUrl(discordUserId)
  } catch {
    // Not a snowflake (shouldn't happen) — fall back to variant 0.
    return 'https://cdn.discordapp.com/embed/avatars/0.png'
  }
}

export interface TopTrack {
  trackId: string
  title: string
  author: string
  thumbnail: string | null
  url: string
  playCount: number
  listenedSec: number
}

export interface TopRequester {
  discordUserId: string
  displayName: string
  avatarUrl: string
  requestCount: number
}

const EMPTY_SUMMARY: StatsSummary = {
  totalPlays: 0,
  totalListeningSec: 0,
  uniqueTracks: 0,
  uniqueListeners: 0,
}

/**
 * Real listening time for a track, summed from `listen_events`. `play_events.played_sec`
 * is wall-clock — it counts paused time and time with nobody in the channel — so it must
 * not be used here.
 */
const LISTENED_SEC = sql<number>`coalesce(sum(${listenEvents.listenedSec}), 0)::int`

function sinceFor(range: StatsRange): Date | null {
  if (range === 'all') return null
  const days = range === '7d' ? 7 : 30
  return new Date(Date.now() - days * 86_400_000)
}

class AnalyticsQueries {
  async summary(guildId: string, range: StatsRange): Promise<StatsSummary> {
    if (!databaseClient.enabled) return EMPTY_SUMMARY
    return this.cached(this.key(guildId, 'summary', range), () => this.querySummary(guildId, range))
  }

  async topListeners(guildId: string, range: StatsRange, limit: number): Promise<TopListener[]> {
    if (!databaseClient.enabled) return []
    return this.cached(this.key(guildId, 'listeners', range, limit), () =>
      this.queryTopListeners(guildId, range, limit),
    )
  }

  async topTracks(guildId: string, range: StatsRange, limit: number): Promise<TopTrack[]> {
    if (!databaseClient.enabled) return []
    return this.cached(this.key(guildId, 'tracks', range, limit), () =>
      this.queryTopTracks(guildId, range, limit),
    )
  }

  async playedTracks(guildId: string, limit: number): Promise<TopTrack[]> {
    if (!databaseClient.enabled) return []
    return this.cached(this.key(guildId, 'played', 'all', limit), () =>
      this.queryPlayedTracks(guildId, limit),
    )
  }

  async topRequesters(guildId: string, range: StatsRange, limit: number): Promise<TopRequester[]> {
    if (!databaseClient.enabled) return []
    return this.cached(this.key(guildId, 'requesters', range, limit), () =>
      this.queryTopRequesters(guildId, range, limit),
    )
  }

  private async querySummary(guildId: string, range: StatsRange): Promise<StatsSummary> {
    const since = sinceFor(range)
    const playWhere = since
      ? and(eq(playEvents.guildId, guildId), gte(playEvents.startedAt, since))
      : eq(playEvents.guildId, guildId)
    const listenWhere = since
      ? and(eq(listenEvents.guildId, guildId), gte(listenEvents.createdAt, since))
      : eq(listenEvents.guildId, guildId)

    const [playAgg] = await db
      .select({ totalPlays: count(), uniqueTracks: countDistinct(playEvents.trackId) })
      .from(playEvents)
      .where(playWhere)
    const [listenAgg] = await db
      .select({
        totalListeningSec: sum(listenEvents.listenedSec).mapWith(Number),
        uniqueListeners: countDistinct(listenEvents.discordUserId),
      })
      .from(listenEvents)
      .where(listenWhere)

    return {
      totalPlays: playAgg?.totalPlays ?? 0,
      uniqueTracks: playAgg?.uniqueTracks ?? 0,
      totalListeningSec: listenAgg?.totalListeningSec ?? 0,
      uniqueListeners: listenAgg?.uniqueListeners ?? 0,
    }
  }

  private async queryTopListeners(
    guildId: string,
    range: StatsRange,
    limit: number,
  ): Promise<TopListener[]> {
    const since = sinceFor(range)
    const where = since
      ? and(eq(listenEvents.guildId, guildId), gte(listenEvents.createdAt, since))
      : eq(listenEvents.guildId, guildId)
    const total = sum(listenEvents.listenedSec).mapWith(Number)

    const rows = await db
      .select({
        discordUserId: listenEvents.discordUserId,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        listenedSec: total,
      })
      .from(listenEvents)
      .innerJoin(users, eq(users.id, listenEvents.discordUserId))
      .where(where)
      .groupBy(listenEvents.discordUserId, users.displayName, users.avatarUrl)
      .orderBy(desc(total))
      .limit(limit)

    return rows.map((r) => ({ ...r, avatarUrl: avatarFor(r.discordUserId, r.avatarUrl) }))
  }

  private async queryTopTracks(
    guildId: string,
    range: StatsRange,
    limit: number,
  ): Promise<TopTrack[]> {
    const since = sinceFor(range)
    const conds = [eq(playEvents.guildId, guildId), ne(playEvents.requestSource, 'auto-dj')]
    if (since) conds.push(gte(playEvents.startedAt, since))
    // countDistinct, not count: the listen_events join fans each play out into one row
    // per listener, which would otherwise multiply the play count.
    const playCount = countDistinct(playEvents.id)

    return db
      .select({
        trackId: playEvents.trackId,
        title: tracks.title,
        author: tracks.author,
        thumbnail: tracks.thumbnail,
        url: tracks.url,
        playCount,
        listenedSec: LISTENED_SEC,
      })
      .from(playEvents)
      .innerJoin(tracks, eq(tracks.id, playEvents.trackId))
      .leftJoin(listenEvents, eq(listenEvents.playEventId, playEvents.id))
      .where(and(...conds))
      .groupBy(playEvents.trackId, tracks.title, tracks.author, tracks.thumbnail, tracks.url)
      .orderBy(desc(playCount))
      .limit(limit)
  }

  private async queryPlayedTracks(guildId: string, limit: number): Promise<TopTrack[]> {
    const conds = [eq(playEvents.guildId, guildId), ne(playEvents.requestSource, 'auto-dj')]
    const playCount = countDistinct(playEvents.id)
    const lastPlayedAt = max(playEvents.startedAt)

    return db
      .select({
        trackId: playEvents.trackId,
        title: tracks.title,
        author: tracks.author,
        thumbnail: tracks.thumbnail,
        url: tracks.url,
        playCount,
        listenedSec: LISTENED_SEC,
      })
      .from(playEvents)
      .innerJoin(tracks, eq(tracks.id, playEvents.trackId))
      .leftJoin(listenEvents, eq(listenEvents.playEventId, playEvents.id))
      .where(and(...conds))
      .groupBy(playEvents.trackId, tracks.title, tracks.author, tracks.thumbnail, tracks.url)
      .orderBy(desc(lastPlayedAt))
      .limit(limit)
  }

  private async queryTopRequesters(
    guildId: string,
    range: StatsRange,
    limit: number,
  ): Promise<TopRequester[]> {
    const since = sinceFor(range)
    const conds = [
      eq(playEvents.guildId, guildId),
      isNotNull(playEvents.discordUserId),
      ne(playEvents.requestSource, 'auto-dj'),
    ]
    if (since) conds.push(gte(playEvents.startedAt, since))
    const requestCount = count()

    const rows = await db
      .select({
        discordUserId: playEvents.discordUserId,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        requestCount,
      })
      .from(playEvents)
      .innerJoin(users, eq(users.id, playEvents.discordUserId))
      .where(and(...conds))
      .groupBy(playEvents.discordUserId, users.displayName, users.avatarUrl)
      .orderBy(desc(requestCount))
      .limit(limit)

    // discordUserId is nullable in the schema; the isNotNull filter above guarantees it
    // here, but narrow it for real rather than asserting.
    return rows
      .filter((r): r is typeof r & { discordUserId: string } => r.discordUserId !== null)
      .map((r) => ({ ...r, avatarUrl: avatarFor(r.discordUserId, r.avatarUrl) }))
  }

  private key(guildId: string, kind: string, range: StatsRange, limit = 0): string {
    return `stats:${guildId}:${kind}:${range}:${limit}`
  }

  /** Cache-aside via Redis; best-effort, so a Redis outage falls through to a direct DB query. */
  private async cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
    try {
      const hit: unknown = await redis.send('GET', [key])
      if (typeof hit === 'string') {
        const parsed: unknown = JSON.parse(hit)
        return parsed as T
      }
    } catch {
      /* redis unavailable — fall through to the database */
    }
    const data = await fn()
    try {
      await redis.send('SET', [key, JSON.stringify(data), 'EX', String(statsCacheTtlSeconds)])
    } catch {
      /* best-effort: a failed cache write must not fail the request */
    }
    return data
  }
}

export const analyticsQueries = new AnalyticsQueries()
