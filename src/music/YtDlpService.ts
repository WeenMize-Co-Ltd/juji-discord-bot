import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import ffmpegStatic from 'ffmpeg-static'
import { cacheDir, cookiesFile } from '../config'
import type { Track } from '../types/track'

interface RunResult {
  stdout: string
  stderr: string
}

interface YtDlpDump {
  id: string
  title: string
  webpage_url: string
  thumbnail?: string
  duration?: number
}

function isYtDlpDump(value: unknown): value is YtDlpDump {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'title' in value &&
    typeof value.title === 'string' &&
    'webpage_url' in value &&
    typeof value.webpage_url === 'string'
  )
}

export class YtDlpService {
  constructor(
    private readonly cacheDir: string,
    private readonly cookiesFile: string,
    private readonly ffmpegPath: string | null,
  ) {}

  async resolveTrack(input: string): Promise<Track> {
    const { stdout } = await this.run([
      '--no-playlist',
      '--dump-json',
      '--default-search',
      'ytsearch1',
      '--js-runtime',
      'node',
      ...this.cookieArgs(),
      input,
    ])

    const firstLine = stdout.split('\n').find((line) => line.trim().length > 0)
    if (firstLine === undefined) {
      throw new Error(`yt-dlp returned no result for: ${input}`)
    }

    const parsed: unknown = JSON.parse(firstLine)
    if (!isYtDlpDump(parsed)) {
      throw new Error('yt-dlp returned metadata in an unexpected shape.')
    }

    return {
      id: parsed.id,
      title: parsed.title,
      url: parsed.webpage_url,
      thumbnail: parsed.thumbnail,
      durationSec: typeof parsed.duration === 'number' ? Math.round(parsed.duration) : 0,
    }
  }

  async downloadTrack(track: Track): Promise<string> {
    const outputPath = join(this.cacheDir, `${track.id}.opus`)
    if (await Bun.file(outputPath).exists()) {
      return outputPath
    }

    await mkdir(this.cacheDir, { recursive: true })

    await this.run([
      '-f',
      'bestaudio/best',
      '-x',
      '--audio-format',
      'opus',
      '--no-playlist',
      '--js-runtime',
      'node',
      ...this.ffmpegArgs(),
      ...this.cookieArgs(),
      '-o',
      join(this.cacheDir, '%(id)s.%(ext)s'),
      track.url,
    ])

    if (!(await Bun.file(outputPath).exists())) {
      throw new Error(`Download finished but the expected file was not found: ${outputPath}`)
    }
    return outputPath
  }

  private cookieArgs(): string[] {
    if (existsSync(this.cookiesFile)) {
      return ['--cookies', this.cookiesFile]
    }
    return ['--cookies-from-browser', 'chrome']
  }

  private ffmpegArgs(): string[] {
    if (this.ffmpegPath && existsSync(this.ffmpegPath)) {
      return ['--ffmpeg-location', this.ffmpegPath]
    }
    return []
  }

  private run(args: string[]): Promise<RunResult> {
    return new Promise<RunResult>((resolve, reject) => {
      const child = spawn('yt-dlp', args)
      let stdout = ''
      let stderr = ''
      let settled = false

      const fail = (error: Error): void => {
        if (settled) return
        settled = true
        reject(error)
      }

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
      })
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })

      child.on('error', (error: Error & { code?: string }) => {
        if (error.code === 'ENOENT') {
          fail(new Error('yt-dlp is not installed or not on PATH (e.g. `brew install yt-dlp`).'))
        } else {
          fail(error)
        }
      })

      child.on('close', (code) => {
        if (settled) return
        settled = true
        if (code === 0) {
          resolve({ stdout, stderr })
        } else {
          reject(
            new Error(`yt-dlp exited with code ${code ?? 'null'}: ${stderr.trim().slice(-300)}`),
          )
        }
      })
    })
  }
}

export const ytDlpService = new YtDlpService(cacheDir, cookiesFile, ffmpegStatic)
