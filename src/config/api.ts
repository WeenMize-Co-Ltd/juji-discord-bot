import { numberEnv, optionalEnv } from '.'

export const apiPort = numberEnv('API_PORT', 3000)

const corsOriginsRaw = optionalEnv('API_CORS_ORIGINS', '*')
export const corsOrigins =
  corsOriginsRaw === '*' ? '*' : corsOriginsRaw.split(',').map((o) => o.trim())
