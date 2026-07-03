import { type Context, Hono } from 'hono'
import type { BassboostPreset, FilterPatch } from '../../music/filters'
import { musicManager } from '../../music/MusicManager'
import { broadcastState } from '../ws/music'

const BASSBOOST_VALUES: BassboostPreset[] = ['Low', 'Medium', 'High', 'Earrape']
const TOGGLE_KEYS = ['nightcore', 'vaporwave', 'rotation', 'karaoke', 'vibrato', 'tremolo'] as const

function guildId(c: Context): string {
  return c.req.param('guildId') ?? ''
}

async function readJson(c: Context): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await c.req.json()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export const filters = new Hono()
  .get('/', (c) => {
    const state = musicManager.getFilterState(guildId(c))
    return state ? c.json(state) : c.json({ error: 'No active player.' }, 404)
  })
  .patch('/', async (c) => {
    const body = await readJson(c)
    const patch: FilterPatch = {}

    if ('bassboost' in body) {
      const value = body.bassboost
      if (value !== null && !BASSBOOST_VALUES.includes(value as BassboostPreset)) {
        return c.json({ error: 'Invalid "bassboost" value.' }, 400)
      }
      patch.bassboost = value as BassboostPreset | null
    }
    for (const key of TOGGLE_KEYS) {
      if (key in body) {
        if (typeof body[key] !== 'boolean') {
          return c.json({ error: `"${key}" must be a boolean.` }, 400)
        }
        patch[key] = body[key]
      }
    }
    if (Object.keys(patch).length === 0) {
      return c.json({ error: 'Provide at least one filter field to update.' }, 400)
    }

    const state = await musicManager.applyFilters(guildId(c), patch)
    if (!state) return c.json({ error: 'No active player.' }, 404)
    broadcastState(guildId(c))
    return c.json(state)
  })
  .delete('/', async (c) => {
    const ok = await musicManager.clearFilters(guildId(c))
    if (!ok) return c.json({ error: 'No active player.' }, 404)
    broadcastState(guildId(c))
    return c.json({ ok: true })
  })
