import { RedisClient } from 'bun'
import { redisUrl } from '../config'

/**
 * Redis is a best-effort cache in this app (stats, guild-access, history). Bun's
 * defaults queue commands while the connection is down (`enableOfflineQueue: true`)
 * and retry for ~10s, so a Redis outage would turn every `try { await redis… } catch`
 * fall-through into a multi-second request stall. Fail fast instead: callers already
 * fall back to Postgres / Discord when a command rejects.
 */
export const redis = new RedisClient(redisUrl, {
  enableOfflineQueue: false,
  connectionTimeout: 2_000,
  maxRetries: 3,
})
