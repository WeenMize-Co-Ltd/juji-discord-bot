import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  Colors,
  type ChatInputCommandInteraction,
} from 'discord.js'
import { Command } from '../types/command'
import { ytDlpService } from '../music/YtDlpService'
import { musicManager } from '../music/MusicManager'
import { secondsToString } from '../music/format'

export default class Play extends Command {
  data = new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song from a YouTube URL or search term.')
    .addStringOption((option) =>
      option.setName('query').setDescription('A YouTube URL or search term').setRequired(true),
    )

  override cooldown = 3

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    const voiceChannel = interaction.member.voice.channel
    if (!voiceChannel) {
      await interaction.reply({
        content: 'You need to be in a voice channel to play music.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    const query = interaction.options.getString('query', true)
    await interaction.deferReply()

    const track = await ytDlpService.resolveTrack(query)
    await interaction.editReply({ content: `⏳ Downloading **${track.title}**…` })

    const filePath = await ytDlpService.downloadTrack(track)
    const { startedNow, position } = musicManager.enqueue(voiceChannel, { track, filePath })

    const embed = new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setAuthor({ name: startedNow ? '▶️ Now playing' : `➕ Added to queue (#${position})` })
      .setTitle(track.title)
      .setURL(track.url)
      .setTimestamp()

    if (track.thumbnail) embed.setThumbnail(track.thumbnail)
    if (track.durationSec > 0) {
      embed.addFields({ name: 'Duration', value: secondsToString(track.durationSec), inline: true })
    }

    await interaction.editReply({ content: '', embeds: [embed] })
  }
}
