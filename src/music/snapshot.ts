import type { Track } from '../types/track'

export interface QueueItemDto {
  title: string
  thumbnail: string
  url: string
  seconds: number
  addedBy: string
}

export interface PlayerSnapshot {
  status: 'playing' | 'paused'
  volume: number
  current: QueueItemDto | null
  queue: QueueItemDto[]
}

export function toQueueItem(track: Track): QueueItemDto {
  return {
    title: track.title,
    thumbnail: track.thumbnail ?? '',
    url: track.url,
    seconds: track.durationSec,
    addedBy: track.requestedBy ?? 'unknown',
  }
}
