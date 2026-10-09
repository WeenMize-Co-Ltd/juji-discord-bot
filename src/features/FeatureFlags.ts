import { databaseClient, db } from '../database/client'
import { guildFeatureFlags, type FeatureKey } from '../database/schema'

/**
 * The feature registry. Adding a flag means one entry here (and, when the flag
 * gates server-side behaviour, a check against `featureFlags` in the route).
 * `key` is the persisted identifier; `apiKey` is the camelCase field the web
 * panel reads and writes.
 */
const FEATURES = [{ key: 'stats_board', apiKey: 'statsBoard', defaultEnabled: true }] as const

/** The wire shape returned by the features API — one boolean per registry entry. */
export type GuildFeatures = Record<(typeof FEATURES)[number]['apiKey'], boolean>

/** Persisted defaults, used whenever a guild has no row for a flag. */
const DEFAULTS = new Map<FeatureKey, boolean>(
  FEATURES.map((feature) => [feature.key, feature.defaultEnabled] as const),
)

function defaultFor(key: FeatureKey): boolean {
  return DEFAULTS.get(key) ?? true
}

/**
 * Per-guild feature flags, cached in memory after the first DB read. Mirrors
 * `DjManager`'s model: when the DB is disabled, reads fall back to defaults and
 * writes only touch the cache, so the bot keeps working without Postgres.
 */
class FeatureFlags {
  /** Only persisted rows are cached — absent flags fall back to their default. */
  private readonly overrides = new Map<string, Map<FeatureKey, boolean>>()
  private loaded = false
  private loading: Promise<void> | null = null

  /**
   * Loads the persisted flags once. A failed load is logged and retried on the
   * next call (the DB probe may still be reconnecting), and concurrent callers
   * share one query.
   */
  async ensureLoaded(): Promise<void> {
    if (this.loaded || !databaseClient.enabled) return
    if (this.loading) return this.loading
    this.loading = this.load()
      .then(() => {
        this.loaded = true
      })
      .catch((error: unknown) => {
        console.error('[features] failed to load flags:', error)
      })
      .finally(() => {
        this.loading = null
      })
    return this.loading
  }

  private async load(): Promise<void> {
    const rows = await db.select().from(guildFeatureFlags)
    this.overrides.clear()
    for (const row of rows) {
      const byFeature = this.overrides.get(row.guildId) ?? new Map<FeatureKey, boolean>()
      byFeature.set(row.feature, row.enabled)
      this.overrides.set(row.guildId, byFeature)
    }
  }

  async isEnabled(guildId: string, key: FeatureKey): Promise<boolean> {
    await this.ensureLoaded()
    return this.overrides.get(guildId)?.get(key) ?? defaultFor(key)
  }

  async getForGuild(guildId: string): Promise<GuildFeatures> {
    await this.ensureLoaded()
    const flags = {} as GuildFeatures
    for (const feature of FEATURES) {
      flags[feature.apiKey] =
        this.overrides.get(guildId)?.get(feature.key) ?? feature.defaultEnabled
    }
    return flags
  }

  async setEnabled(guildId: string, key: FeatureKey, enabled: boolean): Promise<void> {
    await this.ensureLoaded()
    const byFeature = this.overrides.get(guildId) ?? new Map<FeatureKey, boolean>()
    byFeature.set(key, enabled)
    this.overrides.set(guildId, byFeature)
    if (!databaseClient.enabled) return
    await db
      .insert(guildFeatureFlags)
      .values({ guildId, feature: key, enabled })
      .onConflictDoUpdate({
        target: [guildFeatureFlags.guildId, guildFeatureFlags.feature],
        set: { enabled, updatedAt: new Date() },
      })
  }
}

export const featureFlags = new FeatureFlags()
