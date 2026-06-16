import { Client, Collection, GatewayIntentBits } from 'discord.js'
import { token } from './config'
import { Command } from './types/command'
import { Event } from './types/event'

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
})

client.commands = new Collection()
client.cooldowns = new Collection()

const glob = new Bun.Glob('*.ts')

for await (const file of glob.scan(`${import.meta.dir}/commands`)) {
  const CommandClass = ((await import(`./commands/${file}`)) as { default: new () => Command })
    .default
  const command = new CommandClass()
  if (command instanceof Command) {
    client.commands.set(command.data.name, command)
  } else {
    console.warn(`[WARNING] The command at ./commands/${file} does not extend Command.`)
  }
}

for await (const file of glob.scan(`${import.meta.dir}/events`)) {
  const EventClass = ((await import(`./events/${file}`)) as { default: new () => Event }).default
  const event = new EventClass()
  if (!(event instanceof Event)) {
    console.warn(`[WARNING] The event at ./events/${file} does not extend Event.`)
    continue
  }
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args))
  } else {
    client.on(event.name, (...args) => event.execute(...args))
  }
}

client.login(token)
