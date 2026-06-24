import { type Client, Events } from 'discord.js'
import { LavalinkManager, type Track as LavalinkTrack, type UnresolvedTrack } from 'lavalink-client'
import { lavalinkHost, lavalinkPassword, lavalinkPort, lavalinkSecure } from '../config'
import type { Track } from '../types/track'

let discordClient: Client | null = null

export const lavalink = new LavalinkManager({
  nodes: [
    {
      id: 'main',
      host: lavalinkHost,
      port: lavalinkPort,
      authorization: lavalinkPassword,
      secure: lavalinkSecure,
    },
  ],
  sendToShard: (guildId, payload) => {
    discordClient?.guilds.cache.get(guildId)?.shard.send(payload)
  },
  autoSkip: true,
  playerOptions: {
    defaultSearchPlatform: 'ytsearch',
    onEmptyQueue: { destroyAfterMs: 0 },
    requesterTransformer: (requester) => requester,
  },
})

export function initLavalink(client: Client): void {
  discordClient = client

  client.on('raw', (packet) => {
    void lavalink.sendRawData(packet as Parameters<typeof lavalink.sendRawData>[0])
  })

  client.once(Events.ClientReady, (readyClient) => {
    void lavalink.init({ id: readyClient.user.id, username: readyClient.user.username })
  })

  lavalink.nodeManager.on('connect', (node) => {
    console.log(`[lavalink] node "${node.id}" connected`)
  })
  lavalink.nodeManager.on('error', (node, error) => {
    console.error(`[lavalink] node "${node.id}" error:`, error)
  })
  lavalink.nodeManager.on('disconnect', (node, reason) => {
    console.warn(`[lavalink] node "${node.id}" disconnected:`, reason)
  })
}

export function toTrack(track: LavalinkTrack | UnresolvedTrack): Track {
  const { info } = track
  return {
    id: info.identifier ?? '',
    title: info.title,
    url: info.uri ?? '',
    thumbnail: info.artworkUrl ?? undefined,
    durationSec: Math.round((info.duration ?? 0) / 1000),
    isLive: info.isStream ?? false,
    requestedBy: requesterName(track.requester),
  }
}

function requesterName(requester: unknown): string | undefined {
  if (typeof requester === 'string') return requester
  if (requester && typeof requester === 'object' && 'username' in requester) {
    const username = (requester as { username?: unknown }).username
    if (typeof username === 'string') return username
  }
  return undefined
}
