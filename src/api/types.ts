import { z } from 'zod'

/**
 * Claims emitted by the Better Auth `jwt` plugin (see `src/auth/index.ts`).
 * Flat by design: `discord_id` is the identity used for guild access.
 */
export const AuthJwtPayloadSchema = z.object({
  sub: z.string(),
  email: z.string().optional(),
  aud: z.union([z.string(), z.array(z.string())]).optional(),
  // Required: a token without an expiry must never be treated as valid.
  exp: z.number(),
  iat: z.number().optional(),
  discord_id: z.string().optional(),
  name: z.string().optional(),
  image: z.string().optional(),
})

export type AuthJwtPayload = z.infer<typeof AuthJwtPayloadSchema>

/**
 * Context shared by every API route. `authMiddleware` sets `jwtPayload`;
 * `guildAccess` sets `guildId` once it has confirmed the caller may use it.
 */
export interface AppEnv {
  Variables: {
    jwtPayload: AuthJwtPayload
    guildId: string
  }
}
