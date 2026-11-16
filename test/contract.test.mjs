/**
 * Contract test for the sidebar view-options integration.
 *
 * The plugin adds its "Shown workspaces" section by portalling into the
 * view-options menu rendered by the shipped `@deepseek-ai/dsh-client-ui-workspace`
 * (ui-primitives `Menu`). That menu exposes no slot, so the plugin depends on
 * exact DOM facts. This test reads the installed implementation and asserts
 * those facts still hold, instead of trusting them from memory:
 *
 *  - the Workspace section header carries `data-sidebar-workspace-header`;
 *  - the view-options Menu is opened with `portal` (its list is appended to
 *    `body`) and `dense` (30px rows), and its trigger lives in that header, so
 *    the list and the header's trigger span share a CSS anchor name
 *    (`anchor-name` / `position-anchor`);
 *  - each Workspace group row is `data-row-key="workspace:<workspaceId>"` and
 *    its group section is the ancestor carrying `--dsh-workspace-indent`;
 *  - the menu list is `role="menu"` with `data-menu-material`, and its item
 *    container is `div[role="presentation"]`.
 *
 * Run with `node test/contract.test.mjs`. Missing installation sources are
 * reported as skips; the plugin's own selectors are always checked.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const install = process.env.DSH_INSTALL_DIR
  || '/usr/local/lib/node_modules/@deepseek-ai/dsh'
const packages = join(install, 'node_modules', '@deepseek-ai')

const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
for (const needle of [
  '[data-sidebar-workspace-header]',
  '[role="menu"][data-menu-material]',
  'div[role="presentation"]',
  '[data-sidebar-list-area]',
  '[data-row-key^="workspace:"]',
  '--dsh-workspace-indent',
  'data-wss-workspace-hidden',
  'position-anchor',
  'anchor-name',
]) {
  assert.ok(client.includes(needle), `client.js must reference ${needle}`)
}
assert.ok(client.includes('menuitemcheckbox'), 'workspace rows expose checkbox menu semantics')
assert.ok(client.includes('dsh-workspace-show:hidden-workspaces.v1'), 'per-browser preference key is present')

const workspaceFiles = {
  browser: join(packages, 'dsh-client-ui-workspace/src/client/rows/WorkspaceBrowser.tsx'),
  rows: join(packages, 'dsh-client-ui-workspace/src/client/rows/Rows.tsx'),
  tree: join(packages, 'dsh-client-ui-workspace/src/client/tree.ts'),
}
const missing = Object.entries(workspaceFiles).filter(([, path]) => !existsSync(path))
if (missing.length > 0) {
  console.log(`contract.test: skip installed-source checks (missing ${missing.map(([k]) => k).join(', ')})`)
} else {
  const browser = readFileSync(workspaceFiles.browser, 'utf8')
  const rows = readFileSync(workspaceFiles.rows, 'utf8')
  const tree = readFileSync(workspaceFiles.tree, 'utf8')

  assert.match(browser, /data-sidebar-workspace-header=""/, 'header marker present')
  assert.match(browser, /--dsh-workspace-indent/, 'group sections carry the indent custom property')

  const menuStart = browser.indexOf('function ViewOptionsMenu')
  assert.ok(menuStart >= 0, 'ViewOptionsMenu implementation found')
  const menuEnd = browser.indexOf('\n}\n', menuStart)
  const menuSource = browser.slice(menuStart, menuEnd === -1 ? undefined : menuEnd)
  assert.ok(menuSource.includes('dense'), 'view options menu uses the dense row metrics')
  assert.ok(menuSource.includes('portal'), 'view options menu portals its list to the body')
  assert.ok(menuSource.includes('anchor={('), 'view options menu uses an inline anchor in the header')
  assert.ok(!menuSource.includes('anchorRef'), 'view options menu does not use an external anchor ref')

  assert.match(rows, /data-row-key=\{`workspace:\$\{group\.key\}`\}/, 'workspace rows expose workspace:<key>')
  assert.match(tree, /buildGroup\(\s*workspace\.workspaceId,\s*workspace\.workspaceId/, 'real workspace group key equals workspaceId')
  assert.match(tree, /UNGROUPED_KEY = ''/, 'ungrouped group has the empty key')

  const assetDir = join(packages, 'dsh-web-frontend/dist/assets')
  const mapPath = existsSync(join(assetDir, 'index-Ciz7DZxv.js.map'))
    ? join(assetDir, 'index-Ciz7DZxv.js.map')
    : null
  if (mapPath === null) {
    console.log('contract.test: skip ui-primitives checks (frontend source map not found)')
  } else {
    const map = JSON.parse(readFileSync(mapPath, 'utf8'))
    const index = map.sources.findIndex((source) => source.includes('client/ui-primitives/lib/index.js'))
    assert.ok(index >= 0, 'ui-primitives source found in the frontend map')
    const primitives = map.sourcesContent?.[index] ?? ''
    for (const [needle, message] of [
      ['anchorName = `--dsh-menu-trigger-', 'menu derives a trigger anchor name'],
      ['positionAnchor: anchorName', 'portalled menu list positions against that anchor'],
      ['createPortal(list, document.body)', 'portalled menu list is appended to body'],
      ['"data-menu-material": "translucent"', 'menu surface is marked with data-menu-material'],
      ['data-menu-material', 'menu surface marker is present'],
      ['role: "menu"', 'menu list exposes role=menu'],
      ['role: "presentation"', 'menu item container is role=presentation'],
    ]) {
      assert.ok(primitives.includes(needle), message)
    }
  }
}

console.log('contract.test.mjs: ok')
