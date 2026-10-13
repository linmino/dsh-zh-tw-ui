# dsh-zh-tw-ui

[繁體中文](README.zh-TW.md) | **English**

Renders the **entire DeepSeek Harness (DSH) Web UI in Traditional Chinese
(Taiwan)** — DSH's own copy, **third-party plugin copy**, and text that later DSH
versions add — by converting the DOM, not by shipping a language pack.

```
Settings -> General -> Language: 中文 (Simplified)   <- the app's own locale
What you actually see:           繁體中文（台灣）     <- converted on screen
```

Because it works at the render layer, it does not have the failure mode that
dictionary-based language packs have: *uncovered copy falls back to Simplified
Chinese and the UI looks half-translated.*

---

## The problem

DSH ships exactly two locales: `zh` (Simplified) and `en`. Using DSH in Taiwan
breaks in three places at once:

1. **DSH's own UI** is Simplified without a language pack;
2. **third-party plugins** (market, sidebar, IM bridges, Agent Teams, …) each ship
   their own Simplified dictionaries, which no language pack can reach;
3. **every DSH release adds copy**, so a language pack's dictionary is always one
   version behind.

This plugin attacks the shared root cause: whatever produced the text, it is
converted on screen.

## Goals / non-goals

**Goals**

| | |
|---|---|
| G1 | The whole page in Traditional Chinese: DSH itself, third-party plugins, and dynamic content that appears later |
| G2 | **Decoupled from the DSH version** — a DSH upgrade must not break it |
| G3 | **Touches no DSH internals**: no dictionary registration, no `LocaleRuntime` patching, no `@deepseek-ai/*` peer range — so DSH's compatibility gate can never skip it, and it coexists with other locale plugins |
| G4 | A clear safety boundary: code, editors and anything you type are **never** altered |
| G5 | Reversible, auditable, tunable (a runtime switch, an override table, a skip marker) |

**Non-goals**

- **Not a language pack**: no new entry in DSH's Language list, no change to DSH's
  locale setting.
- **No translation beyond Simplified → Traditional**: English is left alone, no
  model calls.
- **Does not change stored data** — see [Limitations](#limitations).
- **Web/desktop clients only**: no DOM in TUI or headless profiles.
- **Does not convert text painted into a canvas, or cross-origin iframes.**

---

## Why not just use another Traditional Chinese plugin?

This is the reason the project exists, so here is the honest version. All figures
were checked on **2026-10-13** from each package's npm manifest or repo README.

| Option | Mechanism | Covers third-party plugins | Relationship with DSH 0.2.0-rc.2 |
|---|---|---|---|
| `@huanlin/dsh-plugin-better-locale` 0.4.3 | registers dictionaries (39 namespaces) | no | peer says `^0.1.5-rc.2` (excludes 0.2.x) → needs a manual exact-version exemption to load |
| `@mimateinn/dsh-i18n` 0.2.6 | dictionaries + Simplified→Traditional character fallback | yes | peer says `<0.2.0-0` → blocked by the compatibility gate without an exemption |
| `dsh-locale-zh-tw` (npm, 0.1.1) | patches `LocaleRuntime` internals | yes | documents itself against the `dsh-client-locale@0.1.1-rc.2` shape; **degrades silently** on mismatch |
| `dsh-multi-lang-ui` 0.1.1 | dictionaries + char table + DOM fallback | yes | peer has no upper bound, passes the gate — mechanically the closest to this project |
| `iceice666/dsh-locale-zh-tw` | dictionaries only (50 ns / 1691 strings) | no (by design, per its README) | — |
| **dsh-zh-tw-ui** (this project) | **pure DOM conversion** | yes | **no peer dependencies, touches no DSH API** |

Each existing approach has a structural weakness:

1. **Dictionary-based** (better-locale, iceice666) — coverage is frozen at the
   upstream version the pack was built against. Measured on this machine:
   better-locale 0.4.3 ships 39 namespaces while DSH 0.2.0-rc.2 registers about 49
   core namespaces, and **17 of them have no Traditional dictionary at all**
   (`pluginManager`, `permission`, `settings.shell`, `settings.webSearch`,
   `agent-team`, `voice-input`, `schedule.manager`, …). Worse, its fallback chain
   is `zh-TW → zh → en`, so the gaps render in **Simplified, not English** — which
   is exactly why a language pack can look like "it installed but nothing
   happened".
2. **Core-patching** (the npm `dsh-locale-zh-tw`) — tightly coupled to DSH
   internals and *designed* to degrade silently: after a DSH update it can simply
   stop doing anything, without an error.
3. **Declared peer ranges** — when your DSH version falls outside them, DSH
   **skips the whole bundle at boot**, silently (the on-disk `compatibility.json`
   exemption list is the fingerprint of working around that).

**This project's trade-off**: touch no DSH API, work only on the DOM. The price is
that it is a *display-layer* conversion; what you get is version independence,
coverage of third-party plugins, and failures you can actually see. The full
consequences are listed under [Limitations](#limitations).

> Note: `dsh-multi-lang-ui` overlaps this project functionally and is a valid
> alternative. This project deliberately stays smaller and single-purpose: **DOM
> conversion only** — one job, no dictionary to keep in sync, no
> `@deepseek-ai/*` dependency of any kind.

---

## How it works

```
                ┌─ DSH's own copy (Simplified)
screen text ────┼─ third-party plugin copy (their own Simplified)
                └─ content that appears later (streaming, dynamic panels)
                        │
                        ▼
        DOM text node → OpenCC cn→twp (Taiwan wording) → override table → write back
                        ▲
                        └─ MutationObserver: re-run on added nodes / changed text
```

- Engine: **OpenCC `cn → twp`** (Simplified → Traditional with Taiwan vocabulary):
  设置→設定, 网络→網路, 软件→軟體, 文件夹→資料夾, 服务器→伺服器, 内存→記憶體,
  屏幕→螢幕, 鼠标→滑鼠, 保存→儲存, 搜索→搜尋, 插件→外掛.
- A small override table (`DEFAULT_OVERRIDES` in `src/convert.mjs`) fixes wording
  OpenCC misses or renders in a non-Taiwan way: 只讀→唯讀, 超時→逾時, 反饋→回饋,
  獲取→取得, 許可權→權限.
- `<html lang>` is set to `zh-Hant-TW` so the browser picks Taiwan glyph forms.
- Memoised per text node, non-Han strings short-circuit, and values are only
  written when they actually change — the converter also remembers its own writes,
  so it can never ping-pong with React.

## Safety boundary: what is never converted

| Target | Behaviour |
|---|---|
| `<code>` `<pre>` `<kbd>` `<samp>` `<var>`, CodeMirror / Monaco / xterm / ace / syntax highlighting | **subtree and attributes untouched** |
| `<input>` `<textarea>` `<select>` `<option>` | only `placeholder` / `title`; **what you type or pick is untouched** |
| `contenteditable` (including rich-text composers) | untouched |
| `<svg>` `<math>`, `<script>` `<style>` `<canvas>` `<iframe>` `<video>` `<audio>` | untouched |
| anything marked `data-zh-tw-skip` or `translate="no"` | untouched |
| strings without Han characters (English, kana, digits, code) | passed through |

In other words: **code is never rewritten**, and copying code behaves exactly as
before.

---

## Install

### A. From this repo (the supported path today)

```sh
git clone https://github.com/linmino/dsh-zh-tw-ui.git
cd dsh-zh-tw-ui
node install.mjs --profile desktop      # 'desktop' is the default; use --profile web for the web profile
```

`install.mjs` does exactly four things, all reversible:

1. backs the profile's `package.json` and `cordis.patch.yml` up as `*.zh-tw-ui.bak`;
2. appends `dsh-zh-tw-ui` to `dsh.profile.bundles`;
3. sets the `locale` row's `preference` to `zh` (Simplified underneath, Traditional
   on screen — this keeps the UI Chinese even if you later remove another language
   pack, instead of falling back to English with nothing to convert);
4. links `<profile>/node_modules/dsh-zh-tw-ui` → this directory.

It runs **no package manager**, so nothing else in your profile is re-resolved.

Then **restart DeepSeek Harness** — a new bundle is composed only at boot;
refreshing the page is not enough.

### B. From npm (not published yet)

The name `dsh-zh-tw-ui` is currently free on npm. Once published:

```sh
dsh plugin --profile desktop add dsh-zh-tw-ui
```

### Uninstall

```sh
node uninstall.mjs --profile desktop
```

Removes the link, drops the bundle entry and restores both backups. Your plugin
sources are never deleted. Restart DSH afterwards.

---

## Using it

The plugin has no UI and needs no configuration. To tune it, use the DevTools
console of the main window:

```js
__dshZhTw.status()          // { version, enabled, textNodes, attributes, skippedSubtrees, passes }
__dshZhTw.off()             // stop converting (text already converted stays)
__dshZhTw.on()              // resume
__dshZhTw.toggle()
__dshZhTw.refresh()         // full re-scan
__dshZhTw.convert('设置')    // test one string -> '設定'
```

The switch is persisted in `localStorage['dsh-zh-tw-ui:enabled']`.

**Change wording**: edit `DEFAULT_OVERRIDES` in `src/convert.mjs` (a list of
`[simplified, traditional]` pairs), run `node build.mjs`, reload the page.

**Exclude a region**: add `data-zh-tw-skip` to the element (handy for
side-by-side references or screenshots).

---

## Limitations

An honest list. All of these follow from the display-layer design:

1. **The screen changes; the data does not.** Stored text, what the model
   receives, and what is written to files stay as they were.
   - Copying **code**: unaffected (code blocks are excluded).
   - Copying **prose**: you get Traditional, because the copy comes from the screen.
   - Your own message bubble renders in Traditional, but the model still receives
     exactly what you typed.
2. **Text painted into a canvas is not converted** (charts, image editors,
   self-drawn components).
3. **Cross-origin iframe content is not converted** (same-origin iframes are).
4. **Wording can be contextually wrong.** OpenCC is a phrase table; occasional
   mismatches happen (proper nouns especially). Tune the override table or mark
   the region with `data-zh-tw-skip`.
5. **There is a performance cost.** Every text node costs a dictionary lookup.
   Memoisation, the non-Han short circuit, and only touching added/changed nodes
   keep it small, but very long conversations or huge list pages may show a slight
   delay.
6. **It is not a language pack.** No "繁體中文" entry appears in DSH's Language
   list. If you switch DSH to English there is no Chinese on screen to convert, so
   the effect is "nothing happened".
7. **Web/desktop clients only** — TUI and headless have no DOM.
8. **A linked install can be pruned.** If installing another plugin from the
   market later triggers pnpm to re-resolve `node_modules`, the link may disappear
   (the plugin stops working; DSH itself is unaffected). Re-run
   `node install.mjs`.
9. **Native chrome is out of scope**: DSH Desktop's native menus, tray, and other
   non-web UI.

## Tests

```sh
npm install
npm test
```

14 tests covering:

- conversion quality (core vocabulary, Taiwan override table), non-Han
  passthrough, stability under a second pass;
- skip rules: `code`/`pre`/`textarea`/`input`/`contenteditable`/CodeMirror/Monaco/
  `svg`/`data-zh-tw-skip`/`translate="no"`, and form controls converting only their
  `placeholder`;
- attribute conversion (`title`/`placeholder`/`aria-label`/`alt`);
- live mutations, streaming updates, and **settling without further writes**
  (no ping-pong with React);
- `off()` stops, `on()` catches up on what it missed;
- **end to end**: the generated `lib/client.js` loaded through DSH's real
  `window.__ModuleLoader__.load(...)` protocol, applied to a DOM, including the
  runtime switch and persistence;
- `apply()` never throws when there is no DOM (it can never break the client).

## Repository layout

```
build.mjs                generates lib/client.js from src/ (with a syntax check)
install.mjs              installs into a profile (backup, bundles, locale, link)
uninstall.mjs            reverts
lib/index.js             host half: a no-op
lib/client.js            the generated browser bundle (the only file DSH loads)
src/apply.mjs            cordis client plugin body (switch, runtime API)
src/convert.mjs          conversion engine + Taiwan override table
src/dom-convert.mjs      DOM walk, skip rules, MutationObserver
src/vendor/              vendored opencc-js (byte-identical, licenses included)
cordis.patch.yml         inserts the plugin row into DSH's patch layer
test/run.mjs             the test suite
```

## License

MIT for this project (see `LICENSE`). It embeds `opencc-js` (MIT) and the OpenCC
dictionaries (Apache-2.0) — see [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md)
for the file hashes and full license texts.

## Credits

- [opencc-js](https://github.com/nk2028/opencc-js) — OpenCC in the browser
- [OpenCC](https://github.com/BYVoid/OpenCC) — the Simplified/Traditional and
  Taiwan-vocabulary dictionaries
- And everyone who, tired of a Simplified interface, wrote a plugin
