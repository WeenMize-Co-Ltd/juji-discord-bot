import { createReadStream } from 'node:fs'
import {
  AudioPlayerStatus,
  StreamType,
  VoiceConnectionStatus,
  createAudioResource,
  entersState,
  type AudioPlayer,
  type VoiceConnection,
} from '@discordjs/voice'
import type { QueuedTrack, Track } from '../types/track'

const PLAYING_TIMEOUT_MS = 30_000

export class GuildPlayer {
  private readonly queue: QueuedTrack[] = []
  private current: QueuedTrack | null = null
  private destroyed = false

  constructor(
    private readonly connection: VoiceConnection,
    private readonly player: AudioPlayer,
    private readonly onDestroy: () => void,
  ) {
    this.player.on(AudioPlayerStatus.Idle, () => {
      this.advance()
    })
    this.player.on('error', (error) => {
      console.error('Audio player error:', error)
      this.advance()
    })
    this.connection.on('error', (error) => {
      console.error('Voice connection error:', error)
    })
    this.connection.subscribe(this.player)
  }

  enqueue(item: QueuedTrack): { startedNow: boolean; position: number } {
    if (this.current === null) {
      this.playItem(item)
      return { startedNow: true, position: 0 }
    }
    this.queue.push(item)
    return { startedNow: false, position: this.queue.length }
  }

  stop(): void {
    this.destroy()
  }

  snapshot(): { current: Track | null; upcoming: Track[] } {
    return {
      current: this.current?.track ?? null,
      upcoming: this.queue.map((item) => item.track),
    }
  }

  private playItem(item: QueuedTrack): void {
    this.current = item
    const resource = createAudioResource(createReadStream(item.filePath), {
      inputType: StreamType.OggOpus,
    })
    this.player.play(resource)
    entersState(this.player, AudioPlayerStatus.Playing, PLAYING_TIMEOUT_MS).catch(
      (error: unknown) => {
        console.error('Track failed to start playing:', error)
        this.advance()
      },
    )
  }

  private advance(): void {
    if (this.destroyed) return
    const next = this.queue.shift()
    if (next) {
      this.playItem(next)
    } else {
      this.destroy()
    }
  }

  private destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.queue.length = 0
    this.current = null
    this.player.removeAllListeners()
    this.player.stop(true)
    if (this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      this.connection.destroy()
    }
    this.onDestroy()
  }
}
