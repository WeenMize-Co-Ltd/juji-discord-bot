export interface Track {
  id: string
  title: string
  author: string
  url: string
  thumbnail?: string
  durationSec: number
  sourceName: string
  isLive: boolean
  requestedBy?: string
  entryId?: string
}
