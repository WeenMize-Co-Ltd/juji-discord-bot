import { Events, type Client } from 'discord.js'
import { djManager } from '../dj'
import { Event } from '../types/event'

export default class Ready extends Event<typeof Events.ClientReady> {
  name = Events.ClientReady as const
  override once = true

  execute(client: Client<true>): void {
    console.log(`Ready! Logged in as ${client.user.tag}`)
    void djManager.onReady()
  }
}
