import { numberEnv, optionalEnv } from '.'

export const redisUrl = optionalEnv('REDIS_URL', 'redis://redis:6379')
export const historyTtlSeconds = numberEnv('HISTORY_TTL_SECONDS', 86_400) // 24h
export const historyMax = numberEnv('HISTORY_MAX', 50)
