export interface Track {
  id: string
  title: string
  url: string
  thumbnail?: string
  durationSec: number
}

export interface QueuedTrack {
  track: Track
  filePath: string
}
