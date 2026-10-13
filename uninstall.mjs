/**
 * Uninstall dsh-zh-tw-ui from a DSH profile.
 *
 *   node uninstall.mjs                 # default profile: desktop
 *   node uninstall.mjs --profile web
 *
 * Removes the node_modules link and restores the backed-up package.json and
 * cordis.patch.yml. The plugin's own files are never deleted.
 */
import { existsSync, lstatSync, readFileSync, writeFileSync, copyFileSync, rmdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginDir = dirname(fileURLToPath(import.meta.url))
const PACKAGE_NAME = 'dsh-zh-tw-ui'
const BACKUP_SUFFIX = '.zh-tw-ui.bak'

const args = process.argv.slice(2)
const profileFlag = args.indexOf('--profile')
const profileName = profileFlag === -1 ? 'desktop' : args[profileFlag + 1]
if (!profileName) {
  console.error('usage: node uninstall.mjs [--profile <name>]')
  process.exit(1)
}

const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
const profileDir = join(dshHome, 'profiles', profileName)
const manifestPath = join(profileDir, 'package.json')
const patchPath = join(profileDir, 'cordis.patch.yml')
const linkPath = join(profileDir, 'node_modules', PACKAGE_NAME)

console.log(`profile: ${profileDir}`)

// --------------------------------------------------------------- 1. unlink
const stats = lstatSync(linkPath, { throwIfNoEntry: false })
if (stats && stats.isSymbolicLink()) {
  // rmdir on a junction removes only the link, never the target
  rmdirSync(linkPath)
  console.log(`link   : removed ${linkPath}`)
  if (existsSync(join(pluginDir, 'lib', 'client.js'))) {
    console.log('link   : plugin files are intact')
  } else {
    console.error('warning: the link target no longer exists!')
  }
} else if (stats) {
  console.error(`warning: ${linkPath} is not a link — left untouched`)
} else {
  console.log('link   : not present')
}

// ------------------------------------------------------------ 2. remove from
// profile manifest bundles list (backup restore below handles the rest)
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const bundles = manifest?.dsh?.profile?.bundles
  if (Array.isArray(bundles) && bundles.includes(PACKAGE_NAME)) {
    manifest.dsh.profile.bundles = bundles.filter((name) => name !== PACKAGE_NAME)
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    console.log(`bundle : removed "${PACKAGE_NAME}" from dsh.profile.bundles`)
  } else {
    console.log('bundle : not listed')
  }
}

// --------------------------------------------------------------- 3. restore
for (const path of [manifestPath, patchPath]) {
  const backup = path + BACKUP_SUFFIX
  if (existsSync(backup)) {
    copyFileSync(backup, path)
    console.log(`restore: ${backup} -> ${path}`)
  }
}

console.log('\nuninstalled. restart DeepSeek Harness to boot without the plugin.')
