import { z } from 'zod'
import { historyMax, historyTtlSeconds } from '../config'
import { redis } from '../redis/client'
import { type QueueItemDto, QueueItemDtoSchema } from './snapshot'

const STORE_MAX = 100
const StringArraySchema = z.array(z.string()).catch([])

function key(guildId: string): string {
  return `history:${guildId}`
}

export class MusicHistory {
  async record(guildId: string, item: QueueItemDto): Promise<void> {
    const k = key(guildId)
    await redis.send('LPUSH', [k, JSON.stringify(item)])
    await redis.send('LTRIM', [k, '0', String(STORE_MAX - 1)])
    await redis.send('EXPIRE', [k, String(historyTtlSeconds)])
  }

  async list(guildId: string): Promise<QueueItemDto[]> {
    const raw = StringArraySchema.parse(await redis.send('LRANGE', [key(guildId), '0', '-1']))
    const seen = new Set<string>()
    const items: QueueItemDto[] = []
    for (const entry of raw) {
      let parsed: unknown
      try {
        parsed = JSON.parse(entry)
      } catch {
        continue
      }
      const result = QueueItemDtoSchema.safeParse(parsed)
      if (!result.success) continue
      const item = result.data
      if (seen.has(item.url)) continue
      seen.add(item.url)
      items.push(item)
      if (items.length >= historyMax) break
    }
    return items
  }
}

export const musicHistory = new MusicHistory()
