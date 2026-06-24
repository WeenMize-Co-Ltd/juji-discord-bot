import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { apiPort, corsOrigins } from '../config'
import { authMiddleware } from './middleware/auth'
import { guilds } from './routes/guilds'
import { health } from './routes/health'
import { me } from './routes/me'
import { initMusicEvents, upgradeMusicWs, websocket } from './ws/music'

const app = new Hono()
  .use(logger())
  .use('*', cors({ origin: corsOrigins }))
  .route('/health', health)
  .get('/ws', upgradeMusicWs)
  .use('/api/*', authMiddleware)
  .route('/api/me', me)
  .route('/api/guilds', guilds)

export function startApi(): void {
  initMusicEvents()
  Bun.serve({ port: apiPort, fetch: app.fetch, websocket })
  console.log(`API listening on port ${apiPort}`)
}
