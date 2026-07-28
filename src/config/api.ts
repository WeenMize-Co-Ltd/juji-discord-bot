import { numberEnv, optionalEnv } from '.'

export const apiPort = numberEnv('API_PORT', 3000)

// Closed by default: an unset API_CORS_ORIGINS allows no browser origin at all.
// Set it explicitly (comma-separated, or `*`) to open the API up.
const corsOriginsRaw = optionalEnv('API_CORS_ORIGINS', '')
export const corsOrigins =
  corsOriginsRaw === '*'
    ? '*'
    : corsOriginsRaw
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
