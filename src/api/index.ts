import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { apiPort, corsOrigins } from '../config'
import { health } from './routes/health'

const app = new Hono()
  .use(logger())
  .use('*', cors({ origin: corsOrigins }))
  .route('/health', health)

export function startApi(): void {
  Bun.serve({ port: apiPort, fetch: app.fetch })
  console.log(`API listening on port ${apiPort}`)
}
