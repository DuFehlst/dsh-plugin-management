import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { buildInventory, classify, isCore } from '../src/host/inventory.js'
import { applyToggle, scanPatchRows } from '../src/host/patch-ops.js'
import { toPath } from '../src/host/index.js'

const ROOT = new URL('../', import.meta.url)

// ---- M1: inventory 纯函数 ----
test('classify / isCore 正确', () => {
  assert.equal(classify('dsh-simple-wiki-memory'), 'memory')
  assert.equal(classify('context-web'), 'visual')
  assert.equal(classify('dsh-trading-toolkit'), 'quant')
  assert.equal(classify('unknown-plugin'), 'other')
  assert.equal(isCore('@deepseek-ai/dsh-base'), true)
  assert.equal(isCore('session-query-sqlite'), true)
  assert.equal(isCore('terminal'), true)
  assert.equal(isCore('context-web'), false)
})

test('buildInventory 产出自定义插件分类清单（含启用态/加载形态/core 标记）', async () => {
  const pkg = {
    dependencies: {
      'context-web': 'link:workbench/context-web',
      'dsh-test-drive': '^0.3.0',
      'dsh-trading-toolkit': 'github:kentleenot/dsh-trading-toolkit',
      'dsh-outline': '^0.1.6',
    },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'context-web', 'dsh-test-drive'] } },
  }
  const patchRows = [
    { id: 'session-query-sqlite', disabled: false, hasInsert: false },
    { id: 'dsh-trading-toolkit', disabled: false, hasInsert: true },
    { id: 'terminal', disabled: false, hasInsert: true },
  ]
  const pkgInfo = (name) => ({
    'context-web': { version: '0.1.0', description: '会话地图+Agent 画布', hasBundle: true },
    'dsh-test-drive': { version: '0.3.0', description: '冒烟', hasBundle: true },
    'dsh-trading-toolkit': { version: '0.1.0', description: '量化', hasBundle: false },
    'dsh-outline': { version: '0.1.6', description: '大纲', hasBundle: true },
  }[name] ?? { version: '', description: '', hasBundle: false })

  const items = buildInventory({ packageJson: pkg, patchRows, pkgInfo })
  const byName = Object.fromEntries(items.map(i => [i.name, i]))

  assert.equal(byName['context-web'].category, 'visual')
  assert.equal(byName['context-web'].enabled, true)
  assert.equal(byName['context-web'].loadKind, 'bundle')
  assert.equal(byName['context-web'].isCore, false)
  assert.equal(byName['context-web'].spec, 'link:workbench/context-web')

  assert.equal(byName['dsh-test-drive'].enabled, true)
  assert.equal(byName['dsh-outline'].enabled, false) // 声明了 bundle 但未在 bundles → 停用态
  assert.equal(byName['dsh-outline'].loadKind, 'bundle')
  assert.equal(byName['dsh-trading-toolkit'].loadKind, 'patch')
  assert.equal(byName['dsh-trading-toolkit'].enabled, true)
  assert.equal(byName['session-query-sqlite'].isCore, true)
  assert.equal(byName['session-query-sqlite'].enabled, true)
  assert.equal(byName['terminal'].isCore, true)
})

test('toPath 把 file:/// URL 转成本地路径', () => {
  assert.equal(toPath('file:///D:/x/y'), 'D:\\x\\y')
  assert.equal(toPath('D:\\x\\y'), 'D:\\x\\y')
  assert.equal(toPath(null), '')
})

// ---- M2: patch-ops 纯函数 ----
test('scanPatchRows 解析 cordis.patch.yml 顶级与 insert 行', async () => {
  const yaml = `
# 注释
- id: session-query-sqlite
  config: { path: x }
- insert:
    - id: dsh-trading-toolkit
      name: dsh-trading-toolkit
    - id: terminal
      name: terminal
`
  const rows = scanPatchRows(yaml)
  const byId = Object.fromEntries(rows.map(r => [r.id, r]))
  assert.equal(byId['session-query-sqlite'].hasInsert, false)
  assert.equal(byId['dsh-trading-toolkit'].hasInsert, true)
  assert.equal(byId['terminal'].hasInsert, true)
})

test('applyToggle 对 bundle 插件停用=移出 bundles / 启用=加回', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pm-'))
  const packagePath = join(dir, 'package.json')
  await writeFile(packagePath, JSON.stringify({ name: 'dsh-profile-web', dependencies: { 'dsh-test-drive': '^0.3.0' }, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'dsh-test-drive'] } } }))
  const patchPath = join(dir, 'cordis.patch.yml')
  await writeFile(patchPath, '')

  // 停用 bundle 插件
  const info = (n) => ({ 'dsh-test-drive': { hasBundle: true } }[n] ?? { hasBundle: false })
  const off = await applyToggle(dir, { name: 'dsh-test-drive', enabled: false, backupDir: null, pkgInfo: info })
  assert.equal(off.ok, true)
  const pkg2 = JSON.parse(await readFile(packagePath, 'utf8'))
  assert.equal(pkg2.dsh.profile.bundles.includes('dsh-test-drive'), false)

  // 启用回来
  const on = await applyToggle(dir, { name: 'dsh-test-drive', enabled: true, backupDir: null, pkgInfo: info })
  assert.equal(on.ok, true)
  const pkg3 = JSON.parse(await readFile(packagePath, 'utf8'))
  assert.equal(pkg3.dsh.profile.bundles.includes('dsh-test-drive'), true)
})

test('applyToggle 对核心插件拒绝（锁死）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pm-core-'))
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'p', dependencies: {}, dsh: { profile: { bundles: [] } } }))
  await writeFile(join(dir, 'cordis.patch.yml'), '')
  const res = await applyToggle(dir, { name: 'terminal', enabled: false, backupDir: null })
  assert.equal(res.ok, false)
  assert.equal(res.reason, 'locked')
})

test('applyToggle 对 patch 挂载插件停用=加 disabled:true 行 / 启用=移除', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pm-patch-'))
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'p', dependencies: {}, dsh: { profile: { bundles: [] } } }))
  await writeFile(join(dir, 'cordis.patch.yml'), '- id: dsh-trading-toolkit\n  name: dsh-trading-toolkit\n')

  const off = await applyToggle(dir, { name: 'dsh-trading-toolkit', enabled: false, backupDir: null })
  assert.equal(off.ok, true)
  const patchText = await readFile(join(dir, 'cordis.patch.yml'), 'utf8')
  assert.match(patchText, /- id: dsh-trading-toolkit\s*\n\s*disabled: true/)

  const on = await applyToggle(dir, { name: 'dsh-trading-toolkit', enabled: true, backupDir: null })
  assert.equal(on.ok, true)
  const patchText2 = await readFile(join(dir, 'cordis.patch.yml'), 'utf8')
  assert.doesNotMatch(patchText2, /disabled: true/)
})
