# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Runtime & Commands

This project runs on **Bun** (not Node). It uses Bun-specific APIs (`Bun.Glob`, `Bun.env`, `import.meta.dir`), so commands must be run with `bun`.

- `bun run start` — start the bot (`src/index.ts`)
- `bun run deploy` — register slash commands with Discord's API (`src/deploy-commands.ts`); run this whenever a command's `data` definition changes
- `bun run lint` — ESLint over `src/`
- `bun run format` / `bun run format:check` — Prettier write / check

There is no test setup. Lint config uses typescript-eslint `strict` + `stylistic`; Prettier enforces no semicolons, single quotes, trailing commas, 100-char width.

Required env vars (read via `requireEnv`, which throws if missing): `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `SUPABASE_URL`. The HTTP API adds optional `API_PORT` (default 3000) and `API_CORS_ORIGINS` (default `*`). Music adds optional `LAVALINK_HOST` (default `lavalink`), `LAVALINK_PORT` (default 2333), `LAVALINK_PASSWORD` (default `youshallnotpass`), `LAVALINK_SECURE` (default `false`). The recently-played history adds optional `REDIS_URL` (default `redis://redis:6379`), `HISTORY_TTL_SECONDS` (default 86400), `HISTORY_MAX` (default 50). The stats/leaderboard endpoints add optional `STATS_CACHE_TTL_SECONDS` (default 60), the Redis cache TTL for analytics queries. Playback analytics adds optional `DATABASE_URL` (default `postgres://juji:juji@postgres:5432/juji`, the Compose service) plus `POSTGRES_USER`/`POSTGRES_PASSWORD` (both default `juji`) used by the `postgres` Compose service; if the DB is unreachable the bot still runs with analytics disabled.

> **When adding a new env var:** update the `.env` example in [README.md](README.md), the required-env list above, and the deploy workflow's `.env` write step in [.github/workflows/deploy.yml](.github/workflows/deploy.yml).

## Releases & Versioning

Versioning is fully automated by **semantic-release** (config in [.releaserc.json](.releaserc.json)) and driven by [Conventional Commits](https://www.conventionalcommits.org/) — there is no manual version bumping. The `version` field in `package.json` is a placeholder (`0.0.0-semantically-released`); the real version lives in git tags and is the single source of truth synced everywhere.

- Commit messages decide the bump: `fix:` → patch, `feat:` → minor, `feat!:` / `BREAKING CHANGE:` → major. `chore:`/`docs:`/`refactor:` etc. trigger no release.
- On every push to `main`, the `release` job in [.github/workflows/deploy.yml](.github/workflows/deploy.yml) computes the next version, then: updates `package.json` + `CHANGELOG.md`, commits them back as `chore(release): X.Y.Z [skip ci]`, creates the `vX.Y.Z` git tag, and publishes a GitHub Release.
- Only when a release is actually published do the `build-and-push` and `deploy` jobs run. The GHCR image is tagged with the exact version plus rolling `X.Y`, `X`, and `latest` (e.g. `1.4.2`, `1.4`, `1`, `latest`). The server is deployed to the pinned `X.Y.Z` tag.
- Net effect: merges that contain only non-release commits build/deploy nothing; a release tag, a GHCR image, and a server deploy all share one synchronized version.

## Architecture

A Discord bot built on discord.js v14 with a convention-based loader.

- **Modular monolith**: the app runs as one Bun process started from [src/index.ts](src/index.ts), the *composition root*. Feature/domain logic lives in framework-agnostic modules under `src/<feature>/` (e.g. [src/music/](src/music/)); thin **adapters** drive them. `src/commands/` + `src/events/` are the Discord adapter; `src/api/` (Hono) is the HTTP adapter in the **same process**, importing the same domain singletons (e.g. `musicManager`). Domains never import adapters. `index.ts` starts each subsystem (`await startApi()` then `await startBot()`).

- **Dynamic loading**: [src/bot.ts](src/bot.ts) (`startBot()`) uses `Bun.Glob` to scan `src/commands/` and `src/events/` at startup, instantiating each file's default-exported **class** and validating it with `instanceof`. Adding a feature means dropping a new file in the right directory — no central registry to update. The same glob scan is duplicated in [src/deploy-commands.ts](src/deploy-commands.ts) for command registration.

- **Commands** ([src/commands/](src/commands/)): each default-exports a **class extending the abstract `Command`** ([src/types/command.ts](src/types/command.ts)) — with `data` (SlashCommandBuilder), `execute(interaction)`, and an optional `cooldown` (seconds). Commands are keyed by `data.name` into `client.commands`.

- **Events** ([src/events/](src/events/)): each default-exports a **class extending the abstract `Event<K>`** ([src/types/event.ts](src/types/event.ts)) bound to a `ClientEvents` key, with `once` controlling `client.once` vs `client.on`. Set `name = Events.X` (e.g. `as const`) so `execute` args are typed from the event name.

- **Command dispatch & cooldowns**: [src/events/interactionCreate.ts](src/events/interactionCreate.ts) is the router — it looks up the command, enforces per-user/per-command cooldowns (default 3s, stored in `client.cooldowns`), runs `execute`, and handles errors centrally. Individual commands do not manage cooldowns or top-level error handling themselves.

- **HTTP API** ([src/api/](src/api/)): the Hono adapter for a web music control panel, running in the same process. Unlike the Discord adapter, routes are **explicitly composed** (no glob/`instanceof` auto-loader) — this is idiomatic Hono and preserves end-to-end RPC types. Each resource is a **plain Hono sub-app** under `src/api/routes/` (e.g. [src/api/routes/health.ts](src/api/routes/health.ts) exports `const health = new Hono().get('/', …)`). [src/api/index.ts](src/api/index.ts) builds the root app by **chaining** `.use(logger())`, `.use('*', cors(...))`, and `.route('/health', health)` for each module. **Add a route by editing `index.ts`'s chain.** `startApi()` is synchronous and just calls `Bun.serve({ port: apiPort, fetch: app.fetch })` — **not** `export default app`, because [src/index.ts](src/index.ts) is the entry and already runs the bot. Config lives in [src/config/api.ts](src/config/api.ts) (`apiPort` from `API_PORT`, default 3000; `corsOrigins` from `API_CORS_ORIGINS`, default `*`). Only `GET /health` exists so far. `hono` is the one runtime dependency added for this; Bun serves it natively (no `@hono/node-server`). Route modules reuse the same domain singletons as the Discord adapter (imported directly); the API never imports the Discord adapter. In Docker the API port is **not published to the host** — it's reachable only on the Compose network (`http://juji-discord-bot:<API_PORT>`), intended for a same-stack frontend/proxy; `Bun.serve` binds `0.0.0.0` so it's reachable across the network.

- **Music playback** ([src/music/](src/music/)): audio resolution + playback are delegated to a separate **Lavalink v4** node; the bot is a thin client over [`lavalink-client`](https://github.com/Tomato6966/lavalink-client). [src/music/lavalink.ts](src/music/lavalink.ts) owns the `LavalinkManager` singleton (`lavalink`), the `initLavalink(client)` wiring (forwards the `raw` gateway event via `sendRawData`, calls `lavalink.init` on `ClientReady`, logs node events), and `toTrack()` which maps a Lavalink track onto the framework-agnostic `Track`. `MusicManager` ([src/music/MusicManager.ts](src/music/MusicManager.ts)) is a façade over the per-guild Lavalink `Player` (create+connect, stop=`destroy`, skip, snapshot); `MusicService.playFromQuery` searches (`ytsearch`), **rejects live streams** (`track.info.isStream` → `{ ok: false }`), then `queue.add` + `play`. **Lavalink owns the queue, voice connection, and Opus encoding** — there is no `@discordjs/voice`, no yt-dlp/ffmpeg, no file cache. `onEmptyQueue.destroyAfterMs: 0` makes the player leave when the queue empties; `autoSkip` advances on track end. discord.js doesn't type the `raw` event, so it's augmented in [src/types/discord.ts](src/types/discord.ts). The Lavalink server config is [application.yml](application.yml) (YouTube via the youtube-source plugin; all built-in sources off); it runs as the `lavalink` Compose service, reached at `lavalink:2333`.

- **Playback analytics** ([src/database/](src/database/)): a framework-agnostic domain module (Drizzle ORM over Bun-native `Bun.sql`, via `drizzle-orm/bun-sql`) recording playback to self-hosted Postgres. [src/database/schema.ts](src/database/schema.ts) defines `users`/`tracks`/`playEvents`/`listenEvents`; [src/database/client.ts](src/database/client.ts) owns the `db` + `databaseClient` singletons (`connect()` probes the DB and flips an `enabled` flag — writers no-op while disabled, so the bot runs without Postgres). `AnalyticsRecorder` ([src/database/AnalyticsRecorder.ts](src/database/AnalyticsRecorder.ts)) is driven by **Lavalink lifecycle events** in `initMusicEvents()` ([src/api/ws/music.ts](src/api/ws/music.ts)): `recordPlay` at `trackStart`, `recordEnd` at `trackEnd` — so timing is accurate and one in-memory map correlates each open play with its end. Request metadata (`requestSource`/`discordUserId`/`query`) rides on the track's `requester` (passed through by `requesterTransformer`). `VoiceListenerTracker` ([src/music/VoiceListenerTracker.ts](src/music/VoiceListenerTracker.ts)) + the [voiceStateUpdate](src/events/voiceStateUpdate.ts) event accumulate per-user listening time (present + not deafened + human) into `listenEvents`. Migrations live in `drizzle/` (generated by `bunx drizzle-kit generate`, config in [drizzle.config.ts](drizzle.config.ts)) and are applied by `bunx drizzle-kit migrate` in the Docker entrypoint (which is why `drizzle-kit` is a runtime **dependency**). Reached as the `postgres` Compose service.

- **Client augmentation**: `client.commands` and `client.cooldowns` are added to discord.js's `Client` via `declare module 'discord.js'` in [src/types/discord.ts](src/types/discord.ts) and [src/types/command.ts](src/types/command.ts).

- **Config** ([src/config/](src/config/)): `requireEnv` validates env vars; `src/config/index.ts` re-exports everything from `discord.ts`, so import tokens via `from './config'`.

## Conventions

- `GatewayIntentBits.Guilds` and `GuildVoiceStates` (to read members' voice channels for music) are enabled. New event handlers relying on other intents (e.g. `GuildMessages`, members) require adding the intent in [src/bot.ts](src/bot.ts).
- Use `MessageFlags.Ephemeral` (not the deprecated `ephemeral: true`) for new ephemeral replies — see [src/commands/ping.ts](src/commands/ping.ts).
