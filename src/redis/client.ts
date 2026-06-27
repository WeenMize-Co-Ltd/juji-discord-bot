import { RedisClient } from 'bun'
import { redisUrl } from '../config'

export const redis = new RedisClient(redisUrl)
