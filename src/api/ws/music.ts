import type { ServerWebSocket } from 'bun'
import { upgradeWebSocket, websocket } from 'hono/bun'
import { HTTPException } from 'hono/http-exception'
import { analyticsRecorder } from '../../database'
import { musicHistory } from '../../music/history'
import { lavalink, toTrack } from '../../music/lavalink'
import { musicManager } from '../../music/MusicManager'
import type { Requester } from '../../music/MusicService'
import { type PlayerSnapshot, type QueueItemDto, toQueueItem } from '../../music/snapshot'
import { voiceListenerTracker } from '../../music/VoiceListenerTracker'
import { verifySupabaseJwt } from '../middleware/auth'
import { canAccessGuild } from '../middleware/guildAccess'
import type { SupabaseJwtPayload } from '../types'
import { buildStateFrames, type FrameVersion, type WsMessage } from './frames'

interface Connection {
  ws: ServerWebSocket
  version: FrameVersion
}

const connections = new Map<string, Set<Connection>>()

function subscribe(guildId: string, connection: Connection): void {
  let set = connections.get(guildId)
  if (!set) {
    set = new Set()
    connections.set(guildId, set)
  }
  set.add(connection)
}

function unsubscribe(guildId: string, ws: ServerWebSocket): void {
  const set = connections.get(guildId)
  if (!set) return
  for (const connection of set) {
    if (connection.ws === ws) {
      set.delete(connection)
      break
    }
  }
  if (set.size === 0) connections.delete(guildId)
}

function dispatchFrames(guildId: string, build: (version: FrameVersion) => WsMessage[]): void {
  const set = connections.get(guildId)
  if (!set || set.size === 0) return
  const payloads = new Map<FrameVersion, string[]>()
  for (const connection of set) {
    if (connection.ws.readyState !== WebSocket.OPEN) {
      set.delete(connection)
      continue
    }
    let serialized = payloads.get(connection.version)
    if (!serialized) {
      serialized = build(connection.version).map((message) => JSON.stringify(message))
      payloads.set(connection.version, serialized)
    }
    try {
      for (const payload of serialized) connection.ws.send(payload)
    } catch {
      set.delete(connection)
    }
  }
  if (set.size === 0) connections.delete(guildId)
}

function broadcast(guildId: string, message: WsMessage): void {
  dispatchFrames(guildId, () => [message])
}

function sendToVersion(guildId: string, version: FrameVersion, message: WsMessage): void {
  dispatchFrames(guildId, (connectionVersion) => (connectionVersion === version ? [message] : []))
}

function hasConnections(guildId: string): boolean {
  return (connections.get(guildId)?.size ?? 0) > 0
}

function sendState(guildId: string, snapshot: PlayerSnapshot | null): void {
  dispatchFrames(guildId, (version) => buildStateFrames(snapshot, version))
}

export function publishState(guildId: string, snapshot?: PlayerSnapshot | null): void {
  if (!hasConnections(guildId)) return
  sendState(guildId, snapshot === undefined ? musicManager.getSnapshot(guildId) : snapshot)
}

const pendingGuilds = new Set<string>()
let flushTimer: ReturnType<typeof setTimeout> | null = null

function flushState(): void {
  flushTimer = null
  const guilds = [...pendingGuilds]
  pendingGuilds.clear()
  for (const guildId of guilds) {
    if (hasConnections(guildId)) sendState(guildId, musicManager.getSnapshot(guildId))
  }
}

export function scheduleState(guildId: string): void {
  if (!hasConnections(guildId)) return
  pendingGuilds.add(guildId)
  flushTimer ??= setTimeout(flushState, 0)
}

async function broadcastHistory(guildId: string, added: QueueItemDto): Promise<void> {
  const set = connections.get(guildId)
  if (!set || set.size === 0) return

  const versions = new Set<FrameVersion>()
  for (const connection of set) versions.add(connection.version)

  if (versions.has(1)) {
    const items = await musicHistory.list(guildId)
    sendToVersion(guildId, 1, { type: 'history', data: items })
  }
  if (versions.has(2)) {
    sendToVersion(guildId, 2, { type: 'history:add', data: added })
  }
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

  const version: FrameVersion = c.req.query('v') === '2' ? 2 : 1

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
      subscribe(guildId, { ws: raw, version })
      for (const message of buildStateFrames(musicManager.getSnapshot(guildId), version)) {
        raw.send(JSON.stringify(message))
      }
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
      const item = toQueueItem(mapped)
      void musicHistory
        .record(player.guildId, item)
        .then(() => broadcastHistory(player.guildId, item))
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
    scheduleState(player.guildId)
  })
  lavalink.on('trackEnd', (player, _track, payload) => {
    const listeners = voiceListenerTracker.endTrack(player.guildId)
    analyticsRecorder.recordEnd(player.guildId, payload.reason, listeners)
    scheduleState(player.guildId)
  })
  lavalink.on('trackError', (player, _track, payload) => {
    console.error(
      `[lavalink] track error in guild ${player.guildId}:`,
      payload.exception?.message ?? payload.error,
    )
  })
  lavalink.on('queueEnd', (player) => {
    scheduleState(player.guildId)
  })
  lavalink.on('playerDestroy', (player) => {
    const listeners = voiceListenerTracker.endTrack(player.guildId)
    analyticsRecorder.recordEnd(player.guildId, 'stopped', listeners)
    scheduleState(player.guildId)
  })
}

export { websocket }
