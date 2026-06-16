import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  Colors,
  type ChatInputCommandInteraction,
} from 'discord.js'
import { Command } from '../types/command'

export default class Help extends Command {
  data = new SlashCommandBuilder().setName('help').setDescription('List all available commands.')

  override cooldown = 5

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const commands = [...interaction.client.commands.values()].sort((a, b) =>
      a.data.name.localeCompare(b.data.name),
    )

    const embed = new EmbedBuilder()
      .setTitle('📖 Commands')
      .setColor(Colors.Blurple)
      .setDescription(
        commands
          .map((c) => {
            const cooldown = c.cooldown ? ` _(cooldown: ${c.cooldown}s)_` : ''
            return `**/${c.data.name}** — ${c.data.description}${cooldown}`
          })
          .join('\n'),
      )
      .setTimestamp()

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral })
  }
}
