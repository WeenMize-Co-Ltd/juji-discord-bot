import { startApi } from './api'
import { startBot } from './bot'
import { musicCacheCleaner } from './music/MusicCacheCleaner'
import { ollamaClient } from './llm/OllamaClient'

musicCacheCleaner.start()
ollamaClient.warmup()
startApi()
await startBot()
