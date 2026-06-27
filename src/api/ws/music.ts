import { createBunWebSocket } from 'hono/bun'
import { HTTPException } from 'hono/http-exception'
import type { WSContext } from 'hono/ws'
import { musicHistory } from '../../music/history'
import { lavalink, toTrack } from '../../music/lavalink'
import { musicManager } from '../../music/MusicManager'
import { type QueueItemDto, toQueueItem } from '../../music/snapshot'
import { verifySupabaseJwt } from '../middleware/auth'

const { upgradeWebSocket, websocket } = createBunWebSocket()

type WsMessage =
  | {
      type: 'playlist'
      data: {
        currentlyPlaying: QueueItemDto | null
        queueList: QueueItemDto[]
        position: number
        timestamp: string
      }
    }
  | { type: 'status'; data: 'playing' | 'paused' }
  | { type: 'volume'; data: number }
  | { type: 'history'; data: QueueItemDto[] }
  | { type: 'alert'; data: string }

const connections = new Map<string, Set<WSContext>>()

function subscribe(guildId: string, ws: WSContext): void {
  let set = connections.get(guildId)
  if (!set) {
    set = new Set()
    connections.set(guildId, set)
  }
  set.add(ws)
}

function unsubscribe(guildId: string, ws: WSContext): void {
  const set = connections.get(guildId)
  if (!set) return
  set.delete(ws)
  if (set.size === 0) connections.delete(guildId)
}

function broadcast(guildId: string, message: WsMessage): void {
  const set = connections.get(guildId)
  if (!set || set.size === 0) return
  const payload = JSON.stringify(message)
  for (const ws of set) {
    try {
      ws.send(payload)
    } catch {
      /* best-effort: ignore sends to a closed socket */
    }
  }
}

function stateFrames(guildId: string): WsMessage[] {
  const snapshot = musicManager.getSnapshot(guildId)
  const frames: WsMessage[] = [
    {
      type: 'playlist',
      data: {
        currentlyPlaying: snapshot?.current ?? null,
        queueList: snapshot?.queue ?? [],
        position: snapshot?.position ?? 0,
        timestamp: new Date().toISOString(),
      },
    },
  ]
  if (snapshot) {
    frames.push({ type: 'status', data: snapshot.status })
    frames.push({ type: 'volume', data: snapshot.volume })
  }
  return frames
}

export function broadcastState(guildId: string): void {
  for (const frame of stateFrames(guildId)) broadcast(guildId, frame)
}

async function broadcastHistory(guildId: string): Promise<void> {
  broadcast(guildId, { type: 'history', data: await musicHistory.list(guildId) })
}

export function broadcastAlert(guildId: string, message: string): void {
  broadcast(guildId, { type: 'alert', data: message })
}

export const upgradeMusicWs = upgradeWebSocket(async (c) => {
  const guildId = c.req.query('guild_id')
  const token = c.req.query('token')
  if (!guildId || !token) {
    throw new HTTPException(400, { message: 'guild_id and token query params are required' })
  }
  try {
    await verifySupabaseJwt(token)
  } catch {
    throw new HTTPException(401, { message: 'invalid or expired token' })
  }

  return {
    onOpen(_event, ws) {
      subscribe(guildId, ws)
      for (const frame of stateFrames(guildId)) ws.send(JSON.stringify(frame))
      void musicHistory
        .list(guildId)
        .then((data) => ws.send(JSON.stringify({ type: 'history', data })))
        .catch(() => {
          /* best-effort: history is non-critical for the initial frame */
        })
    },
    onClose(_event, ws) {
      unsubscribe(guildId, ws)
    },
  }
})

export function initMusicEvents(): void {
  lavalink.on('trackStart', (player, track) => {
    if (track) {
      void musicHistory
        .record(player.guildId, toQueueItem(toTrack(track)))
        .then(() => broadcastHistory(player.guildId))
        .catch((error: unknown) => {
          console.error('[history] failed to record/broadcast track:', error)
        })
    }
    broadcastState(player.guildId)
  })
  lavalink.on('trackEnd', (player) => broadcastState(player.guildId))
  lavalink.on('queueEnd', (player) => broadcastState(player.guildId))
  lavalink.on('playerDestroy', (player) => broadcastState(player.guildId))
}

export { websocket }
