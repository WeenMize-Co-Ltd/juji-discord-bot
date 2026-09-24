import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  max,
  ne,
  sql,
  sum,
} from 'drizzle-orm'
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

const CACHE_LIMIT = 50
const LOCAL_TTL_MS = 3_000
const LOCAL_MAX = 500

const LISTENED_SEC = sql<number>`coalesce(sum(${listenEvents.listenedSec}), 0)::int`

function sinceFor(range: StatsRange): Date | null {
  if (range === 'all') return null
  const days = range === '7d' ? 7 : 30
  return new Date(Date.now() - days * 86_400_000)
}

class AnalyticsQueries {
  private readonly local = new Map<string, { value: unknown; expiresAt: number }>()
  private readonly inflight = new Map<string, Promise<unknown>>()

  async summary(guildId: string, range: StatsRange): Promise<StatsSummary> {
    if (!databaseClient.enabled) return EMPTY_SUMMARY
    return this.cached(this.key(guildId, 'summary', range), () => this.querySummary(guildId, range))
  }

  async topListeners(guildId: string, range: StatsRange, limit: number): Promise<TopListener[]> {
    if (!databaseClient.enabled) return []
    const rows = await this.cached(this.key(guildId, 'listeners', range), () =>
      this.queryTopListeners(guildId, range, CACHE_LIMIT),
    )
    return rows.slice(0, limit)
  }

  async topTracks(guildId: string, range: StatsRange, limit: number): Promise<TopTrack[]> {
    if (!databaseClient.enabled) return []
    const rows = await this.cached(this.key(guildId, 'tracks', range), () =>
      this.queryTopTracks(guildId, range, CACHE_LIMIT),
    )
    return rows.slice(0, limit)
  }

  async playedTracks(guildId: string, limit: number): Promise<TopTrack[]> {
    if (!databaseClient.enabled) return []
    return this.cached(this.key(guildId, 'played', 'all', limit), () =>
      this.queryPlayedTracks(guildId, limit),
    )
  }

  async topRequesters(guildId: string, range: StatsRange, limit: number): Promise<TopRequester[]> {
    if (!databaseClient.enabled) return []
    const rows = await this.cached(this.key(guildId, 'requesters', range), () =>
      this.queryTopRequesters(guildId, range, CACHE_LIMIT),
    )
    return rows.slice(0, limit)
  }

  private async querySummary(guildId: string, range: StatsRange): Promise<StatsSummary> {
    const since = sinceFor(range)
    const playWhere = since
      ? and(eq(playEvents.guildId, guildId), gte(playEvents.startedAt, since))
      : eq(playEvents.guildId, guildId)
    const listenWhere = since
      ? and(eq(listenEvents.guildId, guildId), gte(listenEvents.createdAt, since))
      : eq(listenEvents.guildId, guildId)

    const [[playAgg], [listenAgg]] = await Promise.all([
      db
        .select({ totalPlays: count(), uniqueTracks: countDistinct(playEvents.trackId) })
        .from(playEvents)
        .where(playWhere),
      db
        .select({
          totalListeningSec: sum(listenEvents.listenedSec).mapWith(Number),
          uniqueListeners: countDistinct(listenEvents.discordUserId),
        })
        .from(listenEvents)
        .where(listenWhere),
    ])

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
    const playCount = count()

    const rows = await db
      .select({
        trackId: playEvents.trackId,
        title: tracks.title,
        author: tracks.author,
        thumbnail: tracks.thumbnail,
        url: tracks.url,
        playCount,
      })
      .from(playEvents)
      .innerJoin(tracks, eq(tracks.id, playEvents.trackId))
      .where(and(...conds))
      .groupBy(playEvents.trackId, tracks.title, tracks.author, tracks.thumbnail, tracks.url)
      .orderBy(desc(playCount))
      .limit(limit)

    const listened = await this.listenedSeconds(
      guildId,
      since,
      rows.map((row) => row.trackId),
    )
    return rows.map((row) => ({ ...row, listenedSec: listened.get(row.trackId) ?? 0 }))
  }

  private async queryPlayedTracks(guildId: string, limit: number): Promise<TopTrack[]> {
    const conds = [eq(playEvents.guildId, guildId), ne(playEvents.requestSource, 'auto-dj')]
    const playCount = count()

    const rows = await db
      .select({
        trackId: playEvents.trackId,
        title: tracks.title,
        author: tracks.author,
        thumbnail: tracks.thumbnail,
        url: tracks.url,
        playCount,
      })
      .from(playEvents)
      .innerJoin(tracks, eq(tracks.id, playEvents.trackId))
      .where(and(...conds))
      .groupBy(playEvents.trackId, tracks.title, tracks.author, tracks.thumbnail, tracks.url)
      .orderBy(desc(max(playEvents.startedAt)))
      .limit(limit)

    const listened = await this.listenedSeconds(
      guildId,
      null,
      rows.map((row) => row.trackId),
    )
    return rows.map((row) => ({ ...row, listenedSec: listened.get(row.trackId) ?? 0 }))
  }

  private async listenedSeconds(
    guildId: string,
    since: Date | null,
    trackIds: string[],
  ): Promise<Map<string, number>> {
    if (trackIds.length === 0) return new Map()

    const conds = [
      eq(listenEvents.guildId, guildId),
      eq(playEvents.guildId, guildId),
      ne(playEvents.requestSource, 'auto-dj'),
      inArray(playEvents.trackId, trackIds),
    ]
    if (since) conds.push(gte(playEvents.startedAt, since))

    const rows = await db
      .select({ trackId: playEvents.trackId, listenedSec: LISTENED_SEC })
      .from(listenEvents)
      .innerJoin(playEvents, eq(playEvents.id, listenEvents.playEventId))
      .where(and(...conds))
      .groupBy(playEvents.trackId)

    return new Map(rows.map((row) => [row.trackId, row.listenedSec]))
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

  private async cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const local = this.local.get(key)
    if (local && local.expiresAt > Date.now()) return local.value as T

    const pending = this.inflight.get(key)
    if (pending) return pending as Promise<T>

    const promise = this.load(key, fn).finally(() => {
      this.inflight.delete(key)
    })
    this.inflight.set(key, promise)
    return promise
  }

  private async load<T>(key: string, fn: () => Promise<T>): Promise<T> {
    try {
      const hit: unknown = await redis.send('GET', [key])
      if (typeof hit === 'string') {
        const parsed: unknown = JSON.parse(hit)
        this.remember(key, parsed)
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
    this.remember(key, data)
    return data
  }

  private remember(key: string, value: unknown): void {
    if (this.local.size >= LOCAL_MAX) {
      const oldest = this.local.keys().next().value
      if (oldest !== undefined) this.local.delete(oldest)
    }
    this.local.set(key, { value, expiresAt: Date.now() + LOCAL_TTL_MS })
  }
}

export const analyticsQueries = new AnalyticsQueries()
