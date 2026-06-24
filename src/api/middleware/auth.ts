import { jwt, verify } from 'hono/jwt'
import { supabaseJwtSecret } from '../../config'
import type { SupabaseJwtPayload } from '../types'

export const authMiddleware = jwt({ secret: supabaseJwtSecret, alg: 'HS256' })

export async function verifySupabaseJwt(token: string): Promise<SupabaseJwtPayload> {
  return (await verify(token, supabaseJwtSecret, 'HS256')) as unknown as SupabaseJwtPayload
}
