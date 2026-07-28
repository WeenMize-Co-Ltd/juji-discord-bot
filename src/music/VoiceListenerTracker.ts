import type { VoiceState } from 'discord.js'
import { getDiscordClient } from './lavalink'
import type { ListenerDuration } from '../database'

interface ListenerState {
  displayName: string
  avatarUrl: string
  /** When the user (re)started listening, or null while not listening. */
  activeSinceMs: number | null
  accumulatedSec: number
}

interface GuildListening {
  channelId: string
  listeners: Map<string, ListenerState>
}

class VoiceListenerTracker {
  private readonly guilds = new Map<string, GuildListening>()

  onTrackStart(guildId: string, channelId: string | null): void {
    if (!channelId) {
      this.guilds.delete(guildId)
      return
    }
    const now = Date.now()
    const listeners = new Map<string, ListenerState>()
    const channel = getDiscordClient()?.channels.cache.get(channelId)
    if (channel?.isVoiceBased()) {
      for (const member of channel.members.values()) {
        if (member.user.bot || !this.notDeafened(member.voice)) continue
        listeners.set(member.id, {
          displayName: member.displayName,
          avatarUrl: member.user.displayAvatarURL({ size: 128 }),
          activeSinceMs: now,
          accumulatedSec: 0,
        })
      }
    }
    this.guilds.set(guildId, { channelId, listeners })
  }

  onVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): void {
    const state = this.guilds.get(newState.guild.id)
    if (!state) return
    const member = newState.member ?? oldState.member
    if (!member || member.user.bot) return

    const listening = newState.channelId === state.channelId && this.notDeafened(newState)
    const existing = state.listeners.get(member.id)
    const now = Date.now()

    if (listening) {
      if (existing) {
        existing.displayName = member.displayName
        existing.avatarUrl = member.user.displayAvatarURL({ size: 128 })
        existing.activeSinceMs ??= now
      } else {
        state.listeners.set(member.id, {
          displayName: member.displayName,
          avatarUrl: member.user.displayAvatarURL({ size: 128 }),
          activeSinceMs: now,
          accumulatedSec: 0,
        })
      }
    } else if (existing && existing.activeSinceMs !== null) {
      existing.accumulatedSec += (now - existing.activeSinceMs) / 1000
      existing.activeSinceMs = null
    }
  }

  endTrack(guildId: string): ListenerDuration[] {
    const state = this.guilds.get(guildId)
    this.guilds.delete(guildId)
    if (!state) return []

    const now = Date.now()
    const result: ListenerDuration[] = []
    for (const [discordUserId, listener] of state.listeners) {
      let total = listener.accumulatedSec
      if (listener.activeSinceMs !== null) total += (now - listener.activeSinceMs) / 1000
      const listenedSec = Math.round(total)
      if (listenedSec > 0) {
        result.push({
          discordUserId,
          displayName: listener.displayName,
          avatarUrl: listener.avatarUrl,
          listenedSec,
        })
      }
    }
    return result
  }

  private notDeafened(voice: VoiceState): boolean {
    return !voice.selfDeaf && !voice.serverDeaf
  }
}

export const voiceListenerTracker = new VoiceListenerTracker()
