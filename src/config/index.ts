export function requireEnv(key: string): string {
  const value = Bun.env[key]
  if (!value) throw new Error(`Missing required env var: ${key}`)
  return value
}

export function optionalEnv(key: string, fallback: string): string {
  const value = Bun.env[key]
  return value === undefined || value.trim() === '' ? fallback : value
}

export function numberEnv(key: string, fallback: number): number {
  const value = Bun.env[key]
  if (value === undefined || value.trim() === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function boolEnv(key: string, fallback: boolean): boolean {
  const value = Bun.env[key]
  if (value === undefined || value.trim() === '') return fallback
  return value.trim().toLowerCase() !== 'false'
}

export * from './discord'
export * from './music'
export * from './llm'
export * from './api'
