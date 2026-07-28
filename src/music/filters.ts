import { type EQBand, FilterManager, type Player } from 'lavalink-client'

export const bassboostPresetValues = ['Low', 'Medium', 'High', 'Earrape'] as const
export type BassboostPreset = (typeof bassboostPresetValues)[number]

export interface FilterState {
  bassboost: BassboostPreset | null
  nightcore: boolean
  vaporwave: boolean
  rotation: boolean
  karaoke: boolean
  vibrato: boolean
  tremolo: boolean
}

export type FilterPatch = Partial<FilterState>

const TOGGLE_FILTERS = [
  'nightcore',
  'vaporwave',
  'rotation',
  'karaoke',
  'vibrato',
  'tremolo',
] as const satisfies readonly (keyof FilterState)[]

type ToggleFilter = (typeof TOGGLE_FILTERS)[number]

const TOGGLE_METHODS: Record<ToggleFilter, (fm: FilterManager) => Promise<unknown>> = {
  nightcore: (fm) => fm.toggleNightcore(),
  vaporwave: (fm) => fm.toggleVaporwave(),
  rotation: (fm) => fm.toggleRotation(),
  karaoke: (fm) => fm.toggleKaraoke(),
  vibrato: (fm) => fm.toggleVibrato(),
  tremolo: (fm) => fm.toggleTremolo(),
}

function sameBands(a: EQBand[], b: EQBand[]): boolean {
  if (a.length !== b.length) return false
  return a.every((band, i) => {
    const other = b[i]
    return band.band === other?.band && band.gain === other.gain
  })
}

/** Bassboost has no boolean flag in lavalink-client — derive it from the active EQ bands. */
function detectBassboost(bands: EQBand[]): BassboostPreset | null {
  if (bands.length === 0) return null
  for (const preset of bassboostPresetValues) {
    if (sameBands(bands, FilterManager.EQList[`Bassboost${preset}`])) return preset
  }
  return null
}

export function toFilterState(player: Player): FilterState {
  const fm = player.filterManager
  return {
    bassboost: detectBassboost(fm.equalizerBands),
    nightcore: fm.filters.nightcore,
    vaporwave: fm.filters.vaporwave,
    rotation: fm.filters.rotation,
    karaoke: fm.filters.karaoke,
    vibrato: fm.filters.vibrato,
    tremolo: fm.filters.tremolo,
  }
}

export async function applyFilterPatch(player: Player, patch: FilterPatch): Promise<void> {
  const fm = player.filterManager

  const bassboost = patch.bassboost ?? null
  const enabledToggle = bassboost ? undefined : TOGGLE_FILTERS.find((key) => patch[key] === true)

  await fm.resetFilters()
  await fm.clearEQ()

  if (bassboost) {
    await fm.setEQPreset(`Bassboost${bassboost}`)
  } else if (enabledToggle) {
    await TOGGLE_METHODS[enabledToggle](fm)
  }
}

export async function clearAllFilters(player: Player): Promise<void> {
  await player.filterManager.resetFilters()
  await player.filterManager.clearEQ()
}
