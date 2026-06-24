import type { VoiceBasedChannel } from 'discord.js'
import type { Player } from 'lavalink-client'
import { lavalink, toTrack } from './lavalink'
import { type PlayerSnapshot, toQueueItem } from './snapshot'
import type { Track } from '../types/track'

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

  async move(guildId: string, fromPos: number, toPos: number): Promise<boolean> {
    const player = lavalink.getPlayer(guildId)
    if (!player) return false
    const len = player.queue.tracks.length
    const from = fromPos - 1
    if (from < 0 || from >= len) return false
    const to = Math.max(0, Math.min(toPos - 1, len - 1))
    if (from === to) return true

    const removed = await player.queue.splice(from, 1)
    const track = Array.isArray(removed) ? removed[0] : removed
    if (!track) return false
    await player.queue.splice(to, 0, track)
    return true
  }

  getSnapshot(guildId: string): PlayerSnapshot | null {
    const player = lavalink.getPlayer(guildId)
    if (!player) return null
    return {
      status: player.paused ? 'paused' : 'playing',
      volume: player.volume,
      current: player.queue.current ? toQueueItem(toTrack(player.queue.current)) : null,
      queue: player.queue.tracks.map((track) => toQueueItem(toTrack(track))),
    }
  }
}

export const musicManager = new MusicManager()
