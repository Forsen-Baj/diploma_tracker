export type ByteUnitKey = 'b' | 'kb' | 'mb'

export type FormattedBytes = {
  value: string
  unitKey: ByteUnitKey
}

export function formatBytes(bytes: number, locale: string): FormattedBytes {
  if (bytes < 1024) {
    return { value: new Intl.NumberFormat(locale).format(bytes), unitKey: 'b' }
  }

  const oneDecimal = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })

  const kb = bytes / 1024
  if (kb < 1024) {
    return { value: oneDecimal.format(kb), unitKey: 'kb' }
  }

  return { value: oneDecimal.format(kb / 1024), unitKey: 'mb' }
}
