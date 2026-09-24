import { SQL } from 'bun'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sql'
import { databaseUrl } from '../config'
import * as schema from './schema'

const POOL_OPTIONS = {
  max: 20,
  connectionTimeout: 5,
  idleTimeout: 30,
  maxLifetime: 1800,
} as const

const RETRY_BASE_MS = 5_000
const RETRY_MAX_MS = 60_000

class DatabaseClient {
  private readonly client = new SQL(databaseUrl, POOL_OPTIONS)
  readonly db = drizzle({ client: this.client, schema })
  enabled = false
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private retryDelayMs = RETRY_BASE_MS

  async connect(): Promise<void> {
    if (this.enabled) return
    try {
      await this.db.execute(sql`select 1`)
      this.enabled = true
      this.retryDelayMs = RETRY_BASE_MS
      console.log('[database] connected')
    } catch (error) {
      this.enabled = false
      console.warn('[database] connection failed — analytics disabled:', error)
      this.scheduleRetry()
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      void this.connect()
    }, this.retryDelayMs)
    this.retryDelayMs = Math.min(this.retryDelayMs * 2, RETRY_MAX_MS)
  }

  async close(): Promise<void> {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    await this.client.close({ timeout: 5 })
  }
}

export const databaseClient = new DatabaseClient()
export const db = databaseClient.db
