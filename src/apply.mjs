/**
 * Client plugin body for dsh-zh-tw-ui.
 *
 * Runs in the browser. It converts rendered Simplified Chinese into Traditional
 * Chinese (Taiwan) and keeps doing so for content that appears later, so DSH's
 * own UI, third-party plugin UI and newly added upstream copy are all covered.
 *
 * Everything is wrapped so a failure can never break the DSH client: the worst
 * case is that the UI stays exactly as it was.
 */

const inject = []
// Replaced at build time with the version from package.json (see build.mjs).
const VERSION = '__DSH_ZH_TW_UI_VERSION__'
const STORAGE_KEY = 'dsh-zh-tw-ui:enabled'
const HTML_LANG = 'zh-Hant-TW'

function readEnabled() {
  try {
    const stored = globalThis.localStorage && globalThis.localStorage.getItem(STORAGE_KEY)
    return stored !== 'off'
  } catch (error) {
    return true
  }
}

function writeEnabled(enabled) {
  try {
    globalThis.localStorage && globalThis.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off')
  } catch (error) {
    /* private mode / opaque origin: keep the in-memory state only */
  }
}

function apply(_ctx) {
  let dom = null

  function boot() {
    if (dom) return
    const doc = globalThis.document
    if (!doc || !doc.documentElement) return
    const convert = createConverter(OpenCC)
    dom = createDomConverter({
      document: doc,
      window: globalThis,
      convert,
      options: { setHtmlLang: HTML_LANG },
    })
    globalThis.__dshZhTw = {
      version: VERSION,
      on() {
        writeEnabled(true)
        dom.start()
        return this.status()
      },
      off() {
        writeEnabled(false)
        dom.stop()
        return this.status()
      },
      toggle() {
        return this.status().enabled ? this.off() : this.on()
      },
      refresh() {
        dom.refresh()
        return this.status()
      },
      status() {
        return { version: VERSION, enabled: dom.isEnabled(), ...dom.stats() }
      },
      convert,
      overrides: DEFAULT_OVERRIDES,
    }
    if (readEnabled()) dom.start()
  }

  try {
    const doc = globalThis.document
    if (!doc) return
    if (doc.documentElement) boot()
    else doc.addEventListener('DOMContentLoaded', boot, { once: true })
  } catch (error) {
    console.warn('[dsh-zh-tw-ui] setup failed; UI left untouched:', error)
  }

  return () => {
    try {
      if (dom) dom.stop()
    } catch (error) {
      /* disposal must never throw */
    }
  }
}
