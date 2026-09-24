const ids = new WeakMap<object, string>()

export function entryIdFor(track: object): string {
  let id = ids.get(track)
  if (id === undefined) {
    id = crypto.randomUUID()
    ids.set(track, id)
  }
  return id
}
