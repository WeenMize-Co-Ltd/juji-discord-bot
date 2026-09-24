import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { apiPort, corsOrigins } from '../config'
import { authMiddleware, initJwks } from './middleware/auth'
import { guildAccess } from './middleware/guildAccess'
import { guilds } from './routes/guilds'
import { health } from './routes/health'
import { me } from './routes/me'
import type { AppEnv } from './types'
import { initMusicEvents, upgradeMusicWs, websocket } from './ws/music'

/**
 * Hono's logger prints the path *including* the query string, and the websocket
 * upgrade carries the caller's access token there — strip it before it reaches stdout.
 */
function redactedLog(message: string, ...rest: string[]): void {
  console.log(message.replace(/([?&](?:token|access_token)=)[^&\s]+/gi, '$1[redacted]'), ...rest)
}

const app = new Hono<AppEnv>()
  .use(logger(redactedLog))
  .use('*', cors({ origin: corsOrigins }))
  .route('/health', health)
  .get('/ws', upgradeMusicWs)
  .use('/api/*', authMiddleware)
  .use('/api/guilds/:guildId/*', guildAccess)
  .route('/api/me', me)
  .route('/api/guilds', guilds)

export type AppType = typeof app

export function startApi(): void {
  void initJwks()
  initMusicEvents()
  Bun.serve({ port: apiPort, fetch: app.fetch, websocket })
  console.log(`API listening on port ${apiPort}`)
}
