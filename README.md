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

## HTTP API

The bot also runs a small [Hono](https://hono.dev) HTTP server in the **same process** (it's another adapter over the same domain logic, alongside the Discord one). It's the entry point for a future web music control panel.

- Listens on `API_PORT` (default `3000`); `GET /health` returns `{ "status": "ok", "uptime": <seconds>, "timestamp": "..." }`.
- `GET /ready` returns `200 { "status": "ready" }` while the Discord client is ready, or `503 { "status": "not_ready" }` during startup or disconnection. Production deployment waits for this check. Optional analytics/cache availability does not affect it.
- Cross-origin requests are allowed per `API_CORS_ORIGINS` (**default: none** — set a comma-separated allowlist for the panel's origin, or `*` to allow any). Only needed if a browser calls the API cross-origin — a same-stack frontend/proxy that calls it server-side doesn't need CORS, which is why the default is closed.

In local (non-Docker) dev the server is on `localhost`:

```sh
curl http://localhost:3000/health
```

Under Docker Compose it's **internal to the Compose network** (not published to the host) — see [Deployment](#deployment-docker).

## Prerequisites

- [Bun](https://bun.com) 1.4.2 installed (the version used by CI and the production image)
- A Discord application with a bot token ([Discord Developer Portal](https://discord.com/developers/applications))
- For the music player (`/play`, `/skip`, `/stop`):
  - A reachable [Lavalink](https://lavalink.dev) v4 node. With Docker Compose this is the bundled `lavalink` service; for local dev, run `docker compose up -d lavalink` (or your own node) and point `LAVALINK_HOST`/`LAVALINK_PORT`/`LAVALINK_PASSWORD` at it. No `yt-dlp`/`ffmpeg` on the host anymore.
## Setup

1. Install dependencies:

   ```sh
   bun install --frozen-lockfile
   ```

2. Create a `.env` file in the project root with your bot credentials:

   ```sh
   DISCORD_TOKEN=your-bot-token
   DISCORD_CLIENT_ID=your-application-client-id
   DISCORD_CLIENT_SECRET=your-application-client-secret
   # Better Auth (the bot hosts the login API; the web panel proxies it).
   BETTER_AUTH_URL=https://panel.example.com   # public origin of the web panel
   BETTER_AUTH_SECRET=generate-a-long-random-secret

   # Optional (HTTP API):
   # API_PORT=3000                          # port the Hono server listens on (default: 3000)
   # API_CORS_ORIGINS=                      # comma-separated CORS allowlist, or * for any (default: none)

   # Optional (music player / Lavalink):
   # LAVALINK_HOST=lavalink                 # Lavalink host (default: lavalink, the compose service; use localhost for local dev)
   # LAVALINK_PORT=2333                     # Lavalink port (default: 2333)
   # LAVALINK_PASSWORD=youshallnotpass      # must match application.yml / LAVALINK_SERVER_PASSWORD (default: youshallnotpass)
   # LAVALINK_SECURE=false                  # use wss/https to reach the node (default: false)

   # Optional (recently-played history / Redis):
   # REDIS_URL=redis://redis:6379           # Redis connection URL (default: redis://redis:6379, the compose service)
   # HISTORY_TTL_SECONDS=86400              # per-guild history list TTL, refreshed on each play (default: 86400 = 24h)
   # HISTORY_MAX=50                         # max distinct tracks returned per guild (default: 50)
   # STATS_CACHE_TTL_SECONDS=60             # Redis cache TTL for the stats/leaderboard endpoints (default: 60)

   # Optional (playback analytics / Postgres):
   # DATABASE_URL=postgres://juji:juji@postgres:5432/juji  # Postgres URL (default: the compose service); analytics disabled if unreachable
   # POSTGRES_USER=juji                     # Postgres user for the compose service (default: juji)
   # POSTGRES_PASSWORD=juji                 # Postgres password for the compose service (default: juji)
   # ADDED_TRACKS_MAX=10                    # max persisted "Added songs" entries per user per guild (default: 10)

   # CI deployment only: generated by the build, not a GitHub secret.
   # IMAGE=ghcr.io/ween-mai-co-ltd/juji-discord-bot@sha256:<digest>

   ```

   `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `BETTER_AUTH_URL` and `BETTER_AUTH_SECRET` are required and validated at startup. The `LAVALINK_*` vars are optional and default to the bundled Compose `lavalink` service.

   Register `${BETTER_AUTH_URL}/api/auth/callback/discord` as an OAuth2 redirect URI in the [Discord Developer Portal](https://discord.com/developers/applications) (the application behind `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET`) so the web panel's login can complete.

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
   DISCORD_CLIENT_SECRET=your-application-client-secret
   # Better Auth (the bot hosts the login API; the web panel proxies it).
   BETTER_AUTH_URL=https://panel.example.com   # public origin of the web panel
   BETTER_AUTH_SECRET=generate-a-long-random-secret
   LAVALINK_PASSWORD=youshallnotpass        # shared by the bot and the lavalink service
   ```

   The Discord application must list `${BETTER_AUTH_URL}/api/auth/callback/discord` as an OAuth2 redirect URI (the web panel origin, not the bot's address).

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

> The container runs `bun run deploy && bunx drizzle-kit migrate && bun run start` on startup, so commands are re-registered and database migrations complete before the application starts. The service uses `restart: unless-stopped`, so it survives crashes and server reboots.

The Compose stack also runs a [Lavalink](https://lavalink.dev) v4 node for audio (the bot reaches it at `http://lavalink:2333` over `juji-network` — `LAVALINK_HOST` defaults to `lavalink`, so only `LAVALINK_PASSWORD` needs to match [application.yml](application.yml)). Its config is mounted from `./application.yml`; on boot Lavalink downloads the `youtube-source` plugin into its own container filesystem (watch for `Lavalink is ready to accept connections`). Heap is capped at `-Xmx384m` — bump `_JAVA_OPTIONS` only if it OOMs.

### Automated production deployment

The [release workflow](.github/workflows/deploy.yml) checks PRs with typecheck, lint, then formatting. Pushes to `main` also run semantic-release; a published release builds an image and deploys its immutable `sha256` digest. Build and deployment check out the release commit SHA. Version and rolling image tags remain available for discovery.

Configure the following **before merging deployment changes into `main`**:

1. A repository administrator creates a GitHub Environment named `production`, with **Selected branches and tags → Branch → `main`** as its only deployment rule. Leave required reviewers and wait timers disabled to preserve automatic deployment. Private repositories require a GitHub plan supporting environments and deployment branch restrictions. Protect `main` with required quality checks and review of workflow changes.
2. Populate that environment's secrets from the existing secret store:

   | Purpose | Environment secrets |
   | --- | --- |
   | SSH transport | `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, `SSH_KNOWN_HOSTS` |
   | Cloudflare Access | `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` |
   | Required application configuration | `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` |
   | Optional configuration | `API_PORT`, `API_CORS_ORIGINS`, `LAVALINK_PASSWORD`, `REDIS_URL`, `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD` |

   Empty optional secrets are omitted so existing defaults apply. Keep `DATABASE_URL` consistent with the configured Postgres credentials. `GITHUB_TOKEN` is supplied automatically with package-read access for deployment. Keep `DISCORD_WEBHOOK_URL` as a repository secret consumed only by the notification job. Remove duplicated repository application/transport secrets after validating the environment configuration.
3. Obtain the server's host key through a trusted server console. Verify its fingerprint against your server records, then produce the known-hosts entry there:

   ```sh
   ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
   awk '{print "deploy-target " $1 " " $2}' /etc/ssh/ssh_host_ed25519_key.pub
   ```

   Store the complete `deploy-target ssh-ed25519 ...` line in `SSH_KNOWN_HOSTS`. The workflow uses `deploy-target` as its host-key alias and refuses untrusted or changed keys. When rotating a host key, verify its replacement through the trusted console before updating this secret.
4. Provision the dedicated SSH deployment account with Docker access, Docker Compose v2.24 or newer, and the external `juji-network`. Scope the Cloudflare service token to the SSH Access application. Ensure the production directory is `~/juji-discord-bot` and the Compose project name is `juji-discord-bot` so existing containers and database volumes are reused.

The workflow validates required values before transfer, serializes `.env` through a Bun helper, and stages configuration privately on the server. Compose validation and image pulls complete before active files are replaced by renames. Directories use mode `700`; configuration and secret files use `600`. Temporary registry credentials are removed on exit, including failure and handled termination signals. The workflow never runs host-wide image pruning.

Production waits up to 300 seconds for Compose readiness. The bot healthcheck uses Bun to query `/ready` every 10 seconds, with a 5-second timeout, 60-second startup grace period, and three retries. Success notifications include the exact image digest and run only after deployment succeeds. A failed deployment reports container status and the last 50 application log lines. Keep credentials out of application logs; never print `.env`, Docker auth files, or resolved Compose configuration when debugging.

Actions, production images, semantic-release/plugins, and cloudflared are pinned. Weekly Dependabot PRs maintain Action and Docker/Compose pins; review and merge updates explicitly. Update the Bun version in the workflow together with the Docker base image. Update the cloudflared URL and expected SHA-256 together using its official release. The existing Node 24/npm-based semantic-release action is an exception to the Bun-only application/dependency-install policy; release-tool/plugin pins still require transitive dependency review.

### Failed deployment and manual recovery

There is no automatic rollback: startup may already have applied migrations. The server retains the preceding configuration in `~/juji-discord-bot/.previous`. A `.deployment-pending` marker keeps that backup intact across failed retries; a successful deployment clears the marker. A first deployment has no previous configuration to restore.

Inspect the failed Actions job's diagnostics, migration changes, and server/container state before choosing recovery. If the issue is transient, rerun **failed jobs**, preserving the successful release/build outputs. Rerunning the entire workflow can find the release already published and skip deployment. If credentials were revoked or rotated, review the backup's credentials before restoring it.

If the preceding application is compatible with the current database schema and you choose to restore it, run on the server:

```sh
cd ~/juji-discord-bot
umask 077
cp .previous/docker-compose.yml docker-compose.yml
cp .previous/application.yml application.yml
cp .previous/.env .env
chmod 600 docker-compose.yml application.yml .env
if docker compose --project-name juji-discord-bot up --wait --wait-timeout 300 --pull never; then
  rm -f .deployment-pending
fi
```

`--pull never` uses the retained image locally. If an image is missing, authenticate to GHCR with package-read credentials in a temporary `DOCKER_CONFIG` directory, pull it, and remove that directory afterward. Revert schema changes only through an explicitly reviewed database recovery procedure. Keep the pending marker until recovery passes readiness. Retain needed image digests and prune unused images separately after confirming recovery requirements.

### YouTube playback

Playback runs **without OAuth**. The plugin's unauthenticated clients (`ANDROID_VR`, `ANDROID_MUSIC`, `IOS`, `MWEB`, configured in [application.yml](application.yml)) hand out pre-signed URLs, and signature parsing is delegated to the public `cipher.kikkia.dev` remote cipher server so playback survives YouTube's player-script rotations. Self-host [yt-cipher](https://github.com/kikkia/yt-cipher) and point `remoteCipher.url` at it if you'd rather not depend on the public instance.

OAuth was previously used with a burner Google account, but Google disables accounts used this way, so it has been removed. If YouTube starts returning "Sign in to confirm you're not a bot" / "This video requires login", the next step is a **poToken** for the `WEB`/`WEBEMBEDDED` clients rather than another account: generate one with [iv-org/youtube-trusted-session-generator](https://github.com/iv-org/youtube-trusted-session-generator) and set it in `application.yml`:

```yaml
plugins:
  youtube:
    pot:
      token: 'your po_token'
      visitorData: 'your visitor_data'
```

poTokens expire after a while and must be regenerated (re-running the generator and restarting Lavalink).

The HTTP API is **not published to the host** — it's reachable only on the Compose network, so a frontend/proxy added to the same stack calls it at `http://juji-discord-bot:${API_PORT:-3000}`. To hit it from the host for debugging, either add a `ports:` mapping to the service or `docker compose exec juji-discord-bot curl http://localhost:3000/health`.

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
