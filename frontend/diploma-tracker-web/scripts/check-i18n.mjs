import { readFileSync } from 'node:fs'

const load = (name) => JSON.parse(readFileSync(new URL(`../src/i18n/${name}.json`, import.meta.url), 'utf8'))

function keys(value, prefix = '') {
  return Object.entries(value).flatMap(([key, child]) =>
    child && typeof child === 'object' ? keys(child, `${prefix}${key}.`) : [`${prefix}${key}`])
}

// i18next plural keys (e.g. `key_one` / `key_few` / `key_other`) are variants of the same logical
// key. Each language only needs the plural categories its own CLDR plural rules require, so we
// validate each language's plural families against its own required category set instead of
// collapsing all suffixes away (which would silently accept missing categories, e.g. a uk key
// that never got its `_few`/`_many` forms).
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/

const REQUIRED_CATEGORIES = {
  // English CLDR plural rules: one (1), other (everything else).
  en: ['one', 'other'],
  // Ukrainian CLDR plural rules: one (1, 21, 31, ... but not 11), few (2-4, 22-24, ...),
  // many (0, 5-20, 25-30, ...). `other` only applies to non-integer values, which this app
  // does not use, so it is not required.
  uk: ['one', 'few', 'many'],
}

function analyze(value, lang) {
  const allKeys = keys(value)
  const plainKeys = new Set()
  const pluralFamilies = new Map() // base key -> Set of suffixes present

  for (const key of allKeys) {
    const match = key.match(PLURAL_SUFFIX)
    if (match) {
      const base = key.slice(0, -match[0].length)
      const suffix = match[1]
      if (!pluralFamilies.has(base)) pluralFamilies.set(base, new Set())
      pluralFamilies.get(base).add(suffix)
    } else {
      plainKeys.add(key)
    }
  }

  return { plainKeys, pluralFamilies, lang }
}

const uk = analyze(load('uk'), 'uk')
const en = analyze(load('en'), 'en')

const errors = []

const missingInEn = [...uk.plainKeys].filter((key) => !en.plainKeys.has(key) && !en.pluralFamilies.has(key))
const missingInUk = [...en.plainKeys].filter((key) => !uk.plainKeys.has(key) && !uk.pluralFamilies.has(key))

if (missingInEn.length) errors.push(`Missing in en.json: ${JSON.stringify(missingInEn)}`)
if (missingInUk.length) errors.push(`Missing in uk.json: ${JSON.stringify(missingInUk)}`)

const allPluralBases = new Set([...uk.pluralFamilies.keys(), ...en.pluralFamilies.keys()])

for (const base of allPluralBases) {
  for (const analysis of [en, uk]) {
    const required = REQUIRED_CATEGORIES[analysis.lang]
    const present = analysis.pluralFamilies.get(base) ?? new Set()

    if (present.size === 0) {
      errors.push(`Missing plural family "${base}" in ${analysis.lang}.json (expected: ${required.map((c) => `${base}_${c}`).join(', ')})`)
      continue
    }

    const missing = required.filter((category) => !present.has(category))
    const unexpected = [...present].filter((category) => !required.includes(category))

    if (missing.length) {
      errors.push(`${analysis.lang}.json plural family "${base}" is missing: ${missing.map((c) => `${base}_${c}`).join(', ')}`)
    }
    if (unexpected.length) {
      errors.push(`${analysis.lang}.json plural family "${base}" has unexpected categories: ${unexpected.map((c) => `${base}_${c}`).join(', ')}`)
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}

const totalKeys = uk.plainKeys.size + allPluralBases.size
console.log(`i18n keys match (${totalKeys} logical keys, ${allPluralBases.size} pluralized)`)
