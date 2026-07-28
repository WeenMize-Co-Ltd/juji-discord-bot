import { z } from 'zod'

export const SupabaseJwtPayloadSchema = z.object({
  sub: z.string(),
  email: z.string().optional(),
  role: z.string().optional(),
  aud: z.string().optional(),
  // Required: a token without an expiry must never be treated as valid.
  exp: z.number(),
  iat: z.number().optional(),
  user_metadata: z
    .object({
      avatar_url: z.string().optional(),
      full_name: z.string().optional(),
      provider_id: z.string().optional(),
      custom_claims: z
        .object({
          global_name: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
})

export type SupabaseJwtPayload = z.infer<typeof SupabaseJwtPayloadSchema>

/**
 * Context shared by every API route. `authMiddleware` sets `jwtPayload`;
 * `guildAccess` sets `guildId` once it has confirmed the caller may use it.
 */
export interface AppEnv {
  Variables: {
    jwtPayload: SupabaseJwtPayload
    guildId: string
  }
}
