export interface Track {
  id: string
  title: string
  url: string
  thumbnail?: string
  durationSec: number
  isLive: boolean
  requestedBy?: string
}
