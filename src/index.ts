import { startApi } from './api'
import { startBot } from './bot'
import { databaseClient } from './database'
import { initDj } from './dj'

await databaseClient.connect()
await startApi()
initDj()
await startBot()
