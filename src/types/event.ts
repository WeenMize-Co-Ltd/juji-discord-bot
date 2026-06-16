import type { ClientEvents } from 'discord.js'

export abstract class Event<K extends keyof ClientEvents = keyof ClientEvents> {
  abstract name: K
  once = false
  abstract execute(...args: ClientEvents[K]): void | Promise<void>
}
