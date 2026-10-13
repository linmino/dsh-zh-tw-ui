/**
 * Text conversion: Simplified Chinese -> Traditional Chinese (Taiwan).
 *
 * The heavy lifting is done by OpenCC dictionaries (vendored opencc-js). This
 * module only adds a memo cache, a cheap "does this string contain Han
 * characters at all" gate, and a short curated override list for wording that
 * OpenCC's cn->twp chain either misses or renders in a non-Taiwan way.
 */

/** Matches any Han character (BMP ideographs + compatibility ideographs). */
const HAN_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/

/**
 * Applied after OpenCC, in order, as literal replacements.
 * Edit this list to taste; each entry is [from, to].
 */
const DEFAULT_OVERRIDES = [
  // OpenCC's Traditional Chinese (Taiwan) phrase table keeps the first of
  // these; Taiwan software UI normally uses the second.
  ['許可權', '權限'],
  ['只讀', '唯讀'],
  ['超時', '逾時'],
  ['反饋', '回饋'],
  ['獲取', '取得'],
]

/**
 * Build a converter function.
 * @param {{ Converter: (options: { from: string, to: string }) => (text: string) => string }} opencc vendored opencc-js namespace.
 * @param {{ overrides?: string[][], cacheSize?: number, from?: string, to?: string }} [options]
 * @returns {(text: string) => string} idempotent-ish text converter (non-string input passes through).
 */
function createConverter(opencc, options = {}) {
  const base = opencc.Converter({ from: options.from ?? 'cn', to: options.to ?? 'twp' })
  const overrides = options.overrides ?? DEFAULT_OVERRIDES
  const cacheSize = options.cacheSize ?? 20000
  const cache = new Map()

  return function convert(text) {
    if (typeof text !== 'string' || text === '') return text
    if (!HAN_RE.test(text)) return text
    const cached = cache.get(text)
    if (cached !== undefined) return cached
    let out = base(text)
    for (const [from, to] of overrides) {
      if (from !== to && out.indexOf(from) !== -1) out = out.split(from).join(to)
    }
    if (cache.size >= cacheSize) cache.clear()
    cache.set(text, out)
    return out
  }
}

export { createConverter, DEFAULT_OVERRIDES, HAN_RE }
