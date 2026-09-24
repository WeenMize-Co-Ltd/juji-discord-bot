import type { Context, Next } from 'hono'
import { Jwt } from 'hono/utils/jwt'
import { z } from 'zod'
import { supabaseUrl } from '../../config'
import { type SupabaseJwtPayload, SupabaseJwtPayloadSchema } from '../types'

type AllowedAlgorithm = 'ES256' | 'RS256'

const JWKS_TTL_MS = 10 * 60_000
const JWKS_MIN_REFETCH_MS = 30_000
const JWKS_FETCH_TIMEOUT_MS = 3_000
const JWKS_FAILURE_BACKOFF_MS = 30_000

type JwksKey = NonNullable<Parameters<typeof Jwt.verifyWithJwks>[1]['keys']>[number]

type ImportableJwk = JwksKey & { alg?: string }

const JwksSchema = z.object({ keys: z.array(z.custom<JwksKey>()) })

const issuer = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1`
const jwksUri = `${issuer}/.well-known/jwks.json`

interface CachedKey {
  kid: string | undefined
  alg: AllowedAlgorithm
  key: CryptoKey
}

function toAllowedAlgorithm(alg: string | undefined): AllowedAlgorithm | null {
  return alg === 'ES256' || alg === 'RS256' ? alg : null
}

function importAlgorithm(alg: AllowedAlgorithm) {
  return alg === 'ES256'
    ? { name: 'ECDSA', namedCurve: 'P-256' }
    : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
}

async function importJwk(jwk: ImportableJwk): Promise<CachedKey> {
  const alg = toAllowedAlgorithm(jwk.alg)
  if (!alg) throw new Error(`Unsupported JWKS algorithm: ${jwk.alg ?? 'missing'}`)
  const key = await crypto.subtle.importKey('jwk', jwk, importAlgorithm(alg), false, ['verify'])
  return { kid: jwk.kid, alg, key }
}

class SupabaseJwks {
  private keys: CachedKey[] = []
  private fetchedAtMs = 0
  private failedAtMs = 0
  private inflight: Promise<CachedKey[]> | null = null

  async get(): Promise<CachedKey[]> {
    if (this.keys.length > 0 && Date.now() - this.fetchedAtMs < JWKS_TTL_MS) return this.keys
    if (Date.now() - this.failedAtMs < JWKS_FAILURE_BACKOFF_MS) {
      if (this.keys.length > 0) return this.keys
      throw new Error('Supabase JWKS unavailable (recent fetch failed)')
    }
    return this.refresh()
  }

  refresh(): Promise<CachedKey[]> {
    this.inflight ??= this.fetch()
      .catch((error: unknown) => {
        this.failedAtMs = Date.now()
        throw error
      })
      .finally(() => {
        this.inflight = null
      })
    return this.inflight
  }

  async refreshIfStale(): Promise<CachedKey[]> {
    if (Date.now() - this.fetchedAtMs < JWKS_MIN_REFETCH_MS) return this.keys
    return this.refresh()
  }

  private async fetch(): Promise<CachedKey[]> {
    const res = await fetch(jwksUri, { signal: AbortSignal.timeout(JWKS_FETCH_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`Failed to fetch Supabase JWKS: ${res.status}`)
    const { keys } = JwksSchema.parse(await res.json())
    if (keys.length === 0) throw new Error('Supabase JWKS response contained no keys')
    const imported = await Promise.all(keys.map(importJwk))
    this.keys = imported
    this.fetchedAtMs = Date.now()
    return imported
  }
}

const jwks = new SupabaseJwks()

export async function initJwks(): Promise<void> {
  try {
    await jwks.refresh()
    console.log('[auth] Supabase JWKS loaded')
  } catch (error) {
    console.warn('[auth] could not preload Supabase JWKS; will retry on first request:', error)
  }
}

export async function verifySupabaseJwt(token: string): Promise<SupabaseJwtPayload> {
  const { header } = Jwt.decode(token)
  const alg = toAllowedAlgorithm(header.alg)
  if (!alg) throw new Error(`Unsupported token algorithm: ${header.alg}`)

  let keys = await jwks.get()
  let match = keys.find((key) => key.kid === header.kid)
  if (!match) {
    keys = await jwks.refreshIfStale()
    match = keys.find((key) => key.kid === header.kid)
  }
  if (!match) throw new Error('No JWKS key matches the token kid')
  if (match.alg !== alg) throw new Error('JWKS key algorithm does not match the token')

  const payload = await Jwt.verify(token, match.key, {
    alg,
    iss: issuer,
    aud: 'authenticated',
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
