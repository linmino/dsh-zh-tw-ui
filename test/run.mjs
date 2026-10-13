/**
 * Test suite for the local dsh-zh-tw-ui plugin.
 *
 *   node run.mjs
 *
 * Covers three layers:
 *   1. text conversion quality (OpenCC cn->twp + curated overrides),
 *   2. the DOM converter against a real DOM (jsdom): skip rules, attributes,
 *      live mutations, the no-loop guard, and the on/off switch,
 *   3. the generated lib/client.js end to end — loaded through DSH's real
 *      module wrapper (window.__ModuleLoader__.load) and applied to a DOM.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'

const here = dirname(fileURLToPath(import.meta.url))
const pluginDir = join(here, '..')
const pkg = JSON.parse(readFileSync(join(pluginDir, 'package.json'), 'utf8'))

const cases = []
const test = (name, fn) => cases.push({ name, fn })
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

/** Load the vendored opencc UMD build in a CommonJS sandbox. */
function loadOpenCC() {
  const code = readFileSync(join(pluginDir, 'src', 'vendor', 'opencc.full.umd.js'), 'utf8')
  const sandbox = { module: { exports: {} }, exports: {} }
  sandbox.exports = sandbox.module.exports
  vm.createContext(sandbox)
  vm.runInContext(code, sandbox)
  return sandbox.module.exports
}

const load = (relative) => import(pathToFileURL(join(pluginDir, relative)).href)

const { createConverter } = await load('src/convert.mjs')
const { createDomConverter } = await load('src/dom-convert.mjs')
const OpenCC = loadOpenCC()
const convert = createConverter(OpenCC)

function makeDom(body = '', options = {}) {
  return new JSDOM(`<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`, {
    url: 'http://localhost/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    ...options,
  })
}

function mount(dom, options = {}) {
  const converter = createDomConverter({
    document: dom.window.document,
    window: dom.window,
    convert,
    options: { setHtmlLang: 'zh-Hant-TW', ...options },
  })
  return converter
}

// ---------------------------------------------------------------- conversion

test('converts core UI vocabulary with Taiwan wording', () => {
  const expectations = {
    设置: '設定',
    网络: '網路',
    软件: '軟體',
    文件夹: '資料夾',
    信息: '資訊',
    服务器: '伺服器',
    内存: '記憶體',
    视频: '影片',
    打印机: '印表機',
    默认: '預設',
    登录: '登入',
    用户: '使用者',
    支持: '支援',
    缓存: '快取',
    鼠标: '滑鼠',
    屏幕: '螢幕',
    搜索: '搜尋',
    代码: '程式碼',
    导出: '匯出',
    保存: '儲存',
    打开文件: '開啟檔案',
  }
  for (const [from, to] of Object.entries(expectations)) {
    assert.equal(convert(from), to, `${from} -> ${to}`)
  }
})

test('applies the curated overrides OpenCC gets wrong for Taiwan', () => {
  assert.equal(convert('只读'), '唯讀')
  assert.equal(convert('超时'), '逾時')
  assert.equal(convert('反馈'), '回饋')
  assert.equal(convert('获取'), '取得')
  assert.equal(convert('权限'), '權限')
})

test('leaves non-Han text and empty strings untouched', () => {
  assert.equal(convert(''), '')
  assert.equal(convert('Save changes'), 'Save changes')
  assert.equal(convert('v1.2.3-beta+build'), 'v1.2.3-beta+build')
  assert.equal(convert('12345 !@#$%'), '12345 !@#$%')
})

test('conversion is stable when applied twice', () => {
  const samples = ['设置', '网络与内存', '获取权限', '只读模式', '软件配置', '資訊與網路']
  for (const sample of samples) {
    const once = convert(sample)
    assert.equal(convert(once), once, `idempotent: ${sample}`)
  }
})

// ---------------------------------------------------------------------- DOM

test('converts plain text nodes in the document', () => {
  const dom = makeDom('<div id="a">设置</div><span>网络</span>')
  const converter = mount(dom)
  converter.start()
  const doc = dom.window.document
  assert.equal(doc.querySelector('#a').textContent, '設定')
  assert.equal(doc.querySelector('span').textContent, '網路')
  assert.equal(doc.documentElement.getAttribute('lang'), 'zh-Hant-TW')
  converter.stop()
})

test('never converts code, editors, terminals or user input', () => {
  const dom = makeDom(`
    <code title="设置">设置</code>
    <pre>网络</pre>
    <textarea placeholder="输入设置">设置</textarea>
    <input placeholder="设置">
    <div contenteditable="true">设置</div>
    <div class="cm-editor"><div class="cm-line">设置</div></div>
    <div class="monaco-editor">设置</div>
    <div data-zh-tw-skip>设置</div>
    <div translate="no">设置</div>
    <svg><text>设置</text></svg>
    <div id="ok">设置</div>
  `)
  const converter = mount(dom)
  converter.start()
  const doc = dom.window.document
  const mustStaySimplified = {
    code: '设置',
    pre: '网络',
    textarea: '设置',
    'div[contenteditable]': '设置',
    '.cm-editor': '设置',
    '.monaco-editor': '设置',
    '[data-zh-tw-skip]': '设置',
    '[translate="no"]': '设置',
    svg: '设置',
  }
  for (const [selector, expected] of Object.entries(mustStaySimplified)) {
    assert.equal(doc.querySelector(selector).textContent.replace(/\s+/g, ''), expected, `${selector} must stay Simplified`)
  }
  // input is a form control: its placeholder is converted, its value is not touched
  assert.equal(doc.querySelector('input').getAttribute('placeholder'), '設定')
  assert.equal(doc.querySelector('textarea').getAttribute('placeholder'), '輸入設定')
  // a hard-skipped element keeps its own attributes too
  assert.equal(doc.querySelector('code').getAttribute('title'), '设置')
  assert.equal(doc.querySelector('#ok').textContent, '設定')
  converter.stop()
})

test('converts title / placeholder / aria-label / alt attributes', () => {
  const dom = makeDom('<button title="关闭" aria-label="保存">x</button><img alt="设置">')
  const converter = mount(dom)
  converter.start()
  const doc = dom.window.document
  assert.equal(doc.querySelector('button').getAttribute('title'), '關閉')
  assert.equal(doc.querySelector('button').getAttribute('aria-label'), '儲存')
  assert.equal(doc.querySelector('img').getAttribute('alt'), '設定')
  converter.stop()
})

test('converts content added after start (MutationObserver)', async () => {
  const dom = makeDom('<div id="root"></div>')
  const converter = mount(dom)
  converter.start()
  const doc = dom.window.document
  const added = doc.createElement('p')
  added.textContent = '设置在网络里'
  doc.querySelector('#root').appendChild(added)
  await tick()
  assert.equal(added.textContent, '設定在網路裡')
  converter.stop()
})

test('converts streamed text updates and settles without looping', async () => {
  const dom = makeDom('<div id="msg">正在</div>')
  const converter = mount(dom)
  converter.start()
  const doc = dom.window.document
  const node = doc.querySelector('#msg').firstChild
  for (const chunk of ['加载', '会话', '历史']) {
    node.nodeValue = `${node.nodeValue}${chunk}`
    await tick()
  }
  assert.equal(doc.querySelector('#msg').textContent, '正在載入會話歷史')
  const before = converter.stats().textNodes
  await tick()
  await tick()
  assert.equal(converter.stats().textNodes, before, 'converter must stop writing once stable')
  converter.stop()
})

test('stop() halts conversion and refresh() catches up', async () => {
  const dom = makeDom('<div id="root">设置</div>')
  const converter = mount(dom)
  converter.start()
  const doc = dom.window.document
  assert.equal(doc.querySelector('#root').textContent, '設定')
  converter.stop()
  const late = doc.createElement('p')
  late.textContent = '网络'
  doc.body.appendChild(late)
  await tick()
  assert.equal(late.textContent, '网络', 'stopped converter must not convert')
  converter.start()
  assert.equal(late.textContent, '網路', 'restart must catch up on missed content')
  converter.stop()
})

test('conversion inside a skipped subtree is skipped even for later changes', async () => {
  const dom = makeDom('<pre id="out">设置</pre>')
  const converter = mount(dom)
  converter.start()
  const doc = dom.window.document
  const pre = doc.querySelector('#out')
  pre.firstChild.nodeValue = '网络'
  await tick()
  assert.equal(pre.textContent, '网络')
  converter.stop()
})

test('a nested skip inside converted content is respected', async () => {
  const dom = makeDom('<div id="root"></div>')
  const converter = mount(dom)
  converter.start()
  const doc = dom.window.document
  const wrap = doc.createElement('div')
  wrap.innerHTML = '<span>设置</span><code>设置</code>'
  doc.querySelector('#root').appendChild(wrap)
  await tick()
  assert.equal(wrap.querySelector('span').textContent, '設定')
  assert.equal(wrap.querySelector('code').textContent, '设置')
  converter.stop()
})

// ------------------------------------------------------------------- bundle

test('generated lib/client.js loads through the DSH module wrapper', async () => {
  const bundle = readFileSync(join(pluginDir, 'lib', 'client.js'), 'utf8')
  const dom = makeDom('<div id="root"><p>设置</p><code>设置</code><button title="关闭">保存</button></div>')
  let loaded = null
  dom.window.__ModuleLoader__ = { load: (record) => { loaded = record } }
  dom.window.eval(bundle)

  assert.ok(loaded, 'bundle must call window.__ModuleLoader__.load')
  assert.equal(loaded.id, 'dsh-zh-tw-ui')
  const required = []
  const moduleExports = loaded.factory((id) => {
    required.push(id)
    throw new Error(`unexpected require: ${id}`)
  })
  assert.deepEqual(required, [], 'the plugin must have no module dependencies')
  assert.equal(typeof moduleExports.apply, 'function')
  // cross-realm arrays: compare shape, not prototype identity
  assert.ok(Array.isArray(moduleExports.inject))
  assert.equal(moduleExports.inject.length, 0)

  const dispose = moduleExports.apply({})
  await tick()
  const doc = dom.window.document
  assert.equal(doc.querySelector('p').textContent, '設定')
  assert.equal(doc.querySelector('code').textContent, '设置')
  assert.equal(doc.querySelector('button').getAttribute('title'), '關閉')
  assert.equal(doc.querySelector('button').textContent, '儲存')
  assert.equal(doc.documentElement.getAttribute('lang'), 'zh-Hant-TW')

  // a live update through the observer
  const p = doc.createElement('p')
  p.textContent = '网络'
  doc.querySelector('#root').appendChild(p)
  await tick()
  assert.equal(p.textContent, '網路')

  // runtime API + persistence
  const api = dom.window.__dshZhTw
  assert.equal(typeof api.status, 'function')
  assert.equal(api.status().enabled, true)
  assert.equal(api.status().version, pkg.version, 'bundle version must match package.json')
  const sample = api.convert('设置')
  assert.equal(sample, '設定')
  api.off()
  assert.equal(dom.window.localStorage.getItem('dsh-zh-tw-ui:enabled'), 'off')
  const late = doc.createElement('p')
  late.textContent = '网络'
  doc.querySelector('#root').appendChild(late)
  await tick()
  assert.equal(late.textContent, '网络')
  api.on()
  await tick()
  assert.equal(late.textContent, '網路')
  assert.equal(dom.window.localStorage.getItem('dsh-zh-tw-ui:enabled'), 'on')

  assert.equal(typeof dispose, 'function')
  dispose()
  assert.equal(dom.window.__dshZhTw.status().enabled, false)
})

test('the bundle never throws into the host when no DOM is present', () => {
  const bundle = readFileSync(join(pluginDir, 'lib', 'client.js'), 'utf8')
  const sandbox = { window: {}, console }
  sandbox.window.__ModuleLoader__ = { load: (record) => { sandbox.record = record } }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  vm.runInContext(bundle, sandbox)
  const moduleExports = sandbox.record.factory(() => {})
  assert.doesNotThrow(() => moduleExports.apply({}))
})

// --------------------------------------------------------------------- main

let passed = 0
let failed = 0
for (const entry of cases) {
  try {
    await entry.fn()
    passed += 1
    console.log(`  ok    ${entry.name}`)
  } catch (error) {
    failed += 1
    console.log(`  FAIL  ${entry.name}`)
    console.log(`        ${error && error.message}`)
  }
}
console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exitCode = 1
