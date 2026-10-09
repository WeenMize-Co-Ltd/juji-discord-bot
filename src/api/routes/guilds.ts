import { Hono } from 'hono'
import { z } from 'zod'
import { addedTracksRecorder } from '../../database'
import { musicManager } from '../../music/MusicManager'
import { getDiscordClient } from '../../music/lavalink'
import { musicService } from '../../music/MusicService'
import { toQueueItem } from '../../music/snapshot'
import { publishState } from '../ws/music'
import type { AppEnv, AuthJwtPayload } from '../types'
import { zValidator } from '../validator'
import { dj } from './dj'
import { filters } from './filters'
import { stats } from './stats'

const EMPTY_SNAPSHOT = {
  status: 'paused',
  position: 0,
  volume: 0,
  current: null,
  queue: [],
  filters: {
    bassboost: null,
    nightcore: false,
    vaporwave: false,
    rotation: false,
    karaoke: false,
    vibrato: false,
    tremolo: false,
  },
} as const

const PlayerPatchSchema = z
  .object({
    paused: z.boolean(),
    volume: z.number(),
  })
  .partial()
  .refine((patch) => patch.paused !== undefined || patch.volume !== undefined, {
    message: 'Provide "paused" and/or "volume".',
  })

const AddTrackSchema = z.object({
  url: z.string().trim().min(1, 'A "url" is required.'),
  username: z.string().trim().min(1).optional(),
})

const MoveSchema = z.object({
  to: z.number().int().min(1, '"to" must be a positive queue position.'),
  username: z.string().trim().min(1).optional(),
})

const PositionParamSchema = z.object({
  position: z.coerce.number().int().min(1, 'Invalid position.'),
})

const IdsQuerySchema = z.object({
  ids: z
    .string()
    .transform((s) => s.split(',').filter(Boolean))
    .pipe(z.array(z.string().regex(/^\d{17,20}$/, 'Invalid guild id.')).max(200)),
})

const positionParam = zValidator('param', PositionParamSchema)

function requesterName(payload: AuthJwtPayload, claimed?: string): string {
  if (claimed) return claimed
  return payload.name ?? payload.email ?? 'unknown'
}

export const guilds = new Hono<AppEnv>()
  .get('/', zValidator('query', IdsQuerySchema), (c) => {
    const client = getDiscordClient()
    const found = c.req.valid('query').ids.flatMap((id) => {
      const g = client?.guilds.cache.get(id)
      return g ? [{ id: g.id, name: g.name, icon: g.iconURL({ size: 64 }) }] : []
    })
    return c.json(found)
  })
  .get('/:guildId/access', (c) => c.json({ ok: true }))
  .get('/:guildId/player', (c) =>
    c.json(musicManager.getSnapshot(c.get('guildId')) ?? EMPTY_SNAPSHOT),
  )
  .patch('/:guildId/player', zValidator('json', PlayerPatchSchema), async (c) => {
    const guildId = c.get('guildId')
    const { paused, volume } = c.req.valid('json')

    if (paused !== undefined && !(await musicManager.setPaused(guildId, paused))) {
      return c.json({ error: 'No active player.' }, 404)
    }
    if (volume !== undefined && !(await musicManager.setVolume(guildId, volume))) {
      return c.json({ error: 'No active player.' }, 404)
    }

    const snapshot = musicManager.getSnapshot(guildId)
    publishState(guildId, snapshot)
    return c.json(snapshot)
  })
  .post('/:guildId/player/next', async (c) => {
    const guildId = c.get('guildId')
    const result = await musicService.skip(guildId)
    if (!result) return c.json({ error: 'Nothing is playing.' }, 409)
    publishState(guildId)
    return c.json({
      skipped: toQueueItem(result.skipped),
      next: result.next ? toQueueItem(result.next) : null,
    })
  })
  .post('/:guildId/player/jump/:position', positionParam, async (c) => {
    const guildId = c.get('guildId')
    const result = await musicManager.jumpTo(guildId, c.req.valid('param').position)
    if (!result) return c.json({ error: 'No such queue item.' }, 404)
    publishState(guildId)
    return c.json({ skipped: toQueueItem(result.skipped), next: toQueueItem(result.next) })
  })

  .get('/:guildId/queue', (c) => {
    const snapshot = musicManager.getSnapshot(c.get('guildId'))
    return c.json({ current: snapshot?.current ?? null, items: snapshot?.queue ?? [] })
  })
  .post('/:guildId/queue', zValidator('json', AddTrackSchema), async (c) => {
    const guildId = c.get('guildId')
    const { url, username } = c.req.valid('json')

    const payload = c.get('jwtPayload')
    const discordUserId = payload.discord_id

    try {
      const result = await musicService.addOrSummon(
        guildId,
        url,
        {
          username: requesterName(payload, username),
          discordUserId,
          avatarUrl: payload.image,
          requestSource: 'api',
        },
        discordUserId,
      )
      if (!result.ok) {
        if (result.reason === 'not-found') {
          return c.json({ error: `No results found for: ${url}` }, 404)
        }
        if (result.reason === 'user-not-in-voice') {
          return c.json({ error: 'user_not_in_voice' }, 409)
        }
        if (result.reason === 'join-failed') {
          return c.json({ error: 'bot_join_failed' }, 409)
        }
        return c.json({ error: "Live streams aren't supported." }, 422)
      }
      publishState(guildId)
      return c.json({ ok: true, position: result.position, track: toQueueItem(result.track) }, 201)
    } catch (err) {
      console.error('[api] failed to add track to queue:', err)
      return c.json({ error: 'Internal server error' }, 500)
    }
  })
  .get('/:guildId/added', async (c) => {
    const discordUserId = c.get('jwtPayload').discord_id
    if (!discordUserId) return c.json({ error: 'Not authenticated.' }, 401)
    const items = await addedTracksRecorder.list(c.get('guildId'), discordUserId)
    return c.json({ items })
  })
  .delete('/:guildId/queue/:position', positionParam, async (c) => {
    const guildId = c.get('guildId')
    const ok = await musicManager.removeAt(guildId, c.req.valid('param').position)
    if (!ok) return c.json({ error: 'No such queue item.' }, 404)
    publishState(guildId)
    return c.json({ ok: true })
  })
  .patch('/:guildId/queue/:position', positionParam, zValidator('json', MoveSchema), async (c) => {
    const guildId = c.get('guildId')
    const { to, username } = c.req.valid('json')
    const payload = c.get('jwtPayload')

    const ok = await musicManager.move(guildId, c.req.valid('param').position, to, {
      username: requesterName(payload, username),
      discordUserId: payload.discord_id,
      avatarUrl: payload.image,
      requestSource: 'api',
    })
    if (!ok) return c.json({ error: 'No such queue item.' }, 404)
    publishState(guildId)
    return c.json({ ok: true })
  })
  .route('/:guildId/stats', stats)
  .route('/:guildId/dj', dj)
  .route('/:guildId/filters', filters)
