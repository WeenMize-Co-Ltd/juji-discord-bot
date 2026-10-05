import type { VoiceBasedChannel } from 'discord.js'
import type {
  Player,
  Track as LavalinkTrack,
  UnresolvedTrack as LavalinkUnresolvedTrack,
} from 'lavalink-client'
import {
  applyFilterPatch,
  clearAllFilters,
  type FilterPatch,
  type FilterState,
  toFilterState,
} from './filters'
import { getDiscordClient, lavalink, toTrack } from './lavalink'
import { type PlayerSnapshot, toQueueItem } from './snapshot'
import type { Requester } from './MusicService'
import type { Track } from '../types/track'

/** What Lavalink's queue actually holds — resolved or not-yet-resolved tracks. */
type QueuedTrack = LavalinkTrack | LavalinkUnresolvedTrack

export class MusicManager {
  getPlayer(guildId: string): Player | undefined {
    return lavalink.getPlayer(guildId)
  }

  async getOrCreatePlayer(channel: VoiceBasedChannel): Promise<Player> {
    const existing = lavalink.getPlayer(channel.guild.id)
    if (existing) return existing

    const player = lavalink.createPlayer({
      guildId: channel.guild.id,
      voiceChannelId: channel.id,
      selfDeaf: true,
    })
    await player.connect()
    return player
  }

  async resolveUserVoiceChannel(
    guildId: string,
    userId: string,
  ): Promise<VoiceBasedChannel | null> {
    const client = getDiscordClient()
    if (!client) return null
    const guild =
      client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId).catch(() => null))
    if (!guild) return null
    const member = await guild.members.fetch(userId).catch(() => null)
    return member?.voice.channel ?? null
  }

  async stop(guildId: string): Promise<boolean> {
    const player = lavalink.getPlayer(guildId)
    if (!player) return false
    await player.destroy()
    return true
  }

  async skip(guildId: string): Promise<{ skipped: Track; next: Track | null } | null> {
    const player = lavalink.getPlayer(guildId)
    if (!player?.queue.current) return null

    const skipped = toTrack(player.queue.current)
    const upcoming = player.queue.tracks[0]
    const next = upcoming ? toTrack(upcoming) : null

    if (next) {
      await player.skip()
    } else {
      await player.destroy()
    }
    return { skipped, next }
  }

  async jumpTo(guildId: string, position: number): Promise<{ skipped: Track; next: Track } | null> {
    const player = lavalink.getPlayer(guildId)
    if (!player?.queue.current) return null
    const index = position - 1
    if (index < 0 || index >= player.queue.tracks.length) return null

    const skipped = toTrack(player.queue.current)
    const target = player.queue.tracks[index]
    if (!target) return null
    // `skip` takes the 1-based queue position (it splices `position - 1` tracks off the
    // front, then advances), so `position` is passed through while `index` is 0-based.
    await player.skip(position)
    return { skipped, next: toTrack(target) }
  }

  async setPaused(guildId: string, paused: boolean): Promise<boolean> {
    const player = lavalink.getPlayer(guildId)
    if (!player) return false
    if (paused && !player.paused) await player.pause()
    else if (!paused && player.paused) await player.resume()
    return true
  }

  async setVolume(guildId: string, volume: number): Promise<boolean> {
    const player = lavalink.getPlayer(guildId)
    if (!player) return false
    await player.setVolume(Math.max(0, Math.min(100, Math.round(volume))))
    return true
  }

  async removeAt(guildId: string, position: number): Promise<boolean> {
    const player = lavalink.getPlayer(guildId)
    if (!player) return false
    const index = position - 1
    if (index < 0 || index >= player.queue.tracks.length) return false
    await player.queue.splice(index, 1)
    return true
  }

  async move(
    guildId: string,
    fromPos: number,
    toPos: number,
    requester?: Requester,
  ): Promise<boolean> {
    const player = lavalink.getPlayer(guildId)
    if (!player) return false
    const from = fromPos - 1
    if (from < 0 || from >= player.queue.tracks.length) return false
    if (from === Math.min(toPos - 1, player.queue.tracks.length - 1)) return true

    // `Queue.splice` is typed `any` upstream; pin the one shape it actually returns.
    const removed = (await player.queue.splice(from, 1)) as QueuedTrack | QueuedTrack[] | undefined
    const track = Array.isArray(removed) ? removed[0] : removed
    if (!track) return false

    if (requester) track.requester = requester

    const to = Math.max(0, Math.min(toPos - 1, player.queue.tracks.length))
    await player.queue.splice(to, 0, track)
    return true
  }

  getFilterState(guildId: string): FilterState | null {
    const player = lavalink.getPlayer(guildId)
    return player ? toFilterState(player) : null
  }

  async applyFilters(guildId: string, patch: FilterPatch): Promise<FilterState | null> {
    const player = lavalink.getPlayer(guildId)
    if (!player) return null
    await applyFilterPatch(player, patch)
    return toFilterState(player)
  }

  async clearFilters(guildId: string): Promise<boolean> {
    const player = lavalink.getPlayer(guildId)
    if (!player) return false
    await clearAllFilters(player)
    return true
  }

  getSnapshot(guildId: string): PlayerSnapshot | null {
    const player = lavalink.getPlayer(guildId)
    if (!player) return null
    return {
      status: player.paused ? 'paused' : 'playing',
      position: player.queue.current ? Math.round(player.position / 1000) : 0,
      volume: player.volume,
      current: player.queue.current ? toQueueItem(toTrack(player.queue.current)) : null,
      queue: player.queue.tracks.map((track) => toQueueItem(toTrack(track))),
      filters: toFilterState(player),
    }
  }
}

export const musicManager = new MusicManager()
