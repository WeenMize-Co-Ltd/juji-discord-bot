import { requireEnv } from '.'

export const token = requireEnv('DISCORD_TOKEN')
export const clientId = requireEnv('DISCORD_CLIENT_ID')

/** OAuth2 secret used by Better Auth to exchange Discord login codes. */
export const clientSecret = requireEnv('DISCORD_CLIENT_SECRET')
