import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  Colors,
  type ChatInputCommandInteraction,
} from 'discord.js'
import { Command } from '../types/command'

export default class Ping extends Command {
  data = new SlashCommandBuilder()
    .setName('ping')
    .setDescription("Check the bot's latency to Discord.")

  override cooldown = 5

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const before = Date.now()
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    const apiLatency = Date.now() - before
    const wsLatency = interaction.client.ws.ping

    const latencyColor =
      apiLatency < 100 ? Colors.Green : apiLatency < 300 ? Colors.Yellow : Colors.Red

    const embed = new EmbedBuilder()
      .setTitle('🏓 Pong!')
      .setColor(latencyColor)
      .addFields(
        { name: 'API Latency', value: `\`${apiLatency}ms\``, inline: true },
        {
          name: 'WebSocket Ping',
          value: wsLatency === -1 ? '`Calculating...`' : `\`${wsLatency}ms\``,
          inline: true,
        },
      )
      .setTimestamp()

    await interaction.editReply({ embeds: [embed] })
  }
}
