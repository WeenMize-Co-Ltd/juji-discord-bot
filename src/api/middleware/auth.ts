import type { Context, Next } from 'hono'
import { Jwt } from 'hono/utils/jwt'
import { auth } from '../../auth'
import { authAudience, authIssuer } from '../../config'
import { type AuthJwtPayload, AuthJwtPayloadSchema } from '../types'

type AllowedAlgorithm = 'ES256' | 'RS256'

const JWKS_TTL_MS = 10 * 60_000

type JwksKey = NonNullable<Parameters<typeof Jwt.verifyWithJwks>[1]['keys']>[number]

type ImportableJwk = JwksKey & { alg?: string }

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

/**
 * Better Auth runs in this same process, so JWKS keys are read straight from
 * the auth instance instead of being fetched over the network.
 */
class AuthJwks {
  private keys: CachedKey[] = []
  private fetchedAtMs = 0
  private inflight: Promise<CachedKey[]> | null = null

  async get(): Promise<CachedKey[]> {
    if (this.keys.length > 0 && Date.now() - this.fetchedAtMs < JWKS_TTL_MS) return this.keys
    return this.refresh()
  }

  refresh(): Promise<CachedKey[]> {
    this.inflight ??= this.fetch().finally(() => {
      this.inflight = null
    })
    return this.inflight
  }

  private async fetch(): Promise<CachedKey[]> {
    const { keys } = await auth.api.getJwks()
    if (keys.length === 0) throw new Error('Better Auth JWKS contained no keys')
    const imported = await Promise.all(
      keys.map((key) => importJwk(key as unknown as ImportableJwk)),
    )
    this.keys = imported
    this.fetchedAtMs = Date.now()
    return imported
  }
}

const jwks = new AuthJwks()

export async function initJwks(): Promise<void> {
  try {
    await jwks.refresh()
    console.log('[auth] Better Auth JWKS loaded')
  } catch (error) {
    console.warn('[auth] could not preload Better Auth JWKS; will retry on first request:', error)
  }
}

export async function verifyAuthJwt(token: string): Promise<AuthJwtPayload> {
  const { header } = Jwt.decode(token)
  const alg = toAllowedAlgorithm(header.alg)
  if (!alg) throw new Error(`Unsupported token algorithm: ${header.alg}`)

  let keys = await jwks.get()
  let match = keys.find((key) => key.kid === header.kid)
  if (!match) {
    // Unknown kid — the auth instance may have rotated its key pair.
    keys = await jwks.refresh()
    match = keys.find((key) => key.kid === header.kid)
  }
  if (!match) throw new Error('No JWKS key matches the token kid')
  if (match.alg !== alg) throw new Error('JWKS key algorithm does not match the token')

  const payload = await Jwt.verify(token, match.key, {
    alg,
    iss: authIssuer,
    aud: authAudience,
  })
  return AuthJwtPayloadSchema.parse(payload)
}

export const authMiddleware = async (c: Context, next: Next): Promise<Response | undefined> => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401)
  }
  try {
    const payload = await verifyAuthJwt(authHeader.slice(7))
    c.set('jwtPayload', payload)
    await next()
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401)
  }
}
