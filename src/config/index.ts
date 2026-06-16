export function requireEnv(key: string): string {
  const value = Bun.env[key]
  if (!value) throw new Error(`Missing required env var: ${key}`)
  return value
}

export * from './discord'
export * from './music'
