import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { z } from 'zod'
import { featureFlags } from '../../features/FeatureFlags'
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

/**
 * The listening stats board is a per-guild feature flag; when it is off the
 * endpoints are unreachable even outside the web panel, so the flag cannot be
 * bypassed by calling the API directly.
 */
const requireStatsBoard = createMiddleware<AppEnv>(async (c, next) => {
  if (!(await featureFlags.isEnabled(c.get('guildId'), 'stats_board'))) {
    return c.json({ error: 'feature_disabled' }, 403)
  }
  await next()
  return undefined
})

export const stats = new Hono<AppEnv>()
  .use(requireStatsBoard)
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
