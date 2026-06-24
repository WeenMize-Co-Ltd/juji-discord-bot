import type { VoiceBasedChannel } from 'discord.js'
import type { Player } from 'lavalink-client'
import { MusicManager, musicManager } from './MusicManager'
import { toTrack } from './lavalink'
import type { Track } from '../types/track'

export interface Requester {
  username: string
}

export type PlayResult =
  | { ok: true; track: Track; startedNow: boolean; position: number }
  | { ok: false; reason: 'live-unsupported' }
  | { ok: false; reason: 'no-player' }

interface PlayOptions {
  requester?: Requester
  onResolved?: (track: Track) => void | Promise<void>
}

export class MusicService {
  constructor(private readonly manager: MusicManager) { }

  async playFromQuery(
    channel: VoiceBasedChannel,
    query: string,
    options: PlayOptions = {},
  ): Promise<PlayResult> {
    const player = await this.manager.getOrCreatePlayer(channel)
    return this.enqueue(player, query, options, true)
  }

  async addToActivePlayer(
    guildId: string,
    query: string,
    requester: Requester,
  ): Promise<PlayResult> {
    const player = this.manager.getPlayer(guildId)
    if (!player) return { ok: false, reason: 'no-player' }
    return this.enqueue(player, query, { requester }, false)
  }

  private async enqueue(
    player: Player,
    query: string,
    { requester, onResolved }: PlayOptions,
    leaveOnIdleLive: boolean,
  ): Promise<PlayResult> {
    const result = await player.search({ query }, requester)
    const first = result.tracks[0]
    if (result.loadType === 'error' || result.loadType === 'empty' || !first) {
      throw new Error(`No results found for: ${query}`)
    }

    const track = toTrack(first)
    if (track.isLive) {
      if (leaveOnIdleLive && !player.queue.current) await player.destroy()
      return { ok: false, reason: 'live-unsupported' }
    }

    await onResolved?.(track)

    const startedNow = !player.queue.current
    await player.queue.add(first)
    if (startedNow) await player.play()

    const position = startedNow ? 0 : player.queue.tracks.length
    return { ok: true, track, startedNow, position }
  }

  stop(guildId: string): Promise<boolean> {
    return this.manager.stop(guildId)
  }

  skip(guildId: string): Promise<{ skipped: Track; next: Track | null } | null> {
    return this.manager.skip(guildId)
  }
}

export const musicService = new MusicService(musicManager)
