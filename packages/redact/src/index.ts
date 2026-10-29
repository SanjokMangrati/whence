const EMAIL = /[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}/gi
const URL_PATTERN = /\bhttps?:\/\/[^\s"'<>]+/gi

export function scrub(text: string) {
  return text.replace(URL_PATTERN, '[url]').replace(EMAIL, '[email]')
}

export function redact(error: unknown): Error {
  const source = error instanceof Error ? error : new Error(String(error))
  const copy = new Error(scrub(source.message))
  copy.name = source.name
  copy.stack = source.stack === undefined ? undefined : scrub(source.stack)
  return copy
}
