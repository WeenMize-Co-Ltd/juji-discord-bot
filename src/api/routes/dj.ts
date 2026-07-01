import { type Context, Hono } from 'hono'
import { djManager } from '../../dj'

function guildId(c: Context): string {
  return c.req.param('guildId') ?? ''
}

async function readJson(c: Context): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await c.req.json()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export const dj = new Hono()
  .get('/', (c) => c.json(djManager.getConfig(guildId(c))))
  .put('/', async (c) => {
    const { voiceChannelId } = await readJson(c)
    if (typeof voiceChannelId !== 'string' || !voiceChannelId.trim()) {
      return c.json({ error: 'A "voiceChannelId" is required.' }, 400)
    }
    const result = await djManager.setChannel(guildId(c), voiceChannelId.trim())
    if (!result.ok) {
      if (result.reason === 'not-found') return c.json({ error: 'Channel not found.' }, 404)
      return c.json({ error: 'That channel is not a voice channel.' }, 422)
    }
    return c.json(djManager.getConfig(guildId(c)))
  })
  .delete('/', async (c) => {
    await djManager.disable(guildId(c))
    return c.json({ ok: true })
  })
  .get('/channels', async (c) => c.json(await djManager.listVoiceChannels(guildId(c))))
