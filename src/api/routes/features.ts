import { Hono } from 'hono'
import { z } from 'zod'
import { featureFlags } from '../../features/FeatureFlags'
import type { AppEnv } from '../types'
import { zValidator } from '../validator'

/**
 * Partial patch over the feature registry: at least one known flag must be
 * provided. Unknown keys are stripped by zod, which turns a typo into the
 * "provide at least one" 400 instead of a silent no-op.
 */
const FeaturePatchSchema = z
  .object({
    statsBoard: z.boolean(),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'Provide at least one feature flag.',
  })

export const features = new Hono<AppEnv>()
  .get('/', async (c) => c.json(await featureFlags.getForGuild(c.get('guildId'))))
  .put('/', zValidator('json', FeaturePatchSchema), async (c) => {
    const guildId = c.get('guildId')
    const patch = c.req.valid('json')
    if (patch.statsBoard !== undefined) {
      await featureFlags.setEnabled(guildId, 'stats_board', patch.statsBoard)
    }
    return c.json(await featureFlags.getForGuild(guildId))
  })
