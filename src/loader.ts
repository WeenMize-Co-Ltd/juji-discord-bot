import { Command } from './types/command'

/**
 * Scans `src/commands/` and instantiates every default-exported `Command`.
 *
 * Lives outside `src/commands/` on purpose: that directory is glob-scanned, so anything
 * in it must itself be a command.
 */
export async function loadCommands(): Promise<Command[]> {
  const commands: Command[] = []
  const glob = new Bun.Glob('*.ts')

  for await (const file of glob.scan(`${import.meta.dir}/commands`)) {
    const CommandClass = ((await import(`./commands/${file}`)) as { default: new () => Command })
      .default
    const command = new CommandClass()
    if (command instanceof Command) {
      commands.push(command)
    } else {
      console.warn(`[WARNING] The command at ./commands/${file} does not extend Command.`)
    }
  }

  return commands
}
