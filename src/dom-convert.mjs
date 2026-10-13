/**
 * DOM converter: walk the rendered UI and rewrite Simplified Chinese text to
 * Traditional Chinese (Taiwan), including text that appears later.
 *
 * Why the DOM and not the locale dictionaries: DSH's locale service only knows
 * the namespaces a dictionary package shipped, so dictionary-based language
 * packs always lag upstream and never cover third-party plugin copy. Converting
 * the rendered text covers everything on screen, whatever produced it.
 *
 * Skip model (three states per element):
 *   hard  — code, editors, terminals, scripts, SVG: neither attributes nor the
 *           subtree are touched;
 *   value — form controls (input/textarea/select/option): attributes such as
 *           placeholder/title are converted, the subtree is not, so what the
 *           user types or picks is never rewritten;
 *   none  — everything else.
 *
 * Safety rules: only write when the text actually changed, and remember our own
 * writes so React re-renders and the observer cannot ping-pong each other.
 */

/** Subtree and attributes are both off limits. */
const HARD_SKIP_TAGS = [
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'CODE', 'PRE', 'KBD', 'SAMP',
  'VAR', 'CANVAS', 'IFRAME', 'OBJECT', 'EMBED', 'AUDIO', 'VIDEO',
]

/** Attributes are converted, the subtree (user value / options) is not. */
const VALUE_CONTROL_TAGS = ['INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'OPTGROUP']

/** Class names that mark code/terminal/editor surfaces from other plugins. */
const SKIP_CLASSES = [
  'cm-editor', 'cm-content', 'cm-line', 'monaco-editor', 'xterm',
  'ace_editor', 'hljs', 'prism', 'code-block', 'terminal-output',
]

/** Attributes whose visible text is converted too. */
const TEXT_ATTRIBUTES = ['title', 'placeholder', 'aria-label', 'alt']

const SVG_NS = 'http://www.w3.org/2000/svg'
const MATHML_NS = 'http://www.w3.org/1998/Math/MathML'
const ELEMENT_NODE = 1
const TEXT_NODE = 3
const DOCUMENT_NODE = 9
const FRAGMENT_NODE = 11

const HARD = 'hard'
const VALUE = 'value'
const NONE = 'none'

/**
 * @param {{
 *   document: Document,
 *   window?: object,
 *   convert: (text: string) => string,
 *   options?: {
 *     attributes?: string[],
 *     skipClasses?: string[],
 *     setHtmlLang?: boolean | string,
 *   },
 * }} config
 */
function createDomConverter(config) {
  const doc = config.document
  const view = config.window ?? doc.defaultView ?? globalThis
  const NF = view.NodeFilter
  const convert = config.convert
  const options = config.options ?? {}
  const attributes = options.attributes ?? TEXT_ATTRIBUTES
  const skipClasses = options.skipClasses ?? SKIP_CLASSES
  const hardSkipTags = new Set(HARD_SKIP_TAGS)
  const valueControlTags = new Set(VALUE_CONTROL_TAGS)
  const htmlLang = options.setHtmlLang === false ? null : options.setHtmlLang || 'zh-Hant-TW'

  const stats = { textNodes: 0, attributes: 0, skippedSubtrees: 0, passes: 0 }
  /**
   * Value this converter itself wrote, per node/attribute. Writing text fires
   * another characterData record; without this guard a non-idempotent mapping
   * could rewrite forever. It also keeps us from re-converting our own output.
   */
  const written = new WeakMap()
  let observer = null
  let queue = []
  let scheduled = false
  let running = false

  /** Classify one element: HARD, VALUE or NONE. */
  function skipKind(el) {
    const tag = el.tagName
    if (typeof tag === 'string') {
      const upper = tag.toUpperCase()
      if (hardSkipTags.has(upper)) return HARD
      if (valueControlTags.has(upper)) return VALUE
    }
    const ns = el.namespaceURI
    if (ns === SVG_NS || ns === MATHML_NS) return HARD
    if (typeof el.hasAttribute === 'function') {
      if (el.hasAttribute('data-zh-tw-skip')) return HARD
      if (el.getAttribute('translate') === 'no') return HARD
      const editable = el.getAttribute('contenteditable')
      if (editable !== null && editable !== 'false') return HARD
    }
    const list = el.classList
    if (list && list.length > 0) {
      for (const name of skipClasses) if (list.contains(name)) return HARD
    }
    return NONE
  }

  /** True when this element's subtree must not be converted. */
  function subtreeForbidden(el) {
    return skipKind(el) !== NONE
  }

  /** True when the element itself must not have its attributes converted. */
  function attributesForbidden(el) {
    return skipKind(el) === HARD
  }

  /** True when the node or one of its ancestors forbids conversion. */
  function inForbiddenSubtree(node) {
    let el = node.nodeType === ELEMENT_NODE ? node : node.parentElement
    while (el) {
      if (subtreeForbidden(el)) return true
      el = el.parentElement
    }
    return false
  }

  /** True when one of the element's ancestors forbids conversion. */
  function ancestorForbidden(el) {
    let parent = el.parentElement
    while (parent) {
      if (subtreeForbidden(parent)) return true
      parent = parent.parentElement
    }
    return false
  }

  function convertTextNode(node) {
    const raw = node.nodeValue
    if (typeof raw !== 'string' || raw === '') return
    if (written.get(node) === raw) return
    const next = convert(raw)
    if (next !== raw) {
      written.set(node, next)
      node.nodeValue = next
      stats.textNodes += 1
    }
  }

  function convertAttributes(el) {
    if (attributes.length === 0 || typeof el.getAttribute !== 'function') return
    for (const name of attributes) {
      const raw = el.getAttribute(name)
      if (typeof raw !== 'string' || raw === '') continue
      let seen = written.get(el)
      if (seen === undefined || typeof seen === 'string') {
        seen = new Map()
        written.set(el, seen)
      }
      const key = `attr:${name}`
      if (seen.get(key) === raw) continue
      const next = convert(raw)
      if (next !== raw) {
        seen.set(key, next)
        el.setAttribute(name, next)
        stats.attributes += 1
      }
    }
  }

  /** Convert one subtree (element, fragment, document or bare text node). */
  function walk(root) {
    if (!root) return
    if (root.nodeType === TEXT_NODE) {
      if (!inForbiddenSubtree(root)) convertTextNode(root)
      return
    }
    if (root.nodeType === ELEMENT_NODE) {
      const kind = skipKind(root)
      if (kind === HARD) {
        stats.skippedSubtrees += 1
        return
      }
      if (ancestorForbidden(root)) {
        stats.skippedSubtrees += 1
        return
      }
      convertAttributes(root)
      if (kind === VALUE) return
    } else if (root.nodeType === DOCUMENT_NODE) {
      root = root.documentElement
      if (!root) return
    } else if (root.nodeType !== FRAGMENT_NODE) {
      return
    }
    stats.passes += 1
    const walker = doc.createTreeWalker(root, NF.SHOW_ELEMENT | NF.SHOW_TEXT, {
      acceptNode(node) {
        if (node.nodeType === ELEMENT_NODE) {
          const kind = skipKind(node)
          if (kind === HARD) return NF.FILTER_REJECT
          convertAttributes(node)
          return kind === VALUE ? NF.FILTER_REJECT : NF.FILTER_SKIP
        }
        return NF.FILTER_ACCEPT
      },
    })
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      convertTextNode(node)
    }
  }

  function flush() {
    scheduled = false
    if (!running) return
    const pending = queue
    queue = []
    for (const node of pending) {
      if (!node.isConnected && node.nodeType !== DOCUMENT_NODE) continue
      if (node.nodeType === TEXT_NODE) {
        if (!inForbiddenSubtree(node)) convertTextNode(node)
      } else {
        walk(node)
      }
    }
  }

  function schedule() {
    if (scheduled) return
    scheduled = true
    const run = () => {
      if (scheduled) flush()
    }
    if (typeof view.queueMicrotask === 'function') view.queueMicrotask(run)
    else Promise.resolve().then(run)
  }

  function onMutations(records) {
    for (const record of records) {
      if (record.type === 'characterData') {
        queue.push(record.target)
        continue
      }
      if (record.type === 'attributes') {
        const target = record.target
        if (
          target &&
          target.nodeType === ELEMENT_NODE &&
          !attributesForbidden(target) &&
          !ancestorForbidden(target)
        ) {
          convertAttributes(target)
        }
        continue
      }
      const added = record.addedNodes
      for (let i = 0; i < added.length; i += 1) queue.push(added[i])
    }
    if (queue.length > 0) schedule()
  }

  function setDocumentLanguage() {
    if (htmlLang === null) return
    try {
      if (doc.documentElement && doc.documentElement.getAttribute('lang') !== htmlLang) {
        doc.documentElement.setAttribute('lang', htmlLang)
      }
    } catch (error) {
      /* cosmetic only */
    }
  }

  return {
    /** Full pass + start observing. Idempotent. */
    start() {
      if (running) return true
      running = true
      if (!doc.documentElement) return false
      walk(doc.documentElement)
      setDocumentLanguage()
      try {
        observer = new view.MutationObserver(onMutations)
        observer.observe(doc.documentElement, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: attributes,
        })
      } catch (error) {
        observer = null
        console.warn('[dsh-zh-tw-ui] MutationObserver unavailable:', error)
      }
      return true
    },
    /** Stop observing. Already-converted text stays converted. */
    stop() {
      running = false
      queue = []
      if (observer) {
        observer.disconnect()
        observer = null
      }
      return true
    },
    /** Re-run a full pass (e.g. after the app switched locale). */
    refresh() {
      if (running && doc.documentElement) {
        walk(doc.documentElement)
        setDocumentLanguage()
      }
    },
    isEnabled() {
      return running
    },
    stats() {
      return { ...stats }
    },
    /** Exposed for tests. */
    _walk: walk,
  }
}

export {
  createDomConverter,
  HARD_SKIP_TAGS,
  VALUE_CONTROL_TAGS,
  SKIP_CLASSES,
  TEXT_ATTRIBUTES,
}
