import {
  SlashCommandBuilder,
  Collection,
  type ChatInputCommandInteraction,
  type SlashCommandOptionsOnlyBuilder,
} from 'discord.js'

export abstract class Command {
  abstract data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder
  cooldown?: number
  abstract execute(interaction: ChatInputCommandInteraction): Promise<void>
}

declare module 'discord.js' {
  interface Client {
    commands: Collection<string, Command>
  }
}
