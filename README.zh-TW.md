# dsh-zh-tw-ui

**繁體中文** | [English](README.md)

把 **DeepSeek Harness（DSH）Web 介面整頁**變成繁體中文（台灣）的插件 ——
包含 DSH 本體、**第三方插件**、以及 DSH 之後才新增的文案。

它不是語言包。它不動 DSH 的語言系統，而是在畫面上把簡體字改寫成繁體字，
所以沒有「字典沒收錄就掉回簡體」的問題。

```
設定 → 一般 → 語言：中文（簡體）        ← 底層維持簡體
畫面上你看到的：繁體中文（台灣）        ← 這個插件在顯示層轉換
```

---

## 這個插件解決什麼問題

DSH 內建只有 `zh`（簡體）與 `en`。想在台灣用 DSH，會遇到三種破口：

1. **DSH 本體有簡體字**（沒有繁體語言包時）；
2. **第三方插件**（市集、側邊欄、IM、Agent Teams…）各自帶自己的簡體字典，語言包管不到；
3. **DSH 每次更新**都會新增文案，語言包的字典永遠落後一個版本。

本插件處理的是這三件事的**共同根源**：不管文字是誰產生的，都在顯示層轉成繁體。

## 目標 / 非目標

**目標**

| | |
|---|---|
| G1 | 整頁繁體：DSH 本體 + 第三方插件 + 之後才出現的動態內容 |
| G2 | **與 DSH 版本解耦**：DSH 升級不該讓它失效 |
| G3 | **不碰 DSH 內部 API**：不註冊字典、不 patch `LocaleRuntime`、不依賴任何 `@deepseek-ai/*` peer 版本，因此永遠不會被 DSH 的相容性檢查擋下，也能與其他語言插件共存 |
| G4 | 安全邊界明確：程式碼、編輯器、你輸入的內容**絕對不動** |
| G5 | 可逆、可審、可自行調校（開關、覆蓋表、跳過標記） |

**非目標**

- **不是語言包**：DSH 的「語言」清單不會多出一個選項，也不會改變 DSH 的語言設定。
- **不做簡→繁以外的翻譯**：不翻譯英文，不呼叫任何模型。
- **不改變底層資料**：只改畫面（詳見[已知限制](#已知限制)）。
- **不支援 TUI / headless profile**：這是純瀏覽器端（client）插件。
- **不處理 canvas 內繪製的文字、跨來源 iframe**。

---

## 為什麼不直接用其他繁體化插件

這是本專案存在的理由，所以講清楚。以下是 **2026-10-13** 的實測（資料來源：各套件
npm manifest / repo README，不是轉述）。

| 方案 | 機制 | 蓋到第三方插件 | 與 DSH 0.2.0-rc.2 的關係 |
|---|---|---|---|
| `@huanlin/dsh-plugin-better-locale` 0.4.3 | 註冊字典 | ✗ | peer 宣告 `^0.1.5-rc.2`（不含 0.2.x）→ 需手動放行例外才載入 |
| `@mimateinn/dsh-i18n` 0.2.6 | 字典 + 簡→繁字元轉換回退 | ✓ | peer 宣告 `<0.2.0-0` → 被相容性閘門擋，需例外 |
| `dsh-locale-zh-tw`（npm 0.1.1） | patch `LocaleRuntime` 內部 | ✓ | 自述對應 `dsh-client-locale@0.1.1-rc.2` 結構；**失敗會靜默降級** |
| `dsh-multi-lang-ui` 0.1.1 | 字典 + 字元表 + DOM 兜底 | ✓ | peer 無上限，過得了閘門（機制上最接近本專案） |
| `iceice666/dsh-locale-zh-tw` | 純字典（50 ns / 1691 條） | ✗（作者明說） | — |
| **dsh-zh-tw-ui**（本專案） | **純 DOM 轉換** | ✓ | **無 peer 宣告，不碰 DSH API** |

三種既有做法各有結構性問題：

1. **字典型**（better-locale、iceice666）——覆蓋率是「它發布那一刻的上游」。
   我實測 better-locale 0.4.3 帶 39 個 namespace，而 DSH 0.2.0-rc.2 註冊了約 49 個核心
   namespace，其中 **17 個完全沒有繁體字典**（`pluginManager`、`permission`、
   `settings.shell`、`settings.webSearch`、`agent-team`、`voice-input`、`schedule.manager`…）。
   更關鍵的是它的回退鏈是 `zh-TW → zh → en`，所以**缺口顯示的是簡體，不是英文** ——
   使用者看到的結果就是「裝了但好像沒成功」。
2. **patch 核心型**（`dsh-locale-zh-tw` npm 版）——與 DSH 內部結構強耦合，而且它自己
   設計成「任何失敗都靜默降級」：DSH 一改版就可能變成完全沒作用，還不會報錯。
3. **宣告了 peer 範圍的**——只要你的 DSH 版本落在範圍外，DSH 會**直接跳過整個 bundle**，
   而且是在啟動時靜默跳過（本機的 `compatibility.json` 就是這種「手動放行例外」的痕跡）。
   語言插件本來就與 DSH 版本高度耦合，這個問題只會反覆發生。

**本專案的取捨**：不碰 DSH 任何 API，只在 DOM 上做事。代價是它變成「顯示層轉換」，
換來的是與版本完全解耦、第三方插件也覆蓋、而且壞掉時看得出來（而不是靜默）。
這個取捨的完整後果列在[已知限制](#已知限制)。

> 附註：`dsh-multi-lang-ui` 的做法（字典 + 字元表 + DOM 兜底）在功能上與本專案重疊，
> 它也是本專案之外的可行選擇。本專案選擇更小、更單一：**只做 DOM 轉換**、只有一個
> 職責、沒有字典需要跟版、沒有任何 `@deepseek-ai/*` 依賴。

---

## 運作方式

```
                ┌─ DSH 本體文案（簡體）
畫面文字 ────────┼─ 第三方插件文案（各自簡體）
                └─ 之後才出現的內容（串流、動態面板）
                        │
                        ▼
        DOM 文字節點 → OpenCC cn→twp（台灣用語）→ 台灣用語覆蓋表 → 寫回
                        ▲
                        └─ MutationObserver：新增節點 / 文字變更時再跑一次
```

- 轉換引擎：**OpenCC `cn → twp`**（簡體 → 繁體台灣用語），
  例如 设置→設定、网络→網路、软件→軟體、文件夹→資料夾、服务器→伺服器、
  内存→記憶體、屏幕→螢幕、鼠标→滑鼠、保存→儲存、搜索→搜尋、插件→外掛。
- 台灣用語覆蓋表（`src/convert.mjs` 的 `DEFAULT_OVERRIDES`）修正 OpenCC 的漏網之魚：
  只讀→唯讀、超時→逾時、反饋→回饋、獲取→取得、許可權→權限。
- 同時把 `<html lang>` 設為 `zh-Hant-TW`（讓瀏覽器選用台灣字形）。
- 每個文字節點都有記憶快取；不含漢字的字串直接跳過；**只在自己寫入的值不同時才寫**，
  並且記住自己寫過的值，避免與 React 互相觸發造成迴圈。

## 安全邊界：絕對不轉的東西

| 對象 | 行為 |
|---|---|
| `<code>` `<pre>` `<kbd>` `<samp>` `<var>`、CodeMirror / Monaco / xterm / ace / 語法高亮 | **整棵子樹與屬性都不動** |
| `<input>` `<textarea>` `<select>` `<option>` | 只轉 `placeholder` / `title`，**你輸入或選取的內容不動** |
| `contenteditable`（含富文本輸入框） | 不動 |
| `<svg>` `<math>`、`<script>` `<style>` `<canvas>` `<iframe>` `<video>` `<audio>` | 不動 |
| 加了 `data-zh-tw-skip` 或 `translate="no"` 的元素 | 不動 |
| 不含漢字的字串（英文、日文假名、數字、程式碼） | 原樣保留 |

換句話說：**程式碼一定不會被改**，複製程式碼的行為完全不受影響。

---

## 安裝

### A. 從這個 repo 安裝（目前唯一正式路徑）

```sh
git clone https://github.com/linmino/dsh-zh-tw-ui.git
cd dsh-zh-tw-ui
node install.mjs --profile desktop      # 預設就是 desktop；Web profile 用 --profile web
```

`install.mjs` 只做四件事，全部可還原：

1. 把 profile 的 `package.json` 與 `cordis.patch.yml` 備份成 `*.zh-tw-ui.bak`；
2. 在 `dsh.profile.bundles` 加入 `dsh-zh-tw-ui`；
3. 把 `locale` 的 `preference` 設為 `zh`（底層簡體、畫面繁體；這樣即使你之後移除
   其他語言包，UI 也不會掉回英文導致沒有中文可轉）；
4. 建立連結 `<profile>/node_modules/dsh-zh-tw-ui` → 這個目錄。

它**不會執行任何套件管理器**，所以不會動到你 profile 裡既有的相依。

接著**重啟 DeepSeek Harness**（新增 bundle 只在啟動時組裝，重新整理頁面不夠）。

### B. 從 npm 安裝（尚未發布）

`dsh-zh-tw-ui` 這個名稱在 npm 上目前是空的。發布後即可：

```sh
dsh plugin --profile desktop add dsh-zh-tw-ui
```

### 移除

```sh
node uninstall.mjs --profile desktop
```

會移除連結、從 `bundles` 拿掉、並還原兩個備份檔；你的插件原始碼不會被刪除。
之後重啟 DSH 即回到原狀。

---

## 使用與調校

外掛沒有 UI，不需要設定。要調整時在主視窗的 DevTools console：

```js
__dshZhTw.status()          // { version, enabled, textNodes, attributes, skippedSubtrees, passes }
__dshZhTw.off()             // 暫時停止（已轉過的文字維持不變）
__dshZhTw.on()              // 恢復
__dshZhTw.toggle()
__dshZhTw.refresh()         // 重新掃描整頁
__dshZhTw.convert('设置')    // 測單一字串 → '設定'
```

開關狀態存在 `localStorage['dsh-zh-tw-ui:enabled']`，重開仍有效。

**改詞彙**：編輯 `src/convert.mjs` 的 `DEFAULT_OVERRIDES`（`[簡體詞, 繁體詞]` 陣列），
然後 `node build.mjs` 重新產生 `lib/client.js`，重新載入頁面即生效。

**讓某個區塊不要被轉**：在該元素加上 `data-zh-tw-skip`（適合放原始簡體對照、截圖區等）。

---

## 已知限制

誠實清單。這些都是「顯示層轉換」這個設計的必然結果：

1. **只改畫面，不改資料**。底層儲存的、送給模型的、寫進檔案的都還是原本的簡體。
   - 複製**程式碼**：不受影響（程式碼區塊被排除）。
   - 複製**散文**：會複製到繁體（因為複製的是畫面文字）。
   - 你自己的訊息泡泡顯示為繁體，但送給模型的是你原本打的字。
2. **canvas 內繪製的文字不會被轉**（圖表、圖片編輯器、部分自繪元件）。
3. **跨來源 iframe 內的內容不會被轉**（同源 iframe 會被處理）。
4. **詞彙語境可能出錯**。OpenCC 是詞組對照表，偶爾會有不合語境的轉法
   （例如某些專有名詞）。可自行調整覆蓋表或對該區塊加 `data-zh-tw-skip`。
5. **有效能成本**：每個文字節點要查一次字典。已用記憶快取、非漢字快篩、
   僅處理新增/變更節點來壓低；但在超長對話或大量清單頁仍可能感受到極輕微的延遲。
6. **不是語言包**：DSH 的語言清單不會出現「繁體中文」。若你把 DSH 語言切到 English，
   畫面上就沒有中文可轉，效果會變成「什麼都沒發生」。
7. **只適用 Web / Desktop profile**：TUI、headless 沒有 DOM。
8. **連結式安裝可能被套件管理器清掉**：日後從市集安裝其他插件若觸發 pnpm 重新整理
   `node_modules`，這個連結可能消失（插件會停止作用，但不會讓 DSH 壞掉）。
   重跑一次 `node install.mjs` 即可。
9. **沒有處理 DSH 以外的視窗**：DSH Desktop 的原生選單/系統匣等原生 UI 不在範圍內。

## 測試

```sh
npm install     # 只有 jsdom（devDependency）
npm test
```

14 項測試，涵蓋：

- 轉換品質（核心詞彙、台灣用語覆蓋表）、非漢字不變、二次轉換穩定；
- 跳過規則：`code`/`pre`/`textarea`/`input`/`contenteditable`/CodeMirror/Monaco/`svg`/
  `data-zh-tw-skip`/`translate="no"`，以及表單控制項只轉 `placeholder`；
- 屬性轉換（`title`/`placeholder`/`aria-label`/`alt`）；
- 動態節點（MutationObserver）、串流文字更新、**收斂後不再寫入**（不會與 React 互踢）；
- `off()` 停止、`on()` 追上漏掉的內容；
- **端對端**：用 DSH 真正的 `window.__ModuleLoader__.load(...)` 協定載入產出的
  `lib/client.js`，套用到 DOM 上驗證結果、開關與持久化；
- 沒有 DOM 的環境下 `apply()` 不會丟錯（永遠不會弄壞 DSH 用戶端）。

## 專案結構

```
build.mjs                由 src/ 產生 lib/client.js（含語法檢查）
install.mjs              安裝到 profile（備份、bundles、locale、連結）
uninstall.mjs            還原
lib/index.js             host 半邊：no-op
lib/client.js            產生出來的瀏覽器 bundle（唯一被 DSH 載入的檔案）
src/apply.mjs            cordis 客戶端插件本體（開關、API）
src/convert.mjs          轉換引擎 + 台灣用語覆蓋表
src/dom-convert.mjs      DOM 走訪、跳過規則、MutationObserver
src/vendor/              內嵌的 opencc-js（原檔未修改，附授權全文）
cordis.patch.yml         把插件列插入 DSH 的 patch 層
```

## 授權

本專案 MIT（見 `LICENSE`）。內嵌 `opencc-js`（MIT）與 OpenCC 字典（Apache-2.0），
詳見 [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md)。

## 致謝

- [opencc-js](https://github.com/nk2028/opencc-js) — 瀏覽器端 OpenCC 實作
- [OpenCC](https://github.com/BYVoid/OpenCC) — 簡繁／台灣用語字典
- 以及每一位在被簡體介面困擾後，順手寫了插件的人
