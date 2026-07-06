import type { GuildBasedChannel, VoiceBasedChannel, VoiceState } from 'discord.js'
import { eq } from 'drizzle-orm'
import type { Player } from 'lavalink-client'
import { analyticsQueries, databaseClient, db, type TopTrack } from '../database'
import { guildDjConfigs } from '../database/schema'
import { getDiscordClient, lavalink } from '../music/lavalink'
import { musicManager } from '../music/MusicManager'
import { musicService, type Requester } from '../music/MusicService'

/** How many upcoming tracks to keep queued so the player never auto-destroys on an empty queue. */
const QUEUE_BUFFER = 5
/** Safety cap on how many of the guild's played tracks are loaded into the DJ's random pool. */
const POOL_LIMIT = 500

const DJ_REQUESTER: Requester = { username: 'DJ', requestSource: 'auto-dj' }

interface DjConfig {
  voiceChannelId: string
  enabled: boolean
}

interface DjSession {
  channelId: string
  tracks: TopTrack[]
  refilling: boolean
}

export type SetChannelResult = { ok: true } | { ok: false; reason: 'not-found' | 'not-voice' }

export interface DjStatus {
  voiceChannelId: string
  enabled: boolean
  playing: boolean
}

class DjManager {
  private readonly configs = new Map<string, DjConfig>()
  private readonly sessions = new Map<string, DjSession>()

  async setChannel(guildId: string, channelId: string): Promise<SetChannelResult> {
    const channel = await this.resolveChannel(guildId, channelId)
    if (!channel) return { ok: false, reason: 'not-found' }
    if (!channel.isVoiceBased()) return { ok: false, reason: 'not-voice' }

    this.configs.set(guildId, { voiceChannelId: channelId, enabled: true })
    if (databaseClient.enabled) {
      await db
        .insert(guildDjConfigs)
        .values({ guildId, voiceChannelId: channelId, enabled: true })
        .onConflictDoUpdate({
          target: guildDjConfigs.guildId,
          set: { voiceChannelId: channelId, enabled: true, updatedAt: new Date() },
        })
    }
    await this.maybeStart(guildId)
    return { ok: true }
  }

  async disable(guildId: string): Promise<void> {
    const config = this.configs.get(guildId)
    if (config) this.configs.set(guildId, { ...config, enabled: false })
    if (databaseClient.enabled) {
      await db
        .update(guildDjConfigs)
        .set({ enabled: false, updatedAt: new Date() })
        .where(eq(guildDjConfigs.guildId, guildId))
    }
    await this.stop(guildId)
  }

  getConfig(guildId: string): DjStatus | null {
    const config = this.configs.get(guildId)
    if (!config) return null
    return { ...config, playing: this.sessions.has(guildId) }
  }

  async loadConfigs(): Promise<void> {
    if (!databaseClient.enabled) return
    const rows = await db.select().from(guildDjConfigs)
    this.configs.clear()
    for (const row of rows) {
      this.configs.set(row.guildId, { voiceChannelId: row.voiceChannelId, enabled: row.enabled })
    }
  }

  async onReady(): Promise<void> {
    await this.loadConfigs()
    for (const [guildId, config] of this.configs) {
      if (config.enabled) await this.maybeStart(guildId)
    }
  }

  onVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): void {
    const guildId = newState.guild.id
    const config = this.configs.get(guildId)
    if (!config?.enabled) return
    if (
      oldState.channelId !== config.voiceChannelId &&
      newState.channelId !== config.voiceChannelId
    ) {
      return
    }
    void this.reconcile(guildId, config.voiceChannelId)
  }

  clearSession(guildId: string): void {
    this.sessions.delete(guildId)
  }

  onTrackStart(player: Player): void {
    if (!this.sessions.has(player.guildId)) return
    void this.topUp(player.guildId)
  }

  private async reconcile(guildId: string, channelId: string): Promise<void> {
    const humans = await this.countHumansById(guildId, channelId)
    if (humans > 0) {
      await this.maybeStart(guildId)
    } else if (this.sessions.has(guildId)) {
      await this.stop(guildId)
    }
  }

  private async maybeStart(guildId: string): Promise<void> {
    const config = this.configs.get(guildId)
    if (!config?.enabled || this.sessions.has(guildId)) return

    const session: DjSession = {
      channelId: config.voiceChannelId,
      tracks: [],
      refilling: false,
    }
    this.sessions.set(guildId, session)

    try {
      const channel = await this.resolveChannel(guildId, config.voiceChannelId)
      if (!channel?.isVoiceBased() || this.countHumans(channel) === 0) {
        this.sessions.delete(guildId)
        return
      }

      const tracks = await analyticsQueries.playedTracks(guildId, POOL_LIMIT)
      const first = this.pickRandom(tracks)
      if (!first) {
        this.sessions.delete(guildId)
        return
      }
      session.tracks = tracks
      session.channelId = channel.id

      const result = await musicService.playFromQuery(channel, first.url, {
        requester: DJ_REQUESTER,
      })
      if (!result.ok) {
        this.sessions.delete(guildId)
        await musicManager.stop(guildId)
        return
      }
      await this.topUp(guildId)
    } catch (error) {
      console.error('[dj] failed to start session:', error)
      this.sessions.delete(guildId)
    }
  }

  private async topUp(guildId: string): Promise<void> {
    const session = this.sessions.get(guildId)
    if (!session || session.refilling || session.tracks.length === 0) return
    const player = musicManager.getPlayer(guildId)
    if (!player) return

    session.refilling = true
    try {
      let attempts = 0
      while (player.queue.tracks.length < QUEUE_BUFFER && attempts < session.tracks.length) {
        const track = this.pickRandom(session.tracks)
        attempts++
        if (!track) break
        try {
          await musicService.addOrSummon(guildId, track.url, DJ_REQUESTER)
        } catch (error) {
          console.error('[dj] failed to enqueue track:', error)
        }
      }
    } finally {
      session.refilling = false
    }
  }

  private pickRandom(tracks: TopTrack[]): TopTrack | undefined {
    return tracks[Math.floor(Math.random() * tracks.length)]
  }

  private async stop(guildId: string): Promise<void> {
    this.sessions.delete(guildId)
    await musicManager.stop(guildId)
  }

  private async resolveChannel(
    guildId: string,
    channelId: string,
  ): Promise<GuildBasedChannel | null> {
    const client = getDiscordClient()
    if (!client) return null
    const guild =
      client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId).catch(() => null))
    if (!guild) return null
    return (
      guild.channels.cache.get(channelId) ??
      (await guild.channels.fetch(channelId).catch(() => null))
    )
  }

  private countHumans(channel: VoiceBasedChannel): number {
    return channel.members.filter((member) => !member.user.bot).size
  }

  private async countHumansById(guildId: string, channelId: string): Promise<number> {
    const channel = await this.resolveChannel(guildId, channelId)
    if (!channel?.isVoiceBased()) return 0
    return this.countHumans(channel)
  }

  async listVoiceChannels(guildId: string): Promise<{ id: string; name: string }[]> {
    const client = getDiscordClient()
    if (!client) return []
    const guild =
      client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId).catch(() => null))
    if (!guild) return []
    const channels = await guild.channels.fetch().catch(() => null)
    if (!channels) return []
    return [...channels.values()]
      .filter((channel): channel is VoiceBasedChannel => channel?.isVoiceBased() ?? false)
      .map((channel) => ({ id: channel.id, name: channel.name }))
  }
}

export const djManager = new DjManager()

export function initDj(): void {
  lavalink.on('trackStart', (player) => {
    djManager.onTrackStart(player)
  })
  lavalink.on('playerDestroy', (player) => {
    djManager.clearSession(player.guildId)
  })
}
