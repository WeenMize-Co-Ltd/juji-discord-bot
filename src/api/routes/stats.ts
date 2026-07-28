import { Hono } from 'hono'
import { z } from 'zod'
import { analyticsQueries, type StatsRange, statsRangeValues } from '../../database'
import type { AppEnv } from '../types'
import { zValidator } from '../validator'

const DEFAULT_RANGE: StatsRange = '30d'
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50

/** Unknown or absent values fall back to the defaults rather than 400ing. */
const StatsQuerySchema = z.object({
  range: z.enum(statsRangeValues).catch(DEFAULT_RANGE),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).catch(DEFAULT_LIMIT),
})

const query = zValidator('query', StatsQuerySchema)

export const stats = new Hono<AppEnv>()
  .get('/summary', query, async (c) =>
    c.json(await analyticsQueries.summary(c.get('guildId'), c.req.valid('query').range)),
  )
  .get('/listeners', query, async (c) => {
    const { range, limit } = c.req.valid('query')
    return c.json(await analyticsQueries.topListeners(c.get('guildId'), range, limit))
  })
  .get('/tracks', query, async (c) => {
    const { range, limit } = c.req.valid('query')
    return c.json(await analyticsQueries.topTracks(c.get('guildId'), range, limit))
  })
  .get('/requesters', query, async (c) => {
    const { range, limit } = c.req.valid('query')
    return c.json(await analyticsQueries.topRequesters(c.get('guildId'), range, limit))
  })
