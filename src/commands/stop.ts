import { SlashCommandBuilder, MessageFlags, type ChatInputCommandInteraction } from 'discord.js'
import { Command } from '../types/command'
import { musicManager } from '../music/MusicManager'

export default class Stop extends Command {
  data = new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop playback and clear the queue.')

  override cooldown = 3

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    const stopped = musicManager.stop(interaction.guildId)
    await interaction.reply({
      content: stopped
        ? '⏹️ Stopped playback and cleared the queue.'
        : 'Nothing is playing right now.',
      flags: MessageFlags.Ephemeral,
    })
  }
}
