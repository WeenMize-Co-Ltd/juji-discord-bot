import { eq } from 'drizzle-orm'
import { databaseClient, db } from './client'
import { listenEvents, playEvents } from './schema'
import type { EndReason, RequestSource } from './schema'
import { upsertTrack, upsertUsers } from './upserts'
import { resolveArtwork } from '../music/artwork'
import type { Track } from '../types/track'

export interface PlayContext {
  discordUserId?: string
  displayName: string
  avatarUrl?: string
  query?: string
  requestSource: RequestSource
}

export interface ListenerDuration {
  discordUserId: string
  displayName: string
  avatarUrl?: string
  listenedSec: number
}

interface OpenEvent {
  eventId: string
  startedAtMs: number
}

/**
 * An open play event older than this is assumed orphaned — the `trackEnd` that should
 * have closed it never arrived (e.g. the Lavalink node dropped).
 */
const OPEN_EVENT_MAX_AGE_MS = 6 * 60 * 60_000

class AnalyticsRecorder {
  private readonly open = new Map<string, OpenEvent>()

  recordPlay(guildId: string, voiceChannelId: string | null, track: Track, ctx: PlayContext): void {
    if (!databaseClient.enabled || !track.id) return
    this.sweepOpen()
    void this.doRecordPlay(guildId, voiceChannelId, track, ctx).catch((error: unknown) => {
      console.error('[analytics] recordPlay failed:', error)
    })
  }

  recordEnd(guildId: string, endReason: EndReason, listeners: ListenerDuration[]): void {
    const openEvent = this.open.get(guildId)
    this.open.delete(guildId)
    if (!databaseClient.enabled || !openEvent) return
    void this.doRecordEnd(openEvent, guildId, endReason, listeners).catch((error: unknown) => {
      console.error('[analytics] recordEnd failed:', error)
    })
  }

  private async doRecordPlay(
    guildId: string,
    voiceChannelId: string | null,
    track: Track,
    ctx: PlayContext,
  ): Promise<void> {
    const trackValues = {
      title: track.title,
      author: track.author,
      url: track.url,
      thumbnail: resolveArtwork(track) || null,
      durationSec: track.durationSec,
      sourceName: track.sourceName,
    }

    await Promise.all([
      upsertTrack(track.id, trackValues),
      ctx.discordUserId
        ? upsertUsers([
            { id: ctx.discordUserId, displayName: ctx.displayName, avatarUrl: ctx.avatarUrl },
          ])
        : Promise.resolve(),
      this.closeOrphaned(guildId),
    ])

    const [row] = await db
      .insert(playEvents)
      .values({
        guildId,
        trackId: track.id,
        discordUserId: ctx.discordUserId ?? null,
        query: ctx.query ?? null,
        requestSource: ctx.requestSource,
        voiceChannelId,
      })
      .returning({ id: playEvents.id })

    if (row) this.open.set(guildId, { eventId: row.id, startedAtMs: Date.now() })
  }

  private async doRecordEnd(
    openEvent: OpenEvent,
    guildId: string,
    endReason: EndReason,
    listeners: ListenerDuration[],
  ): Promise<void> {
    const playedSec = Math.round((Date.now() - openEvent.startedAtMs) / 1000)
    const valid = listeners.filter((listener) => listener.listenedSec > 0)

    await Promise.all([
      db
        .update(playEvents)
        .set({ endedAt: new Date(), endReason, playedSec })
        .where(eq(playEvents.id, openEvent.eventId)),
      valid.length > 0
        ? upsertUsers(
            valid.map((listener) => ({
              id: listener.discordUserId,
              displayName: listener.displayName,
              avatarUrl: listener.avatarUrl,
            })),
          )
        : Promise.resolve(),
    ])

    if (valid.length === 0) return
    await db.insert(listenEvents).values(
      valid.map((listener) => ({
        playEventId: openEvent.eventId,
        guildId,
        discordUserId: listener.discordUserId,
        listenedSec: listener.listenedSec,
      })),
    )
  }

  private async closeOrphaned(guildId: string): Promise<void> {
    const stale = this.open.get(guildId)
    if (!stale) return
    this.open.delete(guildId)
    await db
      .update(playEvents)
      .set({
        endedAt: new Date(),
        endReason: 'cleanup',
        playedSec: Math.round((Date.now() - stale.startedAtMs) / 1000),
      })
      .where(eq(playEvents.id, stale.eventId))
  }

  private sweepOpen(): void {
    const cutoff = Date.now() - OPEN_EVENT_MAX_AGE_MS
    for (const [guildId, event] of this.open) {
      if (event.startedAtMs < cutoff) this.open.delete(guildId)
    }
  }
}

export const analyticsRecorder = new AnalyticsRecorder()
