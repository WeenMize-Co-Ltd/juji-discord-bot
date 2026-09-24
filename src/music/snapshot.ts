import { z } from 'zod'
import { resolveArtwork } from './artwork'
import type { FilterState } from './filters'
import type { Track } from '../types/track'

export const QueueItemDtoSchema = z.object({
  id: z.string(),
  entryId: z.string().optional(),
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
    entryId: track.entryId,
    title: track.title,
    author: track.author,
    thumbnail: resolveArtwork(track),
    url: track.url,
    seconds: track.durationSec,
    addedBy: track.requestedBy ?? 'unknown',
  }
}
