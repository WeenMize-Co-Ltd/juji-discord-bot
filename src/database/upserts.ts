import { sql } from 'drizzle-orm'
import { db } from './client'
import { tracks, users } from './schema'

export function upsertTrack(
  id: string,
  values: {
    title: string
    author: string
    url: string
    thumbnail: string | null
    durationSec: number
    sourceName: string
  },
): Promise<unknown> {
  return db
    .insert(tracks)
    .values({ id, ...values })
    .onConflictDoUpdate({
      target: tracks.id,
      set: { ...values, updatedAt: new Date() },
      setWhere: sql`${tracks.title} is distinct from excluded.title
        or ${tracks.author} is distinct from excluded.author
        or ${tracks.url} is distinct from excluded.url
        or ${tracks.thumbnail} is distinct from excluded.thumbnail
        or ${tracks.durationSec} is distinct from excluded.duration_sec
        or ${tracks.sourceName} is distinct from excluded.source_name`,
    })
}

export function upsertUsers(
  rows: { id: string; displayName: string; avatarUrl?: string }[],
): Promise<unknown> {
  return db
    .insert(users)
    .values(rows.map((row) => ({ ...row, avatarUrl: row.avatarUrl ?? null })))
    .onConflictDoUpdate({
      target: users.id,
      set: {
        displayName: sql`excluded.display_name`,
        avatarUrl: sql`coalesce(excluded.avatar_url, ${users.avatarUrl})`,
        updatedAt: new Date(),
      },
      setWhere: sql`${users.displayName} is distinct from excluded.display_name
        or ${users.avatarUrl} is distinct from coalesce(excluded.avatar_url, ${users.avatarUrl})`,
    })
}
