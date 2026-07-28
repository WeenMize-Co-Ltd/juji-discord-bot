import type {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  SlashCommandOptionsOnlyBuilder,
} from 'discord.js'

export abstract class Command {
  abstract data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder
  cooldown?: number
  abstract execute(interaction: ChatInputCommandInteraction): Promise<void>
}

// `Client.commands` is augmented once, in ./discord.ts, alongside `cooldowns`.
