export function optional(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}
