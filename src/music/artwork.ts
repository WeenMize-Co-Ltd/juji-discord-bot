const UNRELIABLE_SIZES = /\/(maxresdefault|sddefault|hq720)\.jpg/

const YOUTUBE_THUMBNAIL_HOSTS = new Set(['i.ytimg.com', 'img.youtube.com'])

const VIDEO_ID = /^[\w-]{11}$/

function youtubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
}

export interface ArtworkSource {
  /** Lavalink's `info.identifier` — the video id for YouTube tracks. */
  id: string
  thumbnail?: string
  sourceName: string
}

const CACHE_MAX = 500
const cache = new Map<string, string>()

function cacheKey({ id, thumbnail, sourceName }: ArtworkSource): string {
  return `${id}\u0000${thumbnail ?? ''}\u0000${sourceName}`
}

export function resolveArtwork(source: ArtworkSource): string {
  const key = cacheKey(source)
  const cached = cache.get(key)
  if (cached !== undefined) return cached

  const resolved = resolveArtworkUncached(source)
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, resolved)
  return resolved
}

function resolveArtworkUncached({ id, thumbnail, sourceName }: ArtworkSource): string {
  const isYouTube = sourceName.toLowerCase().includes('youtube')

  if (thumbnail) {
    try {
      const url = new URL(thumbnail)
      if (YOUTUBE_THUMBNAIL_HOSTS.has(url.hostname) && UNRELIABLE_SIZES.test(url.pathname)) {
        url.pathname = url.pathname.replace(UNRELIABLE_SIZES, '/hqdefault.jpg')
        return url.toString()
      }
      return thumbnail
    } catch {
      // Not a parseable URL — fall through to the derived thumbnail below.
    }
  }

  if (isYouTube && VIDEO_ID.test(id)) return youtubeThumbnail(id)
  return ''
}
