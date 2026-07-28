import type { ValidationTargets } from 'hono'
import { validator } from 'hono/validator'
import type { z } from 'zod'

/**
 * Reports the first zod issue in the shape the API already uses (`{ error: string }`),
 * so a validation failure reads the same as the hand-written checks it replaces.
 */
function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Invalid request body.'
  const path = issue.path.join('.')
  return path ? `"${path}": ${issue.message}` : issue.message
}

/**
 * `validator` bound to a zod schema, for any target (`json`, `query`, `param`, …).
 *
 * `Target` looks single-use to eslint, but it is what carries the target through to the
 * returned middleware's type — without it `c.req.valid('json')` stops narrowing.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function zValidator<Target extends keyof ValidationTargets, Schema extends z.ZodType>(
  target: Target,
  schema: Schema,
) {
  return validator(target, (value, c) => {
    const result = schema.safeParse(value)
    if (!result.success) return c.json({ error: firstIssue(result.error) }, 400)
    return result.data
  })
}
