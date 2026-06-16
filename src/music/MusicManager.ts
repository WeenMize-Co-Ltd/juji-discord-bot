import { createAudioPlayer, joinVoiceChannel } from '@discordjs/voice'
import type { VoiceBasedChannel } from 'discord.js'
import { GuildPlayer } from './GuildPlayer'
import type { QueuedTrack, Track } from '../types/track'

export class MusicManager {
  private readonly players = new Map<string, GuildPlayer>()

  enqueue(
    channel: VoiceBasedChannel,
    item: QueuedTrack,
  ): { startedNow: boolean; position: number } {
    const guildId = channel.guild.id
    let player = this.players.get(guildId)

    if (!player) {
      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: true,
      })
      player = new GuildPlayer(connection, createAudioPlayer(), () => {
        this.players.delete(guildId)
      })
      this.players.set(guildId, player)
    }

    return player.enqueue(item)
  }

  stop(guildId: string): boolean {
    const player = this.players.get(guildId)
    if (!player) return false
    player.stop()
    return true
  }

  snapshot(guildId: string): { current: Track | null; upcoming: Track[] } | null {
    return this.players.get(guildId)?.snapshot() ?? null
  }
}

export const musicManager = new MusicManager()
