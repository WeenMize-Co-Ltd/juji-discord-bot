import type { ServerWebSocket } from 'bun'
import { upgradeWebSocket, websocket } from 'hono/bun'
import { HTTPException } from 'hono/http-exception'
import { analyticsRecorder } from '../../database'
import { musicHistory } from '../../music/history'
import { lavalink, toTrack } from '../../music/lavalink'
import type { FilterState } from '../../music/filters'
import { musicManager } from '../../music/MusicManager'
import type { Requester } from '../../music/MusicService'
import { type QueueItemDto, toQueueItem } from '../../music/snapshot'
import { voiceListenerTracker } from '../../music/VoiceListenerTracker'
import { verifySupabaseJwt } from '../middleware/auth'
import { canAccessGuild } from '../middleware/guildAccess'
import type { SupabaseJwtPayload } from '../types'

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
  | { type: 'filters'; data: FilterState }
  | { type: 'history'; data: QueueItemDto[] }
  | { type: 'alert'; data: string }

const connections = new Map<string, Set<ServerWebSocket>>()

function subscribe(guildId: string, ws: ServerWebSocket): void {
  let set = connections.get(guildId)
  if (!set) {
    set = new Set()
    connections.set(guildId, set)
  }
  set.add(ws)
}

function unsubscribe(guildId: string, ws: ServerWebSocket): void {
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
    if (ws.readyState !== WebSocket.OPEN) {
      set.delete(ws)
      continue
    }
    try {
      ws.send(payload)
    } catch {
      set.delete(ws)
    }
  }
  if (set.size === 0) connections.delete(guildId)
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
    frames.push({ type: 'filters', data: snapshot.filters })
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

  let payload: SupabaseJwtPayload
  try {
    payload = await verifySupabaseJwt(token)
  } catch {
    throw new HTTPException(401, { message: 'invalid or expired token' })
  }

  if (!(await canAccessGuild(guildId, payload.user_metadata?.provider_id))) {
    throw new HTTPException(403, { message: 'you do not have access to this guild' })
  }

  return {
    onOpen(_event, ws) {
      const raw = ws.raw as ServerWebSocket
      subscribe(guildId, raw)
      for (const frame of stateFrames(guildId)) raw.send(JSON.stringify(frame))
      void musicHistory
        .list(guildId)
        .then((data) => {
          raw.send(JSON.stringify({ type: 'history', data }))
        })
        .catch(() => {
          /* best-effort: history is non-critical for the initial frame */
        })
    },
    onClose(_event, ws) {
      unsubscribe(guildId, ws.raw as ServerWebSocket)
    },
  }
})

function toRequester(value: unknown): Partial<Requester> {
  return typeof value === 'object' && value !== null ? value : {}
}

export function initMusicEvents(): void {
  lavalink.on('trackStart', (player, track) => {
    if (track) {
      const mapped = toTrack(track)
      void musicHistory
        .record(player.guildId, toQueueItem(mapped))
        .then(() => broadcastHistory(player.guildId))
        .catch((error: unknown) => {
          console.error('[history] failed to record/broadcast track:', error)
        })

      const requester = toRequester(track.requester)
      analyticsRecorder.recordPlay(player.guildId, player.voiceChannelId ?? null, mapped, {
        discordUserId: requester.discordUserId,
        displayName: requester.username ?? 'unknown',
        query: requester.query,
        requestSource: requester.requestSource ?? 'auto-dj',
      })
      voiceListenerTracker.onTrackStart(player.guildId, player.voiceChannelId ?? null)
    }
    broadcastState(player.guildId)
  })
  lavalink.on('trackEnd', (player, _track, payload) => {
    const listeners = voiceListenerTracker.endTrack(player.guildId)
    analyticsRecorder.recordEnd(player.guildId, payload.reason, listeners)
    broadcastState(player.guildId)
  })
  lavalink.on('trackError', (player, _track, payload) => {
    console.error(
      `[lavalink] track error in guild ${player.guildId}:`,
      payload.exception?.message ?? payload.error,
    )
  })
  lavalink.on('queueEnd', (player) => {
    broadcastState(player.guildId)
  })
  lavalink.on('playerDestroy', (player) => {
    const listeners = voiceListenerTracker.endTrack(player.guildId)
    analyticsRecorder.recordEnd(player.guildId, 'stopped', listeners)
    broadcastState(player.guildId)
  })
}

export { websocket }
