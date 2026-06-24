import { Colors, EmbedBuilder, Events, type Message } from 'discord.js'
import { Event } from '../types/event'
import { llmEnabled, llmMaxInputChars } from '../config'
import { assistant } from '../llm/Assistant'
import { ollamaClient } from '../llm/OllamaClient'
import type { AssistantResult } from '../llm/types'
import { musicService } from '../music/MusicService'
import { secondsToString } from '../music/format'

const TYPING_INTERVAL_MS = 8_000
const MENTION_PATTERN = /<@!?\d+>/g

export default class MessageCreate extends Event<typeof Events.MessageCreate> {
  name = Events.MessageCreate as const

  async execute(message: Message): Promise<void> {
    if (!llmEnabled) return
    if (message.author.bot) return
    if (!message.inGuild()) return
    if (message.reference) return

    const botId = message.client.user?.id
    if (botId === undefined || !message.mentions.users.has(botId)) return

    const prompt = message.content
      .replace(MENTION_PATTERN, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, llmMaxInputChars)

    if (prompt.length === 0) {
      await this.reply(message, 'Hi! Ask me anything, or tell me to play a song 🎵')
      return
    }

    if (ollamaClient.queueSize > 0) {
      await message.react('⏳').catch(() => undefined)
    }

    const stopTyping = this.keepTyping(message)
    try {
      const result = await assistant.ask(prompt)
      await this.dispatch(message, result)
    } catch (error) {
      console.error('[llm] failed to handle message:', error)
      await this.reply(
        message,
        '⚠️ Sorry, my brain is offline right now. Please try again in a bit.',
      )
    } finally {
      stopTyping()
    }
  }

  private async dispatch(message: Message<true>, result: AssistantResult): Promise<void> {
    switch (result.action) {
      case 'play':
        await this.handlePlay(message, result)
        break
      case 'stop':
        await this.handleStop(message, result)
        break
      case 'skip':
        await this.handleSkip(message, result)
        break
      case 'chat':
      case 'reject':
        await this.reply(message, result.reply)
        break
    }
  }

  private async handlePlay(message: Message<true>, result: AssistantResult): Promise<void> {
    const voiceChannel = message.member?.voice.channel
    if (!voiceChannel) {
      await this.reply(message, 'Join a voice channel first, then ask me to play something.')
      return
    }
    if (!result.query) {
      await this.reply(message, 'What would you like me to play?')
      return
    }

    const outcome = await musicService.playFromQuery(voiceChannel, result.query, {
      requester: { username: message.member?.displayName ?? message.author.username },
    })
    if (!outcome.ok) {
      await this.reply(message, "🔴 Sorry, I can't play live streams.")
      return
    }

    const { track, startedNow, position } = outcome

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

    await message.reply({
      content: result.reply,
      embeds: [embed],
      allowedMentions: { parse: [] },
    })
  }

  private async handleStop(message: Message<true>, result: AssistantResult): Promise<void> {
    const stopped = await musicService.stop(message.guildId)
    await this.reply(message, stopped ? result.reply : 'Nothing is playing right now.')
  }

  private async handleSkip(message: Message<true>, result: AssistantResult): Promise<void> {
    const outcome = await musicService.skip(message.guildId)
    await this.reply(message, outcome ? result.reply : 'Nothing is playing right now.')
  }

  private keepTyping(message: Message<true>): () => void {
    const send = (): void => {
      void message.channel.sendTyping().catch(() => undefined)
    }
    send()
    const timer = setInterval(send, TYPING_INTERVAL_MS)
    return () => {
      clearInterval(timer)
    }
  }

  private reply(message: Message<true>, content: string): Promise<unknown> {
    return message.reply({ content, allowedMentions: { parse: [] } })
  }
}
