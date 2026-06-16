# juji-discord-bot

A Discord bot built with [discord.js](https://discord.js.org) v14, running on the [Bun](https://bun.com) runtime. Commands and events are loaded automatically from the filesystem, so adding new functionality is just a matter of dropping a file in the right folder.

## Commands

| Command         | Description                                                                |
| --------------- | -------------------------------------------------------------------------- |
| `/ping`         | Check the bot's latency to Discord.                                        |
| `/help`         | List all available commands.                                               |
| `/play <query>` | Play a song from a YouTube URL or search term in your voice channel.       |
| `/stop`         | Stop playback and clear the queue.                                         |

The music player joins the voice channel you're in, downloads audio with [yt-dlp](https://github.com/yt-dlp/yt-dlp), and queues tracks per server — `/play` while something is already playing adds to the queue instead of interrupting it.

## Prerequisites

- [Bun](https://bun.com) installed
- A Discord application with a bot token ([Discord Developer Portal](https://discord.com/developers/applications))
- For the music player (`/play`, `/stop`):
  - [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) on your `PATH` (e.g. `brew install yt-dlp`)
  - [Node.js](https://nodejs.org) available — yt-dlp uses it to solve YouTube signatures (`--js-runtime node`)
  - ffmpeg is bundled automatically via the `ffmpeg-static` dependency, so no separate install is needed

## Setup

1. Install dependencies:

   ```sh
   bun install
   ```

2. Create a `.env` file in the project root with your bot credentials:

   ```sh
   DISCORD_TOKEN=your-bot-token
   DISCORD_CLIENT_ID=your-application-client-id

   # Optional (music player):
   # MUSIC_CACHE_DIR=./music_cache       # where downloaded audio is cached (default: ./music_cache)
   # YTDLP_COOKIES_FILE=./cookies.txt     # cookies for age-restricted/region-locked videos
   ```

   `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` are required and validated at startup. If `YTDLP_COOKIES_FILE` is not present, yt-dlp falls back to reading cookies from your local Chrome profile.

3. Register the slash commands with Discord:

   ```sh
   bun run deploy
   ```

4. Start the bot:

   ```sh
   bun run start
   ```

## Scripts

| Command                | Description                                                              |
| ---------------------- | ------------------------------------------------------------------------ |
| `bun run start`        | Start the bot.                                                           |
| `bun run deploy`       | Register/refresh slash commands with Discord's API.                      |
| `bun run lint`         | Lint `src/` with ESLint.                                                 |
| `bun run format`       | Format `src/` with Prettier.                                            |
| `bun run format:check` | Check formatting without writing changes.                                |

> Re-run `bun run deploy` whenever you change a command's name, description, or options.

## Deployment (Docker)

The repo ships a multi-stage [Dockerfile](Dockerfile) (based on Bun's official image) and a [docker-compose.yml](docker-compose.yml) for running on a Linux server. The image installs `yt-dlp`, `ffmpeg`, `nodejs`, and `python3` so the music player works out of the box.

1. Create a `.env` file next to `docker-compose.yml` with your credentials:

   ```sh
   DISCORD_TOKEN=your-bot-token
   DISCORD_CLIENT_ID=your-application-client-id
   ```

2. (Optional) To play age-restricted/region-locked videos, drop a yt-dlp cookies file at `./secrets/cookies.txt`. The compose file mounts `./secrets` read-only and points `YTDLP_COOKIES_FILE` at it.

3. Build and start the bot in the background:

   ```sh
   docker compose up -d --build
   ```

4. Follow the logs and confirm the bot is online:

   ```sh
   docker compose logs -f
   ```

   You should see `Successfully reloaded ... application (/) commands.` followed by `Ready! Logged in as <tag>`.

To stop: `docker compose down`.

> The container runs `bun run deploy && bun run start` on startup, so slash commands are re-registered with Discord automatically on every launch. The service uses `restart: unless-stopped`, so it survives crashes and server reboots. Downloaded audio is cached in the `music_cache` named volume so it persists across restarts.

## Project structure

```
src/
├── index.ts              # Composition root — starts each subsystem (startBot)
├── bot.ts                # Builds the client, loads commands & events, logs in
├── deploy-commands.ts    # Registers slash commands with Discord
├── commands/             # Slash commands (one class file each)
├── events/               # Gateway event handlers (one class file each)
├── music/                # Music domain — MusicManager, GuildPlayer, yt-dlp service
├── config/               # Env var loading & validation
└── types/                # Shared TypeScript types & Client augmentation
```

The app is a **modular monolith**: framework-agnostic domain logic (e.g. [src/music/](src/music/)) lives in its own module, and thin adapters (`src/commands/` + `src/events/` for Discord) drive it. `index.ts` is the composition root that starts each subsystem; `bot.ts` builds the discord.js client and dynamically loads the commands and events.

### Adding a command

Create a file in `src/commands/` that default-exports a **class extending `Command`**:

```ts
import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js'
import { Command } from '../types/command'

export default class Hello extends Command {
  data = new SlashCommandBuilder().setName('hello').setDescription('Say hello')

  override cooldown = 5 // optional, in seconds (defaults to 3)

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.reply('Hello!')
  }
}
```

Then run `bun run deploy` to register it. The bot instantiates it automatically on the next start — there is no central registry to edit. Per-user cooldowns and error handling are applied centrally in `src/events/interactionCreate.ts`.

### Adding an event

Create a file in `src/events/` that default-exports a **class extending `Event`** bound to a Discord gateway event:

```ts
import { Events, type Guild } from 'discord.js'
import { Event } from '../types/event'

export default class GuildCreate extends Event<typeof Events.GuildCreate> {
  name = Events.GuildCreate as const
  override once = false // true to handle only the first occurrence

  execute(guild: Guild): void {
    console.log(`Joined ${guild.name}`)
  }
}
```

The `GatewayIntentBits.Guilds` and `GuildVoiceStates` intents are enabled by default. Events relying on other intents (e.g. message content or members) also require adding the intent in `src/bot.ts`.
