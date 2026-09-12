// 批量预设 / 按分类整组启停（TodoSync #5，2026-09-12）
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { applyBatch, LEAN_KEEP, planCategory, planPreset, summarizeBatch } from '../src/host/preset.js'

const ITEMS = [
  { name: '@deepseek-ai/dsh-base', category: 'other', enabled: true, loadKind: 'bundle', isCore: true },
  { name: 'dsh-simple-wiki-memory', category: 'memory', enabled: true, loadKind: 'bundle', isCore: false },
  { name: 'dsh-plugin-focus', category: 'memory', enabled: true, loadKind: 'bundle', isCore: false },
  { name: 'context-web', category: 'visual', enabled: true, loadKind: 'bundle', isCore: false },
  { name: 'dsh-file-mentions', category: 'files', enabled: true, loadKind: 'bundle', isCore: false },
  { name: 'dsh-multi-folder', category: 'files', enabled: true, loadKind: 'bundle', isCore: false },
  { name: 'dsh-mcp-diff', category: 'dev', enabled: false, loadKind: 'bundle', isCore: false },
  { name: 'dshmarket', category: 'ecosystem', enabled: false, loadKind: 'bundle', isCore: false },
  { name: 'dsh-test-drive', category: 'dev', enabled: false, loadKind: 'bundle', isCore: false },
  { name: 'not-installed', category: 'other', enabled: false, loadKind: 'dep', isCore: false },
]

test('planPreset：精简=只留常用（按需项停用，核心与 dep 不参与）', () => {
  const { ops } = planPreset(ITEMS, 'lean')
  const byName = Object.fromEntries(ops.map(o => [o.name, o.enabled]))
  assert.equal(byName['dsh-multi-folder'], false)
  assert.equal(byName['dsh-mcp-diff'], undefined, '已是停用态不该出现在计划里')
  assert.equal(byName['dshmarket'], undefined)
  assert.equal(byName['@deepseek-ai/dsh-base'], undefined, '核心不参与')
  assert.equal(byName['not-installed'], undefined, 'dep 不参与')
  assert.equal(LEAN_KEEP.includes('dsh-plugin-focus'), true)
})

test('planPreset：全量=把所有用户插件启用；未知预设返回 reason', () => {
  const { ops } = planPreset(ITEMS, 'full')
  const names = ops.map(o => o.name)
  assert.deepEqual(names.sort(), ['dsh-mcp-diff', 'dsh-test-drive', 'dshmarket'].sort())
  assert.equal(ops.every(o => o.enabled === true), true)

  const bad = planPreset(ITEMS, 'unknown')
  assert.equal(bad.ops.length, 0)
  assert.match(bad.reason, /未知预设/)
})

test('planCategory：按分类整组启停，核心跳过，已同态不在计划内', () => {
  const off = planCategory(ITEMS, 'files', false)
  assert.deepEqual(off.ops.map(o => o.name).sort(), ['dsh-file-mentions', 'dsh-multi-folder'].sort())
  const on = planCategory(ITEMS, 'dev', true)
  assert.deepEqual(on.ops.map(o => o.name).sort(), ['dsh-mcp-diff', 'dsh-test-drive'].sort())
  const none = planCategory(ITEMS, 'ecosystem', false)
  assert.equal(none.ops.length, 0)
})

async function makeProfile(bundles) {
  const dir = await mkdtemp(join(tmpdir(), 'pm-preset-'))
  await writeFile(join(dir, 'package.json'), JSON.stringify({
    name: 'dsh-profile-web',
    dependencies: { 'dsh-test-drive': '^0.3.11', 'dsh-mcp-diff': '^0.7.0' },
    dsh: { profile: { bundles } },
  }, null, 2))
  await writeFile(join(dir, 'cordis.patch.yml'), '')
  return dir
}

test('applyBatch：多个变更逐个落盘', async () => {
  const dir = await makeProfile(['@deepseek-ai/dsh-base', 'dsh-test-drive', 'dsh-mcp-diff'])
  const pkgInfo = (n) => ({ hasBundle: n === 'dsh-test-drive' || n === 'dsh-mcp-diff' })
  const result = await applyBatch(dir, [
    { name: 'dsh-test-drive', enabled: false },
    { name: 'dsh-mcp-diff', enabled: false },
  ], { backupDir: null, pkgInfo })
  assert.equal(result.ok, true)
  assert.equal(result.applied.length, 2)
  const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
  assert.deepEqual(pkg.dsh.profile.bundles, ['@deepseek-ai/dsh-base'])
})

test('applyBatch：中途失败 → 整体回滚到批量前状态', async () => {
  const dir = await makeProfile(['@deepseek-ai/dsh-base', 'dsh-test-drive'])
  const pkgInfo = (n) => ({ hasBundle: n === 'dsh-test-drive' || n === 'dsh-mcp-diff' })
  const before = await readFile(join(dir, 'package.json'), 'utf8')
  // 第二条是核心 → applyToggle 拒绝 locked → 必须触发整体回滚
  const result = await applyBatch(dir, [
    { name: 'dsh-test-drive', enabled: false },
    { name: 'terminal', enabled: false },
  ], { backupDir: null, pkgInfo })
  assert.equal(result.ok, false)
  assert.equal(result.rolledBack, true)
  assert.equal(result.failed[0].name, 'terminal')
  assert.equal(result.applied.length, 1)
  assert.equal(await readFile(join(dir, 'package.json'), 'utf8'), before, '第一条的改动必须被撤销')
})

test('summarizeBatch：人话汇报（含失败回滚说明）', () => {
  const ok = summarizeBatch({ ok: true, applied: [{ name: 'a', enabled: false }, { name: 'b', enabled: true }], failed: [] })
  assert.match(ok, /启用 1 个：b/)
  assert.match(ok, /停用 1 个：a/)
  assert.match(ok, /重启 dsh web/)
  const fail = summarizeBatch({ ok: false, applied: [], failed: [{ name: 'x', reason: 'locked' }] })
  assert.match(fail, /失败于 x（locked）/)
  assert.match(fail, /整体回滚/)
  assert.match(summarizeBatch({ ok: true, applied: [], failed: [] }), /没有需要变更/)
})
