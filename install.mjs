/**
 * Install dsh-zh-tw-ui into a DSH profile.
 *
 *   node install.mjs                 # default profile: desktop
 *   node install.mjs --profile web
 *
 * Steps (all reversible with uninstall.mjs):
 *   1. back up the profile's package.json and cordis.patch.yml;
 *   2. add "dsh-zh-tw-ui" to dsh.profile.bundles;
 *   3. point the locale preference at zh, so the base UI is Simplified Chinese
 *      and this plugin makes it Traditional (deterministic, and it keeps working
 *      after a partial language pack is removed);
 *   4. link <profile>/node_modules/dsh-zh-tw-ui -> this directory.
 *
 * No package manager runs: nothing in the profile is re-resolved.
 */
import { existsSync, lstatSync, readFileSync, writeFileSync, copyFileSync, symlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginDir = dirname(fileURLToPath(import.meta.url))
const PACKAGE_NAME = 'dsh-zh-tw-ui'
const BACKUP_SUFFIX = '.zh-tw-ui.bak'

const args = process.argv.slice(2)
const profileFlag = args.indexOf('--profile')
const profileName = profileFlag === -1 ? 'desktop' : args[profileFlag + 1]
if (!profileName) {
  console.error('usage: node install.mjs [--profile <name>]')
  process.exit(1)
}

const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
const profileDir = join(dshHome, 'profiles', profileName)
const manifestPath = join(profileDir, 'package.json')
const patchPath = join(profileDir, 'cordis.patch.yml')
const linkPath = join(profileDir, 'node_modules', PACKAGE_NAME)

function fail(message) {
  console.error(`error: ${message}`)
  process.exit(1)
}

if (!existsSync(manifestPath)) fail(`profile manifest not found: ${manifestPath}`)
if (!existsSync(join(pluginDir, 'lib', 'client.js'))) fail('lib/client.js is missing — run: node build.mjs')

console.log(`plugin : ${pluginDir}`)
console.log(`profile: ${profileDir}`)

// ---------------------------------------------------------------- 1. backups
for (const path of [manifestPath, patchPath]) {
  const backup = path + BACKUP_SUFFIX
  if (existsSync(path) && !existsSync(backup)) {
    copyFileSync(path, backup)
    console.log(`backup : ${backup}`)
  } else if (existsSync(backup)) {
    console.log(`backup : kept existing ${backup}`)
  }
}

// ------------------------------------------------------- 2. profile manifest
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
manifest.dsh ??= {}
manifest.dsh.profile ??= {}
manifest.dsh.profile.bundles ??= []
if (!manifest.dsh.profile.bundles.includes(PACKAGE_NAME)) {
  manifest.dsh.profile.bundles.push(PACKAGE_NAME)
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`bundle : added "${PACKAGE_NAME}" to dsh.profile.bundles`)
} else {
  console.log(`bundle : "${PACKAGE_NAME}" already listed`)
}

// --------------------------------------------------------- 3. locale setting
const patch = readFileSync(patchPath, 'utf8')
const preferenceMatches = patch.match(/^(\s*preference:\s*)(\S+)\s*$/gm) ?? []
if (preferenceMatches.length > 1) fail(`expected at most one "preference:" line in ${patchPath}, found ${preferenceMatches.length}`)
if (preferenceMatches.length === 1 && !/preference:\s*zh\s*$/.test(preferenceMatches[0])) {
  const next = patch.replace(/^(\s*preference:\s*)(\S+)(\s*)$/m, '$1zh$3')
  writeFileSync(patchPath, next)
  console.log(`locale : ${preferenceMatches[0].trim()} -> preference: zh (base UI Simplified, converted to Traditional on screen)`)
} else {
  console.log('locale : preference already zh (or absent) — base UI stays as configured')
}

// ------------------------------------------------------------------ 4. link
if (existsSync(linkPath) || lstatSync(linkPath, { throwIfNoEntry: false })) {
  const stats = lstatSync(linkPath)
  if (stats.isSymbolicLink()) {
    console.log(`link   : already present (${linkPath})`)
  } else {
    fail(`${linkPath} exists and is not a link — remove it manually, then re-run`)
  }
} else {
  symlinkSync(resolve(pluginDir), linkPath, 'junction')
  console.log(`link   : ${linkPath} -> ${resolve(pluginDir)}`)
}

console.log('\ninstalled. next:')
console.log('  1. restart DeepSeek Harness (a new bundle is composed only at boot);')
console.log('  2. keep Settings -> General -> Language on 中文; the screen shows Traditional either way.')
console.log('  to revert: node uninstall.mjs')
