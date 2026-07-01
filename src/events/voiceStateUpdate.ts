import { Events, type VoiceState } from 'discord.js'
import { djManager } from '../dj'
import { voiceListenerTracker } from '../music/VoiceListenerTracker'
import { Event } from '../types/event'

export default class VoiceStateUpdate extends Event<typeof Events.VoiceStateUpdate> {
  name = Events.VoiceStateUpdate as const

  execute(oldState: VoiceState, newState: VoiceState): void {
    voiceListenerTracker.onVoiceStateUpdate(oldState, newState)
    djManager.onVoiceStateUpdate(oldState, newState)
  }
}
