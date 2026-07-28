/**
 * Artwork URLs coming out of Lavalink are unreliable in two specific ways:
 *
 * 1. The youtube-source plugin often reports `maxresdefault.jpg`, which 404s for any
 *    video that was never uploaded with a max-resolution thumbnail.
 * 2. `artworkUrl` can be absent entirely, which previously became an empty string and
 *    rendered as a broken image in the web player.
 *
 * `hqdefault.jpg` exists for every YouTube video, so it is both the rewrite target and
 * the fallback we derive from the video id.
 */

/** YouTube thumbnail sizes that are not guaranteed to exist. */
const UNRELIABLE_SIZES = /\/(maxresdefault|sddefault|hq720)\.jpg/

const YOUTUBE_THUMBNAIL_HOSTS = new Set(['i.ytimg.com', 'img.youtube.com'])

/** A YouTube video id is exactly 11 URL-safe base64 characters. */
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

/**
 * Best available artwork URL for a track, or `''` when nothing can be derived.
 *
 * Returning `''` rather than `null` keeps the wire format unchanged for the web
 * player, whose `QueueItem.thumbnail` is a non-optional string.
 */
export function resolveArtwork({ id, thumbnail, sourceName }: ArtworkSource): string {
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
