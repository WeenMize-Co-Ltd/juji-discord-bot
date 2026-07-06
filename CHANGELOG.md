## [1.15.2](https://github.com/Ween-Mai-Co-Ltd/juji-discord-bot/compare/v1.15.1...v1.15.2) (2026-07-06)


### Bug Fixes

* change DJ feature to randomly play music ([25ea7fc](https://github.com/Ween-Mai-Co-Ltd/juji-discord-bot/commit/25ea7fc376fd3dfcb27634f7f5ce170c5d5d133d))

## [1.15.1](https://github.com/Ween-Mai-Co-Ltd/juji-discord-bot/compare/v1.15.0...v1.15.1) (2026-07-03)


### Bug Fixes

* **music:** enforce mutually-exclusive filters in applyFilterPatch ([35c5d8b](https://github.com/Ween-Mai-Co-Ltd/juji-discord-bot/commit/35c5d8b9bcfdd201c0f1f20f95f0cfa0d4c9054c))

# [1.15.0](https://github.com/Ween-Mai-Co-Ltd/juji-discord-bot/compare/v1.14.1...v1.15.0) (2026-07-03)


### Features

* **api:** filter endpoints + live filter broadcast ([8225c87](https://github.com/Ween-Mai-Co-Ltd/juji-discord-bot/commit/8225c879eb83ab0b57de6c9476ce4519804cdfa8))
* **music:** core Lavalink filter state + apply helpers ([c665c21](https://github.com/Ween-Mai-Co-Ltd/juji-discord-bot/commit/c665c21164b68e2590c2158f116c30b7a75f85c0))

## [1.14.1](https://github.com/Ween-Mai-Co-Ltd/juji-discord-bot/compare/v1.14.0...v1.14.1) (2026-07-02)


### Bug Fixes

* **docker:** increase lavalink jvm heap size to 4gb ([3338a6d](https://github.com/Ween-Mai-Co-Ltd/juji-discord-bot/commit/3338a6dc9930967831043ebd140df0d2663cf18f))

# [1.14.0](https://github.com/Ween-Mai-Co-Ltd/juji-discord-bot/compare/v1.13.1...v1.14.0) (2026-07-01)


### Bug Fixes

* **stats:** exclude auto-dj plays from most-played tracks ([612e269](https://github.com/Ween-Mai-Co-Ltd/juji-discord-bot/commit/612e2695b5b2e0d55d2b157773ebf6449640e38f))


### Features

* **api:** DJ config endpoints for the web settings menu ([f548a1c](https://github.com/Ween-Mai-Co-Ltd/juji-discord-bot/commit/f548a1cb8bc5048d016572916033b0860a0123bf))
* **db:** add guild_dj_configs table + migration ([9ea7561](https://github.com/Ween-Mai-Co-Ltd/juji-discord-bot/commit/9ea7561bd213abe9af3a29ce5c313a4c41ca2ca3))
* **dj:** presence-driven auto-play DjManager ([42cf7ed](https://github.com/Ween-Mai-Co-Ltd/juji-discord-bot/commit/42cf7eda433c181911906732767e64e319b94784))

## [1.13.1](https://github.com/Ween-Mai-Co-Ltd/juji-discord-bot/compare/v1.13.0...v1.13.1) (2026-07-01)


### Bug Fixes

* **api:** validate Supabase JWT and JWKS with zod ([1762c3e](https://github.com/Ween-Mai-Co-Ltd/juji-discord-bot/commit/1762c3e27f2903ae832b774755b82117041a2a78))
* **music:** surface unresolved queries as a typed not-found result ([0e3d373](https://github.com/Ween-Mai-Co-Ltd/juji-discord-bot/commit/0e3d373cc946101696180177f97df3696d9bac9d))
* **music:** validate cached history entries with zod ([5b8e5a9](https://github.com/Ween-Mai-Co-Ltd/juji-discord-bot/commit/5b8e5a964c8de59e28ed7e5a5fc00c196c7f5aed))

# [1.13.0](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/compare/v1.12.3...v1.13.0) (2026-06-29)


### Features

* **analytics:** add stats query module with redis cache ([8b98a13](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/commit/8b98a134aa7f18a0cd99b921650ffda9844f6fad))
* **api:** expose guild stats & leaderboard endpoints ([d57109c](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/commit/d57109ccd3feca2b2d5b4d98b8c4657b7f2e5580))

## [1.12.3](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/compare/v1.12.2...v1.12.3) (2026-06-29)


### Bug Fixes

* **analytics:** flush listen events on player destroy ([0754ea3](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/commit/0754ea33be07b6f824cbf7e6b08cea5d497056ce))

## [1.12.2](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/compare/v1.12.1...v1.12.2) (2026-06-29)


### Bug Fixes

* **database:** add postgres driver for drizzle-kit migrations ([f74c8f9](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/commit/f74c8f9ec621453f0e8bd9185539e3f558cd72dc))

## [1.12.1](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/compare/v1.12.0...v1.12.1) (2026-06-29)


### Bug Fixes

* **deploy:** mount postgres volume at /var/lib/postgresql for v18 layout ([5450292](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/commit/5450292398a9a8e647234f9731825a4349f2510c))

# [1.12.0](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/compare/v1.11.1...v1.12.0) (2026-06-29)


### Features

* **database:** add Postgres + Drizzle ORM analytics layer ([5a262d8](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/commit/5a262d8eb4526fcbd83e17e1cab7ee1990ca893a))
* **music:** record play and listen events on playback lifecycle ([a34c73d](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/commit/a34c73d315e40acfc2cf62d5c13f73c466b9a9cd))
* **music:** track per-user listening time via voice state ([36a2627](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/commit/36a26275e1203744ff5c928f7366c696eee0114f))

## [1.11.1](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/compare/v1.11.0...v1.11.1) (2026-06-29)


### Bug Fixes

* remove LLM feature ([4405738](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/commit/44057386379d6e8034b5ca7a2a42b6a31ac3f30c))

# [1.11.0](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/compare/v1.10.0...v1.11.0) (2026-06-27)


### Features

* **api:** record and broadcast play history over the music socket ([ee6b6c2](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/commit/ee6b6c2b7d4a44030e0678978b6828405a5bb538))
* **history:** add Redis-backed per-guild recently-played store ([e2d28fc](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/commit/e2d28fc0a1c57bbcadc18d004387fbf539e51e5c))

# [1.10.0](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/compare/v1.9.0...v1.10.0) (2026-06-27)


### Features

* **api:** summon bot into requester's voice channel when idle ([119b2e8](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/commit/119b2e8bda12bf654b9f6b4e1ce0fd2aa3a6fbd2))
* **music:** resolve a member's current voice channel ([7022ff3](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/commit/7022ff37672b842189a68768851115cb33961272))

# [1.9.0](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/compare/v1.8.1...v1.9.0) (2026-06-26)


### Features

* **api:** expose current playback position in player snapshot and ws frame ([eb9b334](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/commit/eb9b334cad3e7dd29533a7fc476aadfce9ad7836))

## [1.8.1](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/compare/v1.8.0...v1.8.1) (2026-06-24)


### Bug Fixes

* **api:** switch JWT verification from HS256 to ES256 via Supabase JWKS ([8cec369](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/commit/8cec36918ed332dd79e1b777911f75c72ec692b4))

# [1.8.0](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/compare/v1.7.1...v1.8.0) (2026-06-24)


### Features

* **api:** add Bun-native WebSocket with Lavalink event broadcasting ([714146a](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/commit/714146aed50b5818c593bf254b7b0a540594671f))
* **api:** add RESTful guild player and queue routes ([03e04dd](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/commit/03e04ddfc998cc6ac696255c2187a1c52a1fee91))
* **music:** add requester attribution and serializable player snapshot ([c1fe6ca](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/commit/c1fe6ca016ab8ea2cf23c1b9e094fc2f9c6342ee))

## [1.7.1](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/compare/v1.7.0...v1.7.1) (2026-06-24)


### Bug Fixes

* **docker:** drop root-owned lavalink_plugins volume that blocked plugin download ([53b370e](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/commit/53b370e4248a7db51e760e5d35aa75d88b7d7728))

# [1.7.0](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/compare/v1.6.0...v1.7.0) (2026-06-24)


### Features

* **config:** add Lavalink connection config, remove music-cache config ([bdd2b47](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/commit/bdd2b471d6ff351a95ce377a82e99383938bab49))

# [1.6.0](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/compare/v1.5.0...v1.6.0) (2026-06-24)


### Bug Fixes

* add missing env key ([a7d33e3](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/commit/a7d33e3b2b80ee893e20f0c5e4947d66be85ff2d))


### Features

* add Supabase JWT auth middleware and /api/me endpoint ([3b6401b](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/commit/3b6401b92068b8bb7f8a8af0df7c2b85bf689964))

# [1.5.0](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/compare/v1.4.0...v1.5.0) (2026-06-20)


### Features

* initial API service ([95623e1](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/commit/95623e140018e91f18ac58b47f5ca66a7861c765))

# [1.4.0](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/compare/v1.3.2...v1.4.0) (2026-06-19)


### Features

* add /skip command and chat action to skip the current song ([5f1ede2](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/commit/5f1ede22d8d1de813c2974d3ada42ad120bf1798))

## [1.3.2](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/compare/v1.3.1...v1.3.2) (2026-06-19)


### Bug Fixes

* update system prompt ([5bbe646](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/commit/5bbe646b113fb3537e73435ed56a5128c52313ad))

## [1.3.1](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/compare/v1.3.0...v1.3.1) (2026-06-18)


### Bug Fixes

* blank env defaults value ([f3b7f66](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/commit/f3b7f66d4cf054b4bec48007200be21b911df279))

# [1.3.0](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/compare/v1.2.1...v1.3.0) (2026-06-18)


### Features

* stream tracks over 10 min instead of caching to disk ([ea8325a](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/commit/ea8325a3dc86d2a983c47de8402d831fe8577798))

## [1.2.1](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/compare/v1.2.0...v1.2.1) (2026-06-17)


### Bug Fixes

* use deno instead of node for yt-dlp signature solving ([624bfc5](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/commit/624bfc53e37c4f9721d42748d28705024b9a6d29))

# [1.2.0](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/compare/v1.1.0...v1.2.0) (2026-06-17)


### Features

* integrate LLM to chat bot and music feature ([8be440c](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/commit/8be440ca549f652eb82843d0b5fb632538ffa97b))

# [1.1.0](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/compare/v1.0.1...v1.1.0) (2026-06-16)


### Features

* add music cache file retention ([82c5ebd](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/commit/82c5ebde94c8f65088c52713c3aab32bd06a0edf))

## [1.0.1](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/compare/v1.0.0...v1.0.1) (2026-06-16)


### Bug Fixes

* copy yt-dlp cookies to a writable dir to avoid read-only secret mount ([a262c44](https://github.com/Ween-Mais-Co-Ltd/juji-discord-bot/commit/a262c4463a9569f5c2858efdabc5ad29c108e14d))

# 1.0.0 (2026-06-16)


### Bug Fixes

* avoid non-null assertion in cooldown lookup ([68b3299](https://github.com/Ween-Mai-Co-Ltd/juji-discord-bot/commit/68b32995163caf19811d6dee2532e10ddf7e3d90))


### Features

* add docker files ([2eaa8e9](https://github.com/Ween-Mai-Co-Ltd/juji-discord-bot/commit/2eaa8e9225abc91a1f5db8bacb16f8a545b2c2ff))
* add github action deployment ([db022a1](https://github.com/Ween-Mai-Co-Ltd/juji-discord-bot/commit/db022a12c5562114e3fdf3cdcc293ed758b5d32f))
* add help command ([2d4bcff](https://github.com/Ween-Mai-Co-Ltd/juji-discord-bot/commit/2d4bcff375a2b4be9021f73c4279471acc19ef80))
* add music player with play/stop commands ([947f1af](https://github.com/Ween-Mai-Co-Ltd/juji-discord-bot/commit/947f1af473749df2e102fb0c2b8ca2b6d9506fe8))
* initial project ([548fa7b](https://github.com/Ween-Mai-Co-Ltd/juji-discord-bot/commit/548fa7bb7882cd358eb828529991109853efdee5))
