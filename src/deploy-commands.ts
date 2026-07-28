import { REST, Routes } from 'discord.js'
import { clientId, token } from './config'
import { loadCommands } from './loader'

const commands = (await loadCommands()).map((command) => command.data.toJSON())

const rest = new REST().setToken(token)

console.log(`Refreshing ${commands.length} application (/) commands...`)

const data = await rest.put(Routes.applicationCommands(clientId), {
  body: commands,
})

console.log(`Successfully reloaded ${(data as unknown[]).length} application (/) commands.`)
