import { Collection, Events, MessageFlags, type Interaction } from 'discord.js'
import { Event } from '../types/event'

const DEFAULT_COOLDOWN = 3

export default class InteractionCreate extends Event<typeof Events.InteractionCreate> {
  name = Events.InteractionCreate as const

  async execute(interaction: Interaction): Promise<void> {
    if (!interaction.isChatInputCommand()) return

    const command = interaction.client.commands.get(interaction.commandName)
    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`)
      return
    }

    const { cooldowns } = interaction.client
    const timestamps = cooldowns.get(command.data.name) ?? new Collection<string, number>()
    cooldowns.set(command.data.name, timestamps)

    const now = Date.now()
    const cooldownMs = (command.cooldown ?? DEFAULT_COOLDOWN) * 1_000

    const userTimestamp = timestamps.get(interaction.user.id)
    if (userTimestamp !== undefined) {
      const expiration = userTimestamp + cooldownMs
      if (now < expiration) {
        const expiredTimestamp = Math.round(expiration / 1_000)
        await interaction.reply({
          content: `Please wait, you are on a cooldown for \`${command.data.name}\`. You can use it again <t:${expiredTimestamp}:R>.`,
          flags: MessageFlags.Ephemeral,
        })
        return
      }
    }

    timestamps.set(interaction.user.id, now)
    setTimeout(() => timestamps.delete(interaction.user.id), cooldownMs)

    try {
      await command.execute(interaction)
    } catch (error) {
      console.error(error)
      const reply = {
        content: 'There was an error executing this command!',
        flags: MessageFlags.Ephemeral,
      } as const
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply)
      } else {
        await interaction.reply(reply)
      }
    }
  }
}
