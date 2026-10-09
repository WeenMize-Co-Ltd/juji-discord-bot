import { and, desc, eq, sql } from 'drizzle-orm'
import { addedTracksMax } from '../config'
import { resolveArtwork } from '../music/artwork'
import type { QueueItemDto } from '../music/snapshot'
import type { Track } from '../types/track'
import { databaseClient, db } from './client'
import { addedTracks, tracks, users } from './schema'
import { upsertTrack, upsertUsers } from './upserts'

export interface AddedBy {
  id: string
  displayName: string
  avatarUrl?: string
}

class AddedTracks {
  record(guildId: string, user: AddedBy, track: Track): void {
    if (!databaseClient.enabled || !track.id) return
    void this.doRecord(guildId, user, track).catch((error: unknown) => {
      console.error('[added-tracks] record failed:', error)
    })
  }

  async list(guildId: string, discordUserId: string): Promise<QueueItemDto[]> {
    if (!databaseClient.enabled) return []
    const rows = await db
      .select({
        entryId: addedTracks.id,
        id: tracks.id,
        title: tracks.title,
        author: tracks.author,
        thumbnail: tracks.thumbnail,
        url: tracks.url,
        seconds: tracks.durationSec,
        addedBy: users.displayName,
      })
      .from(addedTracks)
      .innerJoin(tracks, eq(tracks.id, addedTracks.trackId))
      .innerJoin(users, eq(users.id, addedTracks.discordUserId))
      .where(and(eq(addedTracks.guildId, guildId), eq(addedTracks.discordUserId, discordUserId)))
      .orderBy(desc(addedTracks.addedAt), desc(addedTracks.id))
      .limit(addedTracksMax)

    return rows.map((row) => ({
      id: row.id,
      entryId: row.entryId,
      title: row.title,
      author: row.author,
      thumbnail: row.thumbnail ?? '',
      url: row.url,
      seconds: row.seconds,
      addedBy: row.addedBy,
    }))
  }

  private async doRecord(guildId: string, user: AddedBy, track: Track): Promise<void> {
    await Promise.all([
      upsertTrack(track.id, {
        title: track.title,
        author: track.author,
        url: track.url,
        thumbnail: resolveArtwork(track) || null,
        durationSec: track.durationSec,
        sourceName: track.sourceName,
      }),
      upsertUsers([{ id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl }]),
    ])

    await db
      .insert(addedTracks)
      .values({ guildId, discordUserId: user.id, trackId: track.id })
      .onConflictDoUpdate({
        target: [addedTracks.guildId, addedTracks.discordUserId, addedTracks.trackId],
        set: { addedAt: new Date() },
      })

    // Count-based retention: keep only the newest `addedTracksMax` rows for this user.
    await db.execute(sql`
      delete from ${addedTracks}
      where ${addedTracks.guildId} = ${guildId}
        and ${addedTracks.discordUserId} = ${user.id}
        and ${addedTracks.id} not in (
          select ${addedTracks.id} from ${addedTracks}
          where ${addedTracks.guildId} = ${guildId}
            and ${addedTracks.discordUserId} = ${user.id}
          order by ${addedTracks.addedAt} desc, ${addedTracks.id} desc
          limit ${addedTracksMax}
        )
    `)
  }
}

export const addedTracksRecorder = new AddedTracks()
