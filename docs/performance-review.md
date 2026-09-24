# Performance review — juji-discord-bot + juji-discord-web

Two-repo performance review performed 2026-09-24. Findings were verified against the
installed dependencies (Hono, Bun types, Drizzle, Next build diagnostics) before being
recorded; line numbers were accurate at review time.

**Status legend:** ✅ Done · 🚧 In progress · ⬜ Not started

Phase 1 is implemented, verified, and committed on branch
`fix/ws-leak-and-api-hot-path-hardening` (`2478ceb`, not yet merged). Phases 2 (bot) and
3 (web) are implemented and verified locally but uncommitted, on `perf/hot-path-phase-2`
and `perf/auth-events-phase-3` respectively.

## Phases

| Phase | Scope | Repo | Status |
| --- | --- | --- | --- |
| 1 | Leaks & stalls: WS registry, Redis fail-fast, SQL pool + recovery, JWT fast path | bot | ✅ Done |
| 2 | Hot path: snapshots/broadcasts, history, analytics writes, indexes, stats cache | bot | ✅ Done (local) |
| 3 | Auth & SSE: middleware skip, shared per-guild WS, backpressure, frame reconcile | web | ✅ Done (local) |
| 4 | Rendering & bundle: login chunk, link input, progress tick, queue rows, fonts | web | ⬜ Not started |
| 5 | Ops & polish: proxy abort, suggestions cache, shutdown, compose, assets | both | ⬜ Not started |

---

## Bot findings (`juji-discord-bot`)

### P0 — leaks & stalls

| ID | Severity | Finding | Fix | Phase | Status |
| --- | --- | --- | --- | --- | --- |
| B1 | P0 | WS registry never releases closed sockets — Hono builds a new `WSContext` per callback, so `set.delete(ws)` in `onClose` deletes a different object; every socket ever connected is retained and broadcasts grow forever (`src/api/ws/music.ts:32-48,117-131`) | Key the registry by the stable `ws.raw` (`ServerWebSocket`); prune sockets whose `readyState !== OPEN` during broadcast | 1 | ✅ Done |
| B2 | P0 | Redis client uses defaults (`enableOfflineQueue: true`), so best-effort cache calls queue instead of rejecting while Redis is down — every `guildAccess`/stats/history request stalls instead of falling through (`src/redis/client.ts:4`) | `enableOfflineQueue: false`, `connectionTimeout: 2000`, `maxRetries: 3` | 1 | ✅ Done |
| B3 | P0 | Bun.sql pool defaults (10 connections, wait-forever checkout); a failed boot probe left analytics disabled until restart (`src/database/client.ts:6-19`) | Explicit pool options (`max: 20`, `connectionTimeout: 5`, `idleTimeout: 30`, `maxLifetime: 1800`); background probe retry with 5s→60s backoff; `close()` | 1 | ✅ Done |
| B4 | P0 | `Jwt.verifyWithJwks` re-imports the JWK into a `CryptoKey` on every request; JWKS fetch has no timeout/backoff; `startApi()` blocked `Bun.serve` on `initJwks()` (`src/api/middleware/auth.ts:57-95`, `src/api/index.ts:35`) | Pre-import `CryptoKey`s once per fetch, select by `kid`, call `Jwt.verify`; 3s fetch timeout + 30s failure backoff with stale-key serving; non-blocking `initJwks()` | 1 | ✅ Done |

### P1 — hot path & queries

| ID | Severity | Finding | Fix | Phase | Status |
| --- | --- | --- | --- | --- | --- |
| B5 | P1 | Every state broadcast rebuilds the full snapshot, emits 4 separately-serialized frames, and re-resolves artwork per queued track; mutation routes snapshot twice; `trackEnd`+`queueEnd`+`playerDestroy` can broadcast 2-3× per transition (`src/api/ws/music.ts:63-86`, `src/music/snapshot.ts:32-42`, `src/music/artwork.ts`, `src/api/routes/guilds.ts:80-81`) | One snapshot per event reused for response+broadcast; one combined `state` frame; memoize `resolveArtwork`; coalesce broadcasts per guild per tick | 2 | ✅ Done |
| B6 | P1 | History record = 3 serialized Redis RTTs; every `trackStart` re-reads 100 entries, JSON+Zod validates each, broadcasts the whole list (`src/music/history.ts:14-41`, `src/api/ws/music.ts:146-153`) | Single `EVAL` (or `Promise.all`); bounded `LRANGE`; validate on write only; broadcast `history:add` delta, full list on connect | 2 | ✅ Done |
| B7 | P1 | Analytics write path: 3-4 serialized statements per track start, 2 per end, no transaction, unconditional upserts (`src/database/AnalyticsRecorder.ts:54-128`) | Transaction where needed + `Promise.all` for independent upserts; conditional updates to stop rewriting unchanged rows | 2 | ✅ Done |
| B8 | P1 | Leaderboard queries fan out `play_events × listen_events` before aggregation; no index on `request_source`; `playedTracks` (limit 500) runs on every DJ start; `querySummary` serial aggregates (`src/database/AnalyticsQueries.ts:115-260`, `src/database/schema.ts:61-66`) | Add `/guild_id, request_source, started_at/` + covering listen index; two-phase `playedTracks`; parallel summary aggregates; verify with `EXPLAIN (ANALYZE, BUFFERS)` | 2 | ✅ Done |
| B9 | P1 | Stats cache has no in-flight coalescing, pays a Redis RTT per hit, and keys multiply by `limit` → thundering herd on TTL expiry (`src/database/AnalyticsQueries.ts:262-284`) | `inflight: Map<string, Promise<T>>`; 2-5s in-process TTL cache; cache top-50 per kind/range and slice | 2 | ✅ Done |
| B10 | P1 | `guildAccess` does a Redis GET per request and a Discord REST `members.fetch` per user per 60s; deny cache only 15s (`src/api/middleware/guildAccess.ts:22-47`) | Raise TTL with jitter; small in-process LRU in front; fail fast when Redis is down (relies on B2) | 2 | ✅ Done |

### P2 — ops

| ID | Severity | Finding | Fix | Phase | Status |
| --- | --- | --- | --- | --- | --- |
| B11 | P2 | Hono logger logs twice per request including `/health` and 401s (`src/api/index.ts:22`) | Gate to dev, or log one line and skip health checks in production | 5 | ⬜ Not started |
| B12 | P2 | `Bun.serve` defaults: 128 MB body limit, 16 MB WS backpressure with no disconnect (`src/api/index.ts:37`) | `maxRequestBodySize: 1 MB`, `backpressureLimit: 1 MB`, `closeOnBackpressureLimit: true` | 5 | ⬜ Not started |
| B13 | P2 | No graceful shutdown; Dockerfile `sh -c "… && …"` doesn't `exec` Bun, so SIGTERM hits the shell (`Dockerfile:18`, `src/index.ts`) | `exec` in entrypoint + `init: true`; SIGTERM handler that stops the server, flushes analytics, closes Redis/DB/Discord | 5 | ⬜ Not started |
| B14 | P2 | Compose has no resource limits, no Postgres/Redis tuning, no log rotation; Lavalink `-Xmx4g` uncapped (`docker-compose*.yml`, `application.yml`) | Container limits + healthchecks; Postgres `shared_buffers`/`work_mem`; Redis `maxmemory` policy; log options | 5 | ⬜ Not started |

---

## Web findings (`juji-discord-web`)

### P0

| ID | Severity | Finding | Fix | Phase | Status |
| --- | --- | --- | --- | --- | --- |
| W1 | P0 | Auth work happens twice on every API request: middleware `updateSession()` runs on `/api/*` (computed `isApi` is unused) and the route re-creates a Supabase client + `getSession()` (`src/proxy.ts:21`, `src/lib/supabase/middleware.ts:26`, `src/lib/backend-auth.ts:6-12`) | Early-return from `proxy()` for `/api/*`; one `getRequestAuth()` pass (single cookie read, single client, deliberate refresh) replaces the separate `getAccessToken`/`resolveGuildAccess` calls | 3 | ✅ Done |
| W2 | P0 | `/` blocks on a Supabase `getUser()` network round-trip only for avatar/username fallback (`src/app/page.tsx:25`) | Use `getClaims()` (local verification) or persist `avatar_url` at login | 3 | ✅ Done |
| W3 | P0 | One bot WebSocket per browser tab; each tab costs a bot-side JWT verify + `canAccessGuild` + fan-out socket + timer (`src/app/api/events/route.ts:64`) | Per-guild hub (`src/lib/events-hub.ts`): one bot WS per guild, fan out to SSE subscribers, idle close after 30s; **each subscriber is verified once** with their own token against the bot's new `GET /api/guilds/:guildId/access` probe before joining (bot commit `perf(api)` adds it) | 3 | ✅ Done |
| W4 | P0 | SSE ignores `desiredSize` (unbounded buffering for slow clients) and has no `cancel()`; cleanup hangs off `request.signal` only (`src/app/api/events/route.ts:18-28,100-112`) | Coalesce/drop state frames when `desiredSize <= 0`, flush on `pull()`; `cancel()` clears timer and closes WS when last | 3 | ✅ Done |
| W5 | P0 | Every `playlist` frame rebuilds the entire queue; one bot broadcast = 4 frames = 4 React renders (`src/components/music-player/use-player-state.ts:193-206`, bot `src/api/ws/music.ts:63-86`) | Handle combined `state` frame; reconcile by entry id reusing unchanged objects; `startTransition` for bursts (see W19) | 3 | ✅ Done |

### P1

| ID | Severity | Finding | Fix | Phase | Status |
| --- | --- | --- | --- | --- | --- |
| W6 | P1 | Login ships full supabase-js incl. Realtime — measured 800 KB vs 620 KB for `/` (`.next/diagnostics/route-bundle-stats.json`; `src/app/login/page.tsx:8`) | Dynamic import inside the click handler, or build the Discord authorize URL server-side | 4 | ⬜ Not started |
| W7 | P1 | SSE frames are parsed then re-stringified on the server; client parses again (`src/app/api/events/route.ts:91-98`) | Forward raw text frames unchanged | 3 | ✅ Done |
| W8 | P1 | `/api/proxy` has no upstream timeout/abort, re-serializes responses, leaks raw error text (`src/app/api/proxy/[...path]/route.ts:58-78`) | `AbortSignal.any([request.signal, AbortSignal.timeout(10s)])`; stream `backendRes.body`; generic error message | 3 | ✅ Done |
| W9 | P1 | `StatsPanel` fires 4 requests on mount below the fold; cache is per-hook instance (`src/components/music-player/StatsPanel.tsx`, `use-stats.ts:26`) | Defer mount (IntersectionObserver/idle); module-level cache + in-flight dedupe; `loading` starts `true` | 4 | ⬜ Not started |
| W10 | P1 | Link input state is lifted into the top-level player state → whole player re-renders per keystroke (`QueuePanel.tsx:306-319`, `use-player-state.ts:317-320`) | Keep the draft local to `QueuePanel`; `addLink(url)` takes the value | 4 | ⬜ Not started |
| W11 | P1 | 1s progress tick re-renders the whole panel (`use-player-state.ts:269-276`, `NowPlaying.tsx`) | Extract a progress component that owns the ticker; `memo(FilterControls)` | 4 | ⬜ Not started |
| W12 | P1 | `QueuePanel` churn: inline `itemIds`, recreated handlers, unmemoized rows, both tabs always mounted (`QueuePanel.tsx:254,261-365,446,476,493`) | `useMemo`/`useCallback`/`memo`; render only the active tab's list | 4 | ⬜ Not started |
| W13 | P1 | 5 font weights preloaded, 3 unused (100/800/900); used 300/500/600 not declared (`src/app/layout.tsx:7-17`) | Declare only available weights (400/700); drop unused preloads | 4 | ⬜ Not started |
| W14 | P1 | Server-side Supabase session refresh is effectively dead (`autoRefreshToken: false` + `getClaims()`), forcing re-login on expiry (`src/lib/supabase/middleware.ts:15-26`) | Refresh deliberately while inside the margin: middleware for page renders, `getRequestAuth()` for API routes, both through a single-flight helper so rotating refresh tokens are never raced | 3 | ✅ Done |
| W15 | P1 | Duplicate Supabase client creation / cookie parsing per request (`src/lib/backend-auth.ts:7,18,48`) | Folded into W1 (`React.cache` + single cookie read) | 3 | ✅ Done |

### P2

| ID | Severity | Finding | Fix | Phase | Status |
| --- | --- | --- | --- | --- | --- |
| W16 | P2 | Rate limiter keyed on spoofable `x-forwarded-for`, unbounded map, O(n) inline prune (`src/lib/rateLimit.ts:7`) | Key by session; cap entries; prune on threshold/timer (also backlog A-S2) | 5 | ⬜ Not started |
| W17 | P2 | Suggestions route: no cache, no abort propagation, unauthenticated external calls (`src/app/api/suggestions/route.ts:48`) | `next: { revalidate: 300 }`, `signal: request.signal` | 5 | ⬜ Not started |
| W18 | P2 | Guild switch does `window.location.reload()` → full JS re-download and SSE teardown (`PlayerHeader.tsx:129`) | Pass `guildId` into `usePlayerState`, add to effect deps; `router.refresh()` | 4 | ⬜ Not started |
| W19 | P2 | Duplicate track ids used as React keys / dnd ids / lookup keys — breaks reconciliation and drag-and-drop when the same video is queued twice (`QueuePanel.tsx:70,480`, `use-player-state.ts:335-345`) | Add `entryId` per queue add on the bot (`Track`/`Requester`/`QueueItemDto`), fall back to `${id}:${index}` | 3 | ✅ Done |
| W20 | P2 | Untracked blur timer can fire after unmount (`QueuePanel.tsx:377`) | Store timer id in a ref and clear in cleanup | 4 | ⬜ Not started |
| W21 | P2 | No liveness watchdog on the SSE/WS chain; a silently dead bot socket leaves stale state forever (`route.ts:66-72`, `use-player-state.ts:245-256`) | Server idle timeout closes stream; client reconnects when no frame for 60s | 5 | ⬜ Not started |
| W22 | P2 | All images `unoptimized`; `priority` on the dynamic now-playing thumbnail; no cache headers for public assets (`NowPlaying.tsx:54-62`, `next.config.ts`) | Drop `priority` from dynamic thumbnail; decide on optimizer vs `unoptimized`; `headers()` for `/logo.png`/favicon | 5 | ⬜ Not started |
| W23 | P2 | Skeleton dimensions don't match real components → layout shift (`MusicPlayerSkeleton.tsx:13,45` vs `NowPlaying.tsx:48`, `QueuePanel.tsx:368`) | Mirror real dimensions | 5 | ⬜ Not started |
| W24 | P2 | Docker/CI drift: `NEXT_PUBLIC_SOCKET_PATH` passed but not declared as a build ARG; unpinned base images; no healthchecks/log limits | Align build args, pin digests, `NEXT_TELEMETRY_DISABLED=1`, compose healthcheck/logging | 5 | ⬜ Not started |
| W25 | P2 | Small client inefficiencies: unmemoized ThemeProvider value; `stRef` sync via effect; `use-stats` initial `loading: false`; `StatsPanel.toRows()` per render; logout awaits `signOut()` before navigating (`ThemeProvider.tsx:43`, `use-player-state.ts:131`, `use-stats.ts:28`, `StatsPanel.tsx:163-210`, `UserMenu.tsx:54-59`) | Individual small fixes | 5 | ⬜ Not started |

---

## Relationship to `docs/review-backlog.md` (web repo)

The older backlog predates this review and parts of it are now shipped. Overlaps:

- `B-P1` history Redis pipelining → this doc's **B6**.
- `B-P2` full-queue re-serialization → this doc's **B5**.
- `A-S2` spoofable rate-limit key → this doc's **W16**.
- `A-R2` upstream error leak → folded into **W8**.
- `A-C3` positional remove/reorder race → mitigated long-term by **W19** (entry ids).

## Phase 1 verification (done)

- `bun run typecheck`, `bun run lint`, `bun run format:check` all pass.
- Temporary runtime script (14 checks, deleted after use): valid ES256 token verifies;
  unknown `kid`, `HS256`, expired, wrong issuer/audience, and forged signatures are
  rejected; `crypto.subtle.importKey` called exactly once across repeated
  verifications; Redis `PING` against a dead server rejects in 0 ms; DB connect fails
  in 63 ms and stays disabled with retry scheduled.
- Not yet done for Phase 1: live Discord/Lavalink smoke test (no local stack).

## Doc history

- 2026-09-24 — review performed; findings B1-B14 / W1-W25 recorded.
- 2026-09-25 — document created with status tracking; Phase 1 marked done.
- 2026-09-25 — Phase 1 committed as `2478ceb` on
  `fix/ws-leak-and-api-hot-path-hardening` (awaiting merge).
- 2026-09-25 — Phases 2 and 3 implemented and verified locally (uncommitted):
  bot hot path + opt-in `?v=2` frames + `/access` probe; web auth/refresh, shared
  per-guild event hub with per-subscriber verification, v2 frame consumption and
  entry keys, streamed proxy.
