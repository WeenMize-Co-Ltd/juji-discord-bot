import { type Context, Hono } from 'hono'
import { analyticsQueries, type StatsRange, statsRangeValues } from '../../database'

const DEFAULT_RANGE: StatsRange = '30d'
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50

function parseRange(c: Context): StatsRange {
  const raw = c.req.query('range') ?? ''
  return (statsRangeValues as readonly string[]).includes(raw) ? (raw as StatsRange) : DEFAULT_RANGE
}

function parseLimit(c: Context): number {
  const n = Number(c.req.query('limit'))
  if (!Number.isInteger(n) || n < 1) return DEFAULT_LIMIT
  return Math.min(n, MAX_LIMIT)
}

function guildId(c: Context): string {
  return c.req.param('guildId') ?? ''
}

export const stats = new Hono()
  .get('/summary', async (c) => c.json(await analyticsQueries.summary(guildId(c), parseRange(c))))
  .get('/listeners', async (c) =>
    c.json(await analyticsQueries.topListeners(guildId(c), parseRange(c), parseLimit(c))),
  )
  .get('/tracks', async (c) =>
    c.json(await analyticsQueries.topTracks(guildId(c), parseRange(c), parseLimit(c))),
  )
  .get('/requesters', async (c) =>
    c.json(await analyticsQueries.topRequesters(guildId(c), parseRange(c), parseLimit(c))),
  )
