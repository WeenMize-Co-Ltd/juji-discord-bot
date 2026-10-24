import { chmod } from 'node:fs/promises'

const required = [
  'IMAGE',
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'BETTER_AUTH_URL',
  'BETTER_AUTH_SECRET',
] as const

const optional = [
  'API_PORT',
  'API_CORS_ORIGINS',
  'LAVALINK_PASSWORD',
  'REDIS_URL',
  'DATABASE_URL',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
] as const

export function serializeDeployEnv(env: Record<string, string | undefined>): string {
  for (const name of required) {
    if (!env[name]) throw new Error(`Missing deployment value: ${name}`)
  }
  if (!/^ghcr\.io\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/.test(env.IMAGE ?? '')) {
    throw new Error('IMAGE must be an immutable GHCR digest reference')
  }

  return [...required, ...optional]
    .flatMap((name) => {
      const value = env[name]
      // Omit empty optional secrets so application and Compose defaults still apply.
      if (value === undefined || value === '') return []
      if (value.includes('\0')) throw new Error(`NUL byte in deployment value: ${name}`)
      // Compose interpolates unquoted/double-quoted values. Escape both its dollar
      // expansion and its dotenv escapes; never turn these values into shell input.
      const quoted = value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\$/g, () => '$$')
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')
      return [`${name}="${quoted}"\n`]
    })
    .join('')
}

if (import.meta.main) {
  const destination = Bun.argv[2]
  if (!destination) throw new Error('Usage: bun write-deploy-env.ts <destination>')
  const contents = serializeDeployEnv(Bun.env)
  await Bun.write(destination, contents, { mode: 0o600 })
  await chmod(destination, 0o600)
}
