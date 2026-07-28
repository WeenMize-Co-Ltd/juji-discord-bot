import { Client, type ClientEvents, Collection, GatewayIntentBits } from 'discord.js'
import { token } from './config'
import { loadCommands } from './loader'
import { initLavalink } from './music/lavalink'
import { Event } from './types/event'

export async function startBot(): Promise<Client> {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  })

  client.commands = new Collection()
  client.cooldowns = new Collection()

  initLavalink(client)

  for (const command of await loadCommands()) {
    client.commands.set(command.data.name, command)
  }

  const glob = new Bun.Glob('*.ts')

  for await (const file of glob.scan(`${import.meta.dir}/events`)) {
    const EventClass = ((await import(`./events/${file}`)) as { default: new () => Event }).default
    const event = new EventClass()
    if (!(event instanceof Event)) {
      console.warn(`[WARNING] The event at ./events/${file} does not extend Event.`)
      continue
    }
    // discord.js ignores the promise an async handler returns, so a rejection would
    // otherwise escape as an unhandled rejection. Await and log it here instead.
    const run = (...args: ClientEvents[keyof ClientEvents]): void => {
      void (async () => {
        try {
          await event.execute(...args)
        } catch (error) {
          console.error(`[event] "${event.name}" handler failed:`, error)
        }
      })()
    }

    if (event.once) {
      client.once(event.name, run)
    } else {
      client.on(event.name, run)
    }
  }

  await client.login(token)
  return client
}
