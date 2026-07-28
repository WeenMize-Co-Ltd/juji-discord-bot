import { Hono } from 'hono'
import { z } from 'zod'
import { bassboostPresetValues, type FilterPatch } from '../../music/filters'
import { musicManager } from '../../music/MusicManager'
import { broadcastState } from '../ws/music'
import type { AppEnv } from '../types'
import { zValidator } from '../validator'

const FilterPatchSchema = z
  .object({
    bassboost: z.enum(bassboostPresetValues).nullable(),
    nightcore: z.boolean(),
    vaporwave: z.boolean(),
    rotation: z.boolean(),
    karaoke: z.boolean(),
    vibrato: z.boolean(),
    tremolo: z.boolean(),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'Provide at least one filter field to update.',
  })

export const filters = new Hono<AppEnv>()
  .get('/', (c) => {
    const state = musicManager.getFilterState(c.get('guildId'))
    return state ? c.json(state) : c.json({ error: 'No active player.' }, 404)
  })
  .patch('/', zValidator('json', FilterPatchSchema), async (c) => {
    const guildId = c.get('guildId')
    const patch: FilterPatch = c.req.valid('json')

    const state = await musicManager.applyFilters(guildId, patch)
    if (!state) return c.json({ error: 'No active player.' }, 404)
    broadcastState(guildId)
    return c.json(state)
  })
  .delete('/', async (c) => {
    const guildId = c.get('guildId')
    const ok = await musicManager.clearFilters(guildId)
    if (!ok) return c.json({ error: 'No active player.' }, 404)
    broadcastState(guildId)
    return c.json({ ok: true })
  })
