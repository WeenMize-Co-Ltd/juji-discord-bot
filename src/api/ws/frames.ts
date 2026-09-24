import type { FilterState } from '../../music/filters'
import type { PlayerSnapshot, QueueItemDto } from '../../music/snapshot'

export type FrameVersion = 1 | 2

interface StateData {
  currentlyPlaying: QueueItemDto | null
  queueList: QueueItemDto[]
  position: number
  timestamp: string
  status?: 'playing' | 'paused'
  volume?: number
  filters?: FilterState
}

export type WsMessage =
  | { type: 'playlist'; data: StateData }
  | { type: 'status'; data: 'playing' | 'paused' }
  | { type: 'volume'; data: number }
  | { type: 'filters'; data: FilterState }
  | { type: 'state'; data: StateData }
  | { type: 'history'; data: QueueItemDto[] }
  | { type: 'history:add'; data: QueueItemDto }
  | { type: 'alert'; data: string }

export function buildStateFrames(
  snapshot: PlayerSnapshot | null,
  version: FrameVersion,
): WsMessage[] {
  const data: StateData = {
    currentlyPlaying: snapshot?.current ?? null,
    queueList: snapshot?.queue ?? [],
    position: snapshot?.position ?? 0,
    timestamp: new Date().toISOString(),
  }

  if (version === 2) {
    if (!snapshot) return [{ type: 'state', data }]
    return [
      {
        type: 'state',
        data: {
          ...data,
          status: snapshot.status,
          volume: snapshot.volume,
          filters: snapshot.filters,
        },
      },
    ]
  }

  const frames: WsMessage[] = [{ type: 'playlist', data }]
  if (snapshot) {
    frames.push({ type: 'status', data: snapshot.status })
    frames.push({ type: 'volume', data: snapshot.volume })
    frames.push({ type: 'filters', data: snapshot.filters })
  }
  return frames
}
