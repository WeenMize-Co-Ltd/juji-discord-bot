import { SlashCommandBuilder, EmbedBuilder, MessageFlags, Colors } from 'discord.js'
import type { Command } from '../types/command'

const help: Command = {
  data: new SlashCommandBuilder().setName('help').setDescription('List all available commands.'),
  cooldown: 5,
  async execute(interaction) {
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
  },
}

export default help
