import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const requestSourceValues = ['slash', 'api', 'auto-dj'] as const
export type RequestSource = (typeof requestSourceValues)[number]

export const endReasonValues = ['finished', 'loadFailed', 'stopped', 'replaced', 'cleanup'] as const
export type EndReason = (typeof endReasonValues)[number]

export const users = pgTable('users', {
  id: text('id').primaryKey(), // Discord snowflake
  displayName: text('display_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const tracks = pgTable('tracks', {
  id: text('id').primaryKey(), // Lavalink info.identifier
  title: text('title').notNull(),
  author: text('author').notNull(),
  url: text('url').notNull(),
  thumbnail: text('thumbnail'),
  durationSec: integer('duration_sec').notNull(),
  sourceName: text('source_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const playEvents = pgTable(
  'play_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: text('guild_id').notNull(),
    trackId: text('track_id')
      .notNull()
      .references(() => tracks.id),
    discordUserId: text('discord_user_id').references(() => users.id), // null for auto-dj
    query: text('query'),
    requestSource: text('request_source').$type<RequestSource>().notNull(),
    voiceChannelId: text('voice_channel_id'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    endReason: text('end_reason').$type<EndReason>(),
    listenedSec: integer('listened_sec'),
  },
  (t) => [
    index('play_events_guild_started_idx').on(t.guildId, t.startedAt),
    index('play_events_track_started_idx').on(t.trackId, t.startedAt),
    index('play_events_user_started_idx').on(t.discordUserId, t.startedAt),
    index('play_events_guild_track_idx').on(t.guildId, t.trackId),
  ],
)

export const guildDjConfigs = pgTable('guild_dj_configs', {
  guildId: text('guild_id').primaryKey(),
  voiceChannelId: text('voice_channel_id').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const listenEvents = pgTable(
  'listen_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playEventId: uuid('play_event_id')
      .notNull()
      .references(() => playEvents.id),
    guildId: text('guild_id').notNull(),
    discordUserId: text('discord_user_id')
      .notNull()
      .references(() => users.id),
    listenedSec: integer('listened_sec').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('listen_events_user_idx').on(t.discordUserId),
    index('listen_events_play_event_idx').on(t.playEventId),
    index('listen_events_guild_created_idx').on(t.guildId, t.createdAt),
  ],
)
