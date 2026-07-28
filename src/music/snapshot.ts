import { z } from 'zod'
import { resolveArtwork } from './artwork'
import type { FilterState } from './filters'
import type { Track } from '../types/track'

/**
 * The single track shape the API and websocket return. `id` and `author` come straight
 * from Lavalink, so the web player no longer has to synthesize keys from URLs or guess
 * the artist by splitting the title.
 */
export const QueueItemDtoSchema = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string(),
  thumbnail: z.string(),
  url: z.string(),
  seconds: z.number(),
  addedBy: z.string(),
})

export type QueueItemDto = z.infer<typeof QueueItemDtoSchema>

export interface PlayerSnapshot {
  status: 'playing' | 'paused'
  position: number
  volume: number
  current: QueueItemDto | null
  queue: QueueItemDto[]
  filters: FilterState
}

export function toQueueItem(track: Track): QueueItemDto {
  return {
    id: track.id,
    title: track.title,
    author: track.author,
    thumbnail: resolveArtwork(track),
    url: track.url,
    seconds: track.durationSec,
    addedBy: track.requestedBy ?? 'unknown',
  }
}
