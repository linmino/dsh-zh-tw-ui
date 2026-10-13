/**
 * Host half of dsh-zh-tw-ui — intentionally a no-op.
 *
 * All of the work happens in the browser: the client bundle rewrites Simplified
 * Chinese text to Traditional Chinese (Taiwan) as the DOM appears. No host
 * service, storage, network access or filesystem access is used.
 */

const name = 'dsh-zh-tw-ui'
const inject = []

/** @param {unknown} _ctx host cordis context (unused). */
function apply(_ctx) {}

export { apply, inject, name }
