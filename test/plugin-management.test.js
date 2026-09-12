import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { buildInventory, classify, isCore } from '../src/host/inventory.js'
import { applyToggle, scanPatchRows, setPatchDisabled, validatePatchText } from '../src/host/patch-ops.js'
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

// ---- #3（2026-09-12）：破坏性用例 + 回滚/原子写 ----

test('scanPatchRows 归一化引号 id（单/双引号）', () => {
  const rows = scanPatchRows("- id: 'dsh-trading-toolkit'\n  name: x\n- id: \"other\"\n")
  assert.deepEqual(rows.map(r => r.id), ['dsh-trading-toolkit', 'other'])
})

test('setPatchDisabled 不产生重复 disabled 键（已有的 disabled: false 被改写而非追加）', () => {
  const src = '- id: dsh-trading-toolkit\n  name: dsh-trading-toolkit\n  disabled: false\n'
  const { text, found } = setPatchDisabled(src, 'dsh-trading-toolkit', true)
  assert.equal(found, true)
  assert.equal(text.match(/disabled:/g).length, 1)
  assert.match(text, /disabled: true/)
  assert.doesNotMatch(text, /disabled: false/)
})

test('setPatchDisabled 处理同一 id 出现在多个 insert 块（全部命中）', () => {
  const src = [
    '- insert:',
    '    - id: dsh-trading-toolkit',
    '      name: dsh-trading-toolkit',
    '- insert:',
    '    - id: dsh-trading-toolkit',
    '      name: dsh-trading-toolkit',
    '',
  ].join('\n')
  const { text } = setPatchDisabled(src, 'dsh-trading-toolkit', true)
  assert.equal(text.match(/disabled: true/g).length, 2)
  // 再启用 → 两处都清掉
  const back = setPatchDisabled(text, 'dsh-trading-toolkit', false)
  assert.equal(back.text.match(/disabled:/g), null)
})

test('validatePatchText 拒绝 tab 缩进与效果不符的补丁文本', () => {
  assert.equal(validatePatchText('- id: a\n\tname: a\n').ok, false)
  const good = '- id: a\n  name: a\n  disabled: true\n'
  assert.equal(validatePatchText(good, { name: 'a', expectedDisabled: true }).ok, true)
  assert.equal(validatePatchText(good, { name: 'a', expectedDisabled: false }).ok, false)
  assert.equal(validatePatchText('- id: b\n', { name: 'a' }).ok, false)
})

test('applyToggle：写后复核失败 → 回滚原文并报 verify-failed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pm-verify-'))
  const patchPath = join(dir, 'cordis.patch.yml')
  const src = '- id: dsh-trading-toolkit\n  name: dsh-trading-toolkit\n'
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'p', dependencies: {}, dsh: { profile: { bundles: [] } } }))
  await writeFile(patchPath, src)

  // 注入：写盘正常，但写后“读回复核”时拿到被改坏的内容（模拟落盘结果非法）
  const io = {
    writeFileAtomic: (p, t) => writeFile(p, t, 'utf8'),
    readFile: async (p, enc) => {
      const text = await readFile(p, enc)
      return text.includes('disabled: true') ? '\tbroken: [' : text
    },
  }
  const res = await applyToggle(dir, { name: 'dsh-trading-toolkit', enabled: false, backupDir: null, io })
  assert.equal(res.ok, false)
  assert.equal(res.reason, 'verify-failed')
  assert.equal(res.rolledBack, true)
  assert.equal(await readFile(patchPath, 'utf8'), src)
})

test('applyToggle：写盘抛错 → 原文不变并报 write-failed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pm-writefail-'))
  const patchPath = join(dir, 'cordis.patch.yml')
  const src = '- id: dsh-trading-toolkit\n  name: dsh-trading-toolkit\n'
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'p', dependencies: {}, dsh: { profile: { bundles: [] } } }))
  await writeFile(patchPath, src)

  const io = { writeFileAtomic: async () => { throw new Error('EACCES: 磁盘只读') } }
  const res = await applyToggle(dir, { name: 'dsh-trading-toolkit', enabled: false, backupDir: null, io })
  assert.equal(res.ok, false)
  assert.equal(res.reason, 'write-failed')
  assert.equal(await readFile(patchPath, 'utf8'), src)
})

test('applyToggle 默认走原子写：不留临时文件', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pm-atomic-'))
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'p', dependencies: {}, dsh: { profile: { bundles: [] } } }))
  await writeFile(join(dir, 'cordis.patch.yml'), '- id: dsh-trading-toolkit\n  name: dsh-trading-toolkit\n')
  const res = await applyToggle(dir, { name: 'dsh-trading-toolkit', enabled: false, backupDir: null })
  assert.equal(res.ok, true)
  const left = (await readdir(dir)).filter(f => f.includes('tmp'))
  assert.deepEqual(left, [])
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
