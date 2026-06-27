# juji-discord-bot

A Discord bot built with [discord.js](https://discord.js.org) v14, running on the [Bun](https://bun.com) runtime. Commands and events are loaded automatically from the filesystem, so adding new functionality is just a matter of dropping a file in the right folder.

## Commands

| Command         | Description                                                                |
| --------------- | -------------------------------------------------------------------------- |
| `/ping`         | Check the bot's latency to Discord.                                        |
| `/help`         | List all available commands.                                               |
| `/play <query>` | Play a song from a YouTube URL or search term in your voice channel.       |
| `/skip`         | Skip the current song and play the next in the queue.                       |
| `/stop`         | Stop playback and clear the queue.                                         |

The music player joins the voice channel you're in and queues tracks per server — `/play` while something is already playing adds to the queue instead of interrupting it. Audio is resolved and streamed by a separate [Lavalink](https://lavalink.dev) node (YouTube via the [youtube-source](https://github.com/lavalink-devs/youtube-source) plugin); the bot just drives it over the network, so nothing is fetched or transcoded in-process. **Live streams aren't supported** and are politely declined.

## Chat

`@mention` the bot in a text channel and it replies using a local LLM via [Ollama](https://ollama.com). It can also control music from natural language — e.g. "@Juji play lofi beats", "@Juji skip", or "@Juji stop the music". Notes:

- It responds **only** to messages that mention it (replies are ignored for now), and ignores other bots.
- **No memory** — each message is a standalone prompt.
- It stays on-topic (chat + music); off-topic, unsafe, or instruction-override requests get a polite decline.
- LLM requests are processed **one at a time** across the whole bot (a global queue), so a small CPU-only model stays within budget.

## HTTP API

The bot also runs a small [Hono](https://hono.dev) HTTP server in the **same process** (it's another adapter over the same domain logic, alongside the Discord one). It's the entry point for a future web music control panel.

- Listens on `API_PORT` (default `3000`); `GET /health` returns `{ "status": "ok", "uptime": <seconds>, "timestamp": "..." }`.
- Cross-origin requests are allowed per `API_CORS_ORIGINS` (default `*`; set a comma-separated allowlist for the panel's origin). Only needed if a browser calls the API cross-origin — a same-stack frontend/proxy that calls it server-side doesn't need CORS.

In local (non-Docker) dev the server is on `localhost`:

```sh
curl http://localhost:3000/health
```

Under Docker Compose it's **internal to the Compose network** (not published to the host) — see [Deployment](#deployment-docker).

## Prerequisites

- [Bun](https://bun.com) installed
- A Discord application with a bot token ([Discord Developer Portal](https://discord.com/developers/applications))
- For the music player (`/play`, `/skip`, `/stop`):
  - A reachable [Lavalink](https://lavalink.dev) v4 node. With Docker Compose this is the bundled `lavalink` service; for local dev, run `docker compose up -d lavalink` (or your own node) and point `LAVALINK_HOST`/`LAVALINK_PORT`/`LAVALINK_PASSWORD` at it. No `yt-dlp`/`ffmpeg` on the host anymore.
- For the chat assistant (mention the bot):
  - An [Ollama](https://ollama.com) server reachable by the bot. With Docker Compose this is the bundled `ollama` service; for local dev, run Ollama yourself and set `OLLAMA_HOST` (or set `LLM_ENABLED=false` to turn chat off).

## Setup

1. Install dependencies:

   ```sh
   bun install
   ```

2. Create a `.env` file in the project root with your bot credentials:

   ```sh
   DISCORD_TOKEN=your-bot-token
   DISCORD_CLIENT_ID=your-application-client-id
   SUPABASE_URL=https://your-project-ref.supabase.co

   # Optional (HTTP API):
   # API_PORT=3000                          # port the Hono server listens on (default: 3000)
   # API_CORS_ORIGINS=*                     # comma-separated CORS allowlist, or * for any (default: *)

   # Optional (music player / Lavalink):
   # LAVALINK_HOST=lavalink                 # Lavalink host (default: lavalink, the compose service; use localhost for local dev)
   # LAVALINK_PORT=2333                     # Lavalink port (default: 2333)
   # LAVALINK_PASSWORD=youshallnotpass      # must match application.yml / LAVALINK_SERVER_PASSWORD (default: youshallnotpass)
   # LAVALINK_SECURE=false                  # use wss/https to reach the node (default: false)

   # Optional (recently-played history / Redis):
   # REDIS_URL=redis://redis:6379           # Redis connection URL (default: redis://redis:6379, the compose service)
   # HISTORY_TTL_SECONDS=86400              # per-guild history list TTL, refreshed on each play (default: 86400 = 24h)
   # HISTORY_MAX=50                         # max distinct tracks returned per guild (default: 50)

   # Optional (chat assistant / Ollama):
   # OLLAMA_HOST=http://localhost:11434   # Ollama base URL (default: http://ollama:11434, the compose service)
   # OLLAMA_MODEL=gemma4:e2b              # model to run (default: gemma4:e2b)
   # OLLAMA_NUM_CTX=4096                  # context window; kept small so the KV cache doesn't OOM the model (default: 4096)
   # LLM_TIMEOUT_MS=120000                # per-request timeout in ms (default: 120000)
   # LLM_MAX_INPUT_CHARS=1000             # cap on user prompt length (default: 1000)
   # LLM_ENABLED=false                    # disable chat entirely (default: true)
   ```

   `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, and `SUPABASE_URL` are required and validated at startup. The `LAVALINK_*` vars are optional and default to the bundled Compose `lavalink` service.

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

The repo ships a multi-stage [Dockerfile](Dockerfile) (based on Bun's official image) and a [docker-compose.yml](docker-compose.yml) for running on a Linux server. The bot image is slim — audio is handled by the separate `lavalink` service, so no `yt-dlp`/`ffmpeg` toolchain is baked in. All services attach to a shared **external** `juji-network` and resolve each other by name (so other stacks on that network — a reverse proxy, the future web panel — can reach them too).

1. Create the shared network once (skip if it already exists):

   ```sh
   docker network create juji-network
   ```

2. Create a `.env` file next to `docker-compose.yml` with your credentials:

   ```sh
   DISCORD_TOKEN=your-bot-token
   DISCORD_CLIENT_ID=your-application-client-id
   SUPABASE_URL=https://your-project-ref.supabase.co
   LAVALINK_PASSWORD=youshallnotpass        # shared by the bot and the lavalink service
   ```

3. Build and start the stack in the background:

   ```sh
   docker compose up -d --build
   ```

4. Follow the logs and confirm the bot is online:

   ```sh
   docker compose logs -f
   ```

   You should see `Successfully reloaded ... application (/) commands.` followed by `Ready! Logged in as <tag>`.

To stop: `docker compose down`.

> The container runs `bun run deploy && bun run start` on startup, so slash commands are re-registered with Discord automatically on every launch. The service uses `restart: unless-stopped`, so it survives crashes and server reboots.

The Compose stack also runs a [Lavalink](https://lavalink.dev) v4 node for audio (the bot reaches it at `http://lavalink:2333` over `juji-network` — `LAVALINK_HOST` defaults to `lavalink`, so only `LAVALINK_PASSWORD` needs to match [application.yml](application.yml)). Its config is mounted from `./application.yml`; on boot Lavalink downloads the `youtube-source` plugin into its own container filesystem (watch for `Lavalink is ready to accept connections`). Heap is capped at `-Xmx384m` since it shares the CPU host with Ollama — bump `_JAVA_OPTIONS` only if it OOMs. If YouTube starts returning "Sign in to confirm you're not a bot", enable the commented `plugins.youtube.oauth` block in `application.yml` with a refresh token.

The HTTP API is **not published to the host** — it's reachable only on the Compose network, so a frontend/proxy added to the same stack calls it at `http://juji-discord-bot:${API_PORT:-3000}`. To hit it from the host for debugging, either add a `ports:` mapping to the service or `docker compose exec juji-discord-bot curl http://localhost:3000/health`.

The Compose stack also starts an [Ollama](https://ollama.com) service for the chat assistant (the bot reaches it at `http://ollama:11434` over the Compose network — no extra env needed). On first boot the bot **auto-pulls** the configured model (`gemma4:e2b` by default); this can take a while, so watch for `[llm] model … pulled` in the logs. The model is loaded into memory **lazily on the first chat message** (not at pull time), so `ollama ps` stays empty until someone @mentions the bot. To pull manually: `docker compose exec ollama ollama pull gemma4:e2b`. Models persist in the `ollama_models` volume.

The `ollama` service env keeps inference cheap and bounded on a CPU host: `OLLAMA_NUM_PARALLEL=1` + `OLLAMA_MAX_LOADED_MODELS=1` process one prompt at a time, and `OLLAMA_CONTEXT_LENGTH=4096` caps the context — a large context makes Ollama allocate a KV cache big enough to OOM-kill the model runner on load (`llama runner process has terminated: signal: killed`). The bot also sends `num_ctx` per request, so it's capped from both sides.

## Project structure

```
src/
├── index.ts              # Composition root — starts each subsystem (startApi, startBot)
├── bot.ts                # Builds the client, loads commands & events, logs in
├── deploy-commands.ts    # Registers slash commands with Discord
├── commands/             # Slash commands (one class file each)
├── events/               # Gateway event handlers (one class file each)
├── api/                  # HTTP adapter (Hono) — startApi + routes/ (one Hono sub-app per resource)
├── music/                # Music domain — MusicService, MusicManager, Lavalink client wiring
├── llm/                  # Chat domain — OllamaClient, SerialQueue, Assistant
├── config/               # Env var loading & validation
└── types/                # Shared TypeScript types & Client augmentation
```

The app is a **modular monolith**: framework-agnostic domain logic (e.g. [src/music/](src/music/)) lives in its own module, and thin adapters drive it — `src/commands/` + `src/events/` for Discord, and `src/api/` (Hono) for HTTP. `index.ts` is the composition root that starts each subsystem; `bot.ts` builds the discord.js client and dynamically loads the commands and events, while `api/index.ts` (`startApi`) builds the Hono app and mounts the route modules.

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

### Adding an API route

Create a file in `src/api/routes/` that exports a **Hono sub-app** for one resource:

```ts
import { Hono } from 'hono'

export const ping = new Hono().get('/', (c) => c.text('pong'))
```

Then mount it in [src/api/index.ts](src/api/index.ts) with `.route()`:

```ts
import { ping } from './routes/ping'

const app = new Hono()
  .use(logger())
  .use('*', cors({ origin: corsOrigins }))
  .route('/health', health)
  .route('/ping', ping) // -> GET /ping
```

Logging and CORS are applied centrally; route modules reuse the same domain singletons (e.g. `musicService`) the Discord adapter does.
