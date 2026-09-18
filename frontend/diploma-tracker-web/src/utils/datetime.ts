/**
 * Converts an ISO UTC timestamp to the local wall-clock text a `datetime-local` input expects
 * (`YYYY-MM-DDTHH:mm`). `Date#toISOString` alone would produce UTC wall-clock text, which the
 * input would then misinterpret as local time, shifting the value by the timezone offset.
 */
export function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso)
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return localTime.toISOString().slice(0, 16)
}

/**
 * Converts the local wall-clock text of a `datetime-local` input back to an ISO UTC timestamp
 * for the API. `new Date(value)` already interprets the value as local time, so this only needs
 * `toISOString`.
 */
export function fromDatetimeLocalValue(value: string): string {
  return new Date(value).toISOString()
}
