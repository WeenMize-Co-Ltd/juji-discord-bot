import { Hono } from 'hono'
import { z } from 'zod'
import { musicManager } from '../../music/MusicManager'
import { musicService } from '../../music/MusicService'
import { toQueueItem } from '../../music/snapshot'
import { broadcastState } from '../ws/music'
import type { AppEnv, SupabaseJwtPayload } from '../types'
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
})

const PositionParamSchema = z.object({
  position: z.coerce.number().int().min(1, 'Invalid position.'),
})

const positionParam = zValidator('param', PositionParamSchema)

function requesterName(payload: SupabaseJwtPayload, claimed?: string): string {
  if (claimed) return claimed
  return (
    payload.user_metadata?.custom_claims?.global_name ??
    payload.user_metadata?.full_name ??
    payload.email ??
    'unknown'
  )
}

export const guilds = new Hono<AppEnv>()
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

    broadcastState(guildId)
    return c.json(musicManager.getSnapshot(guildId))
  })
  .post('/:guildId/player/next', async (c) => {
    const guildId = c.get('guildId')
    const result = await musicService.skip(guildId)
    if (!result) return c.json({ error: 'Nothing is playing.' }, 409)
    broadcastState(guildId)
    return c.json({
      skipped: toQueueItem(result.skipped),
      next: result.next ? toQueueItem(result.next) : null,
    })
  })
  .post('/:guildId/player/jump/:position', positionParam, async (c) => {
    const guildId = c.get('guildId')
    const result = await musicManager.jumpTo(guildId, c.req.valid('param').position)
    if (!result) return c.json({ error: 'No such queue item.' }, 404)
    broadcastState(guildId)
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
    const discordUserId = payload.user_metadata?.provider_id

    try {
      const result = await musicService.addOrSummon(
        guildId,
        url,
        {
          username: requesterName(payload, username),
          discordUserId,
          avatarUrl: payload.user_metadata?.avatar_url,
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
      broadcastState(guildId)
      return c.json({ ok: true, position: result.position, track: toQueueItem(result.track) }, 201)
    } catch (err) {
      console.error('[api] failed to add track to queue:', err)
      return c.json({ error: 'Internal server error' }, 500)
    }
  })
  .delete('/:guildId/queue/:position', positionParam, async (c) => {
    const guildId = c.get('guildId')
    const ok = await musicManager.removeAt(guildId, c.req.valid('param').position)
    if (!ok) return c.json({ error: 'No such queue item.' }, 404)
    broadcastState(guildId)
    return c.json({ ok: true })
  })
  .patch('/:guildId/queue/:position', positionParam, zValidator('json', MoveSchema), async (c) => {
    const guildId = c.get('guildId')
    const ok = await musicManager.move(
      guildId,
      c.req.valid('param').position,
      c.req.valid('json').to,
    )
    if (!ok) return c.json({ error: 'No such queue item.' }, 404)
    broadcastState(guildId)
    return c.json({ ok: true })
  })
  .route('/:guildId/stats', stats)
  .route('/:guildId/dj', dj)
  .route('/:guildId/filters', filters)
