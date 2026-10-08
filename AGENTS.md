# AGENTS.md

Discord bot (discord.js v14) plus a same-process Hono HTTP API, running on **Bun** (not Node).
`README.md` covers setup/deploy; `CLAUDE.md` is the deep architecture tour — update it when
architecture changes.

## Commands

- Bun only. `bun install --frozen-lockfile`; never npm/yarn/node.
- Verify before finishing: `bun run typecheck` → `bun run lint` → `bun run format:check`. CI runs
  exactly this order; PRs to `main` run only this quality gate.
- There is no test runner or test script — do not invent one.
- `bun run start` starts the bot and API in one process. Bun auto-loads `.env`; required vars are
  `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `BETTER_AUTH_URL`,
  `BETTER_AUTH_SECRET` (validated by `requireEnv`, which throws).
- `bun run deploy` re-registers slash commands with Discord. Required after changing any command's
  `data` (name/description/options).
- Local music needs a Lavalink node: `docker compose up -d lavalink`. Compose uses the external
  `juji-network`, so run `docker network create juji-network` once. Postgres/Redis are optional at
  runtime: analytics is disabled until the DB probe succeeds, and Redis is a best-effort cache.

## Architecture

- Modular monolith. `src/index.ts` is the composition root:
  `databaseClient.connect()` → `startApi()` → `initDj()` → `startBot()`. The Discord adapter
  (`src/commands/`, `src/events/`) and HTTP adapter (`src/api/`) share the same domain singletons
  from `src/music/`, `src/database/`, `src/dj/`, `src/redis/`. Domain code must never import
  adapters.
- Commands and events are glob-loaded: a new file in `src/commands/` or `src/events/`
  default-exporting a class extending `Command`/`Event` is picked up automatically — no registry.
  `src/loader.ts` deliberately lives outside `src/commands/`; anything in the scanned directories
  must be a command/event or startup logs a warning.
- API routes are the exception: compose them explicitly in `src/api/index.ts`'s `.route(...)` chain.
  `startApi()` calls `Bun.serve` itself and exports `AppType` — do not `export default app`.
- API typing: routes are `Hono<AppEnv>`; import JWT helpers from `hono/utils/jwt`, **never**
  `hono/jwt` (it augments `ContextVariableMap` and silently defeats `AppEnv`). Validate
  bodies/query/params with the zod `zValidator` in `src/api/validator.ts`; keep
  `/api/guilds/:guildId/*` behind `guildAccess` (a valid token is not authorization).
- DB changes: edit `src/database/schema.ts`, then `bunx drizzle-kit generate` (writes `drizzle/`)
  and `bunx drizzle-kit migrate`. The Docker entrypoint runs `deploy && drizzle-kit migrate && start`.

## Conventions

- Prettier: no semicolons, single quotes, trailing commas, 100 cols. TypeScript is strict with
  `noImplicitOverride` (use `override`) and `noUncheckedIndexedAccess`.
- Ephemeral Discord replies use `MessageFlags.Ephemeral`, not the deprecated `ephemeral: true`.
- Cooldowns and command error handling are centralized in `src/events/interactionCreate.ts`;
  commands don't implement them.
- Adding an env var touches four places: the `README.md` `.env` example, `CLAUDE.md`'s env list, the
  server `.env` write step in `.github/workflows/deploy.yml`, and a GitHub Actions secret (deploys
  read secrets, not `.env`).

## Releases

- Conventional Commits on `main` drive semantic-release: `fix:` patch, `feat:` minor, `feat!:` /
  `BREAKING CHANGE:` major; `chore:`/`docs:` etc. release nothing. Never bump the `package.json`
  version or edit `CHANGELOG.md` by hand.
- A release builds a GHCR image and deploys over SSH via Cloudflare tunnel. The Docker API port is
  not published to the host; debug with `docker compose exec juji-discord-bot curl localhost:3000/health`.
- `docs/performance-review.md` tracks an unfinished two-repo perf review (its web repo
  `juji-discord-web` is not in this checkout).
