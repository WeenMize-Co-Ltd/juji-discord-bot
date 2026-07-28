import { Hono } from 'hono'
import type { AppEnv } from '../types'

export const me = new Hono<AppEnv>().get('/', (c) => {
  const payload = c.get('jwtPayload')
  return c.json({
    id: payload.sub,
    email: payload.email,
    discordId: payload.user_metadata?.provider_id,
    name: payload.user_metadata?.full_name,
    avatarUrl: payload.user_metadata?.avatar_url,
  })
})
