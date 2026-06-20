import { Hono } from 'hono'

export const health = new Hono().get('/', (c) =>
  c.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() }),
)
