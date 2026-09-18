import 'i18next'
import type uk from './uk.json'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: {
      translation: typeof uk
    }
  }
}
