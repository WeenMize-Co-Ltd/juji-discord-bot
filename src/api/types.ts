import { z } from 'zod'

export const SupabaseJwtPayloadSchema = z.object({
  sub: z.string(),
  email: z.string().optional(),
  role: z.string().optional(),
  aud: z.string().optional(),
  exp: z.number().optional(),
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
