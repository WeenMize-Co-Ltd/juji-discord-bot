import { REST, Routes } from 'discord.js'
import { Command } from './types/command'
import { clientId, token } from './config'

const commands: unknown[] = []

const glob = new Bun.Glob('*.ts')
for await (const file of glob.scan(`${import.meta.dir}/commands`)) {
  const CommandClass = ((await import(`./commands/${file}`)) as { default: new () => Command })
    .default
  const command = new CommandClass()
  if (command instanceof Command) {
    commands.push(command.data.toJSON())
  } else {
    console.warn(`[WARNING] The command at ./commands/${file} does not extend Command.`)
  }
}

const rest = new REST().setToken(token)

console.log(`Refreshing ${commands.length} application (/) commands...`)

const data = await rest.put(Routes.applicationCommands(clientId), {
  body: commands,
})

console.log(`Successfully reloaded ${(data as unknown[]).length} application (/) commands.`)
