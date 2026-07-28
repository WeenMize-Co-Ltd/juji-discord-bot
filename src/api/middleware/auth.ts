import type { Context, Next } from 'hono'
// Imported from `hono/utils/jwt` rather than `hono/jwt`: the latter globally augments
// Hono's ContextVariableMap with an untyped `jwtPayload`, which would defeat `AppEnv`.
import { Jwt } from 'hono/utils/jwt'
import { z } from 'zod'
import { supabaseUrl } from '../../config'
import { type SupabaseJwtPayload, SupabaseJwtPayloadSchema } from '../types'

/** Supabase signs with ES256 today; RS256 is accepted so a key rotation can't lock us out. */
const ALLOWED_ALGORITHMS = ['ES256', 'RS256'] as const

/** Steady-state lifetime of the cached key set. */
const JWKS_TTL_MS = 10 * 60_000
/** Floor between forced refetches, so an unknown `kid` can't be used to hammer Supabase. */
const JWKS_MIN_REFETCH_MS = 30_000

/** hono doesn't export its JWK type from a public subpath, so read it off the signature. */
type JwksKey = NonNullable<Parameters<typeof Jwt.verifyWithJwks>[1]['keys']>[number]

const JwksSchema = z.object({ keys: z.array(z.custom<JwksKey>()) })

const issuer = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1`
const jwksUri = `${issuer}/.well-known/jwks.json`

/**
 * Caches Supabase's JWKS. Hono's `verifyWithJwks` would refetch on every request if
 * handed a `jwks_uri`, so we hold the key set here and pass it in as `keys`.
 */
class SupabaseJwks {
  private keys: JwksKey[] = []
  private fetchedAtMs = 0
  private inflight: Promise<JwksKey[]> | null = null

  /** Cached keys, fetching once if empty or past the TTL. */
  async get(): Promise<JwksKey[]> {
    if (this.keys.length > 0 && Date.now() - this.fetchedAtMs < JWKS_TTL_MS) return this.keys
    return this.refresh()
  }

  /** Force a refetch, coalescing concurrent callers onto one request. */
  refresh(): Promise<JwksKey[]> {
    this.inflight ??= this.fetch().finally(() => {
      this.inflight = null
    })
    return this.inflight
  }

  /**
   * Refetch only if the floor has elapsed — called when a token carries a `kid` we
   * don't know, which is either a real rotation or a forged header.
   */
  async refreshIfStale(): Promise<JwksKey[]> {
    if (Date.now() - this.fetchedAtMs < JWKS_MIN_REFETCH_MS) return this.keys
    return this.refresh()
  }

  private async fetch(): Promise<JwksKey[]> {
    const res = await fetch(jwksUri)
    if (!res.ok) throw new Error(`Failed to fetch Supabase JWKS: ${res.status}`)
    const { keys } = JwksSchema.parse(await res.json())
    if (keys.length === 0) throw new Error('Supabase JWKS response contained no keys')
    this.keys = keys
    this.fetchedAtMs = Date.now()
    return keys
  }
}

const jwks = new SupabaseJwks()

/**
 * Warms the JWKS cache. Deliberately non-fatal: Supabase being unreachable at boot
 * must not stop the Discord bot from starting — the keys are fetched lazily instead.
 */
export async function initJwks(): Promise<void> {
  try {
    await jwks.refresh()
    console.log('[auth] Supabase JWKS loaded')
  } catch (error) {
    console.warn('[auth] could not preload Supabase JWKS; will retry on first request:', error)
  }
}

export async function verifySupabaseJwt(token: string): Promise<SupabaseJwtPayload> {
  const header = Jwt.decode(token).header

  let keys = await jwks.get()
  if (header.kid && !keys.some((key) => key.kid === header.kid)) {
    keys = await jwks.refreshIfStale()
  }

  const payload = await Jwt.verifyWithJwks(token, {
    keys,
    allowedAlgorithms: ALLOWED_ALGORITHMS,
    verification: { iss: issuer, aud: 'authenticated' },
  })
  return SupabaseJwtPayloadSchema.parse(payload)
}

export const authMiddleware = async (c: Context, next: Next): Promise<Response | undefined> => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401)
  }
  try {
    const payload = await verifySupabaseJwt(authHeader.slice(7))
    c.set('jwtPayload', payload)
    await next()
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401)
  }
}
