import { type Context, Hono } from 'hono'
import { musicManager } from '../../music/MusicManager'
import { musicService } from '../../music/MusicService'
import { broadcastState } from '../ws/music'
import type { SupabaseJwtPayload } from '../types'

function requesterName(payload: SupabaseJwtPayload, claimed?: unknown): string {
  if (typeof claimed === 'string' && claimed.trim()) return claimed.trim()
  return (
    payload.user_metadata?.custom_claims?.global_name ??
    payload.user_metadata?.full_name ??
    payload.email ??
    'unknown'
  )
}

async function readJson(c: Context): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await c.req.json()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export const guilds = new Hono()
  .get('/:guildId/player', (c) => {
    const snapshot = musicManager.getSnapshot(c.req.param('guildId'))
    return c.json(
      snapshot ?? { status: 'paused', position: 0, volume: 0, current: null, queue: [] },
    )
  })
  .patch('/:guildId/player', async (c) => {
    const guildId = c.req.param('guildId')
    const body = await readJson(c)
    const { paused, volume } = body

    if (paused === undefined && volume === undefined) {
      return c.json({ error: 'Provide "paused" and/or "volume".' }, 400)
    }

    if (paused !== undefined) {
      if (typeof paused !== 'boolean') return c.json({ error: '"paused" must be a boolean.' }, 400)
      const ok = await musicManager.setPaused(guildId, paused)
      if (!ok) return c.json({ error: 'No active player.' }, 404)
    }
    if (volume !== undefined) {
      if (typeof volume !== 'number' || !Number.isFinite(volume)) {
        return c.json({ error: '"volume" must be a number.' }, 400)
      }
      const ok = await musicManager.setVolume(guildId, volume)
      if (!ok) return c.json({ error: 'No active player.' }, 404)
    }

    broadcastState(guildId)
    return c.json(musicManager.getSnapshot(guildId))
  })
  .post('/:guildId/player/next', async (c) => {
    const guildId = c.req.param('guildId')
    const result = await musicService.skip(guildId)
    if (!result) return c.json({ error: 'Nothing is playing.' }, 409)
    broadcastState(guildId)
    return c.json(result)
  })

  .get('/:guildId/queue', (c) => {
    const snapshot = musicManager.getSnapshot(c.req.param('guildId'))
    return c.json({ current: snapshot?.current ?? null, items: snapshot?.queue ?? [] })
  })
  .post('/:guildId/queue', async (c) => {
    const guildId = c.req.param('guildId')
    const body = await readJson(c)
    const url = body.url
    if (typeof url !== 'string' || !url.trim()) {
      return c.json({ error: 'A "url" is required.' }, 400)
    }

    const payload = c.get('jwtPayload') as SupabaseJwtPayload
    const username = requesterName(payload, body.username)
    const discordUserId = payload.user_metadata?.provider_id

    try {
      const result = await musicService.addOrSummon(
        guildId,
        url.trim(),
        { username },
        discordUserId,
      )
      if (!result.ok) {
        if (result.reason === 'user-not-in-voice') {
          return c.json({ error: 'user_not_in_voice' }, 409)
        }
        if (result.reason === 'join-failed') {
          return c.json({ error: 'bot_join_failed' }, 409)
        }
        return c.json({ error: "Live streams aren't supported." }, 422)
      }
      broadcastState(guildId)
      return c.json({ ok: true, position: result.position, track: result.track }, 201)
    } catch {
      return c.json({ error: `No results found for: ${url}` }, 404)
    }
  })
  .delete('/:guildId/queue/:position', async (c) => {
    const guildId = c.req.param('guildId')
    const position = Number(c.req.param('position'))
    if (!Number.isInteger(position) || position < 1) {
      return c.json({ error: 'Invalid position.' }, 400)
    }
    const ok = await musicManager.removeAt(guildId, position)
    if (!ok) return c.json({ error: 'No such queue item.' }, 404)
    broadcastState(guildId)
    return c.json({ ok: true })
  })
  .patch('/:guildId/queue/:position', async (c) => {
    const guildId = c.req.param('guildId')
    const from = Number(c.req.param('position'))
    const body = await readJson(c)
    const to = Number(body.to)
    if (!Number.isInteger(from) || from < 1 || !Number.isInteger(to) || to < 1) {
      return c.json({ error: 'Invalid "position" or "to".' }, 400)
    }
    const ok = await musicManager.move(guildId, from, to)
    if (!ok) return c.json({ error: 'No such queue item.' }, 404)
    broadcastState(guildId)
    return c.json({ ok: true })
  })
