import { Hono } from 'hono'
import { z } from 'zod'
import { djManager } from '../../dj'
import type { AppEnv } from '../types'
import { zValidator } from '../validator'

const SetChannelSchema = z.object({
  voiceChannelId: z.string().trim().min(1, 'A "voiceChannelId" is required.'),
})

export const dj = new Hono<AppEnv>()
  .get('/', (c) => c.json(djManager.getConfig(c.get('guildId'))))
  .put('/', zValidator('json', SetChannelSchema), async (c) => {
    const guildId = c.get('guildId')
    const result = await djManager.setChannel(guildId, c.req.valid('json').voiceChannelId)
    if (!result.ok) {
      if (result.reason === 'not-found') return c.json({ error: 'Channel not found.' }, 404)
      return c.json({ error: 'That channel is not a voice channel.' }, 422)
    }
    return c.json(djManager.getConfig(guildId))
  })
  .delete('/', async (c) => {
    await djManager.disable(c.get('guildId'))
    return c.json({ ok: true })
  })
  .get('/channels', async (c) => c.json(await djManager.listVoiceChannels(c.get('guildId'))))
