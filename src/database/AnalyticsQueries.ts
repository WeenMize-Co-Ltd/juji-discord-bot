import { and, count, countDistinct, desc, eq, gte, isNotNull, ne, sum } from 'drizzle-orm'
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
  listenedSec: number
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
  requestCount: number
}

const EMPTY_SUMMARY: StatsSummary = {
  totalPlays: 0,
  totalListeningSec: 0,
  uniqueTracks: 0,
  uniqueListeners: 0,
}

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

    return db
      .select({
        discordUserId: listenEvents.discordUserId,
        displayName: users.displayName,
        listenedSec: total,
      })
      .from(listenEvents)
      .innerJoin(users, eq(users.id, listenEvents.discordUserId))
      .where(where)
      .groupBy(listenEvents.discordUserId, users.displayName)
      .orderBy(desc(total))
      .limit(limit)
  }

  private async queryTopTracks(
    guildId: string,
    range: StatsRange,
    limit: number,
  ): Promise<TopTrack[]> {
    const since = sinceFor(range)
    const conds = [eq(playEvents.guildId, guildId), ne(playEvents.requestSource, 'auto-dj')]
    if (since) conds.push(gte(playEvents.startedAt, since))
    const playCount = count()

    return db
      .select({
        trackId: playEvents.trackId,
        title: tracks.title,
        author: tracks.author,
        thumbnail: tracks.thumbnail,
        url: tracks.url,
        playCount,
        listenedSec: sum(playEvents.listenedSec).mapWith(Number),
      })
      .from(playEvents)
      .innerJoin(tracks, eq(tracks.id, playEvents.trackId))
      .where(and(...conds))
      .groupBy(playEvents.trackId, tracks.title, tracks.author, tracks.thumbnail, tracks.url)
      .orderBy(desc(playCount))
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
        requestCount,
      })
      .from(playEvents)
      .innerJoin(users, eq(users.id, playEvents.discordUserId))
      .where(and(...conds))
      .groupBy(playEvents.discordUserId, users.displayName)
      .orderBy(desc(requestCount))
      .limit(limit)

    // discordUserId is nullable in the schema but the isNotNull filter guarantees it here.
    return rows.map((r) => ({ ...r, discordUserId: r.discordUserId as string }))
  }

  private key(guildId: string, kind: string, range: StatsRange, limit = 0): string {
    return `stats:${guildId}:${kind}:${range}:${limit}`
  }

  /** Cache-aside via Redis; best-effort, so a Redis outage falls through to a direct DB query. */
  private async cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
    try {
      const hit = await redis.send('GET', [key])
      if (typeof hit === 'string') return JSON.parse(hit) as T
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
