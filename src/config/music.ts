import { join } from 'node:path'

export const cacheDir = Bun.env.MUSIC_CACHE_DIR ?? join(process.cwd(), 'music_cache')

export const cookiesFile = Bun.env.YTDLP_COOKIES_FILE ?? join(process.cwd(), 'cookies.txt')
