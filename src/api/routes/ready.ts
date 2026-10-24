import { Hono } from 'hono'
import { getDiscordClient } from '../../music/lavalink'
import type { AppEnv } from '../types'

export const ready = new Hono<AppEnv>().get('/', (c) => {
  if (!getDiscordClient()?.isReady()) return c.json({ status: 'not_ready' }, 503)
  return c.json({ status: 'ready' }, 200)
})
