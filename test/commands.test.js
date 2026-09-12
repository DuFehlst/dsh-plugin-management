// /plugin 命令（TodoSync #1，2026-09-12）：解析 / 清单渲染 / 启停执行 / 注册形状
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  executePluginCommand, parsePluginCommand, registerPluginCommand, renderList,
} from '../src/host/commands.js'

const pkgInfo = (name) => ({ 'dsh-test-drive': { version: '0.3.11', description: '冒烟', hasBundle: true } }[name]
  ?? { version: '', description: '', hasBundle: false })

async function makeProfile(bundles = ['@deepseek-ai/dsh-base', 'dsh-test-drive'], patch = '') {
  const dir = await mkdtemp(join(tmpdir(), 'pm-cmd-'))
  await writeFile(join(dir, 'package.json'), JSON.stringify({
    name: 'dsh-profile-web',
    dependencies: { 'dsh-test-drive': '^0.3.11' },
    dsh: { profile: { bundles } },
  }, null, 2))
  await writeFile(join(dir, 'cordis.patch.yml'), patch)
  return dir
}

test('parsePluginCommand：空输入=清单，动词与参数切分正确，未知子命令报错', () => {
  assert.deepEqual(parsePluginCommand(''), { kind: 'list', category: null })
  assert.deepEqual(parsePluginCommand('list'), { kind: 'list', category: null })
  assert.deepEqual(parsePluginCommand('list files'), { kind: 'list', category: 'files' })
  assert.deepEqual(parsePluginCommand('enable dsh-test-drive'), { kind: 'enable', name: 'dsh-test-drive' })
  assert.deepEqual(parsePluginCommand('DISABLE  dsh-mcp-diff '), { kind: 'disable', name: 'dsh-mcp-diff' })
  assert.equal(parsePluginCommand('disable').kind, 'invalid')
  assert.equal(parsePluginCommand('bogus').kind, 'invalid')
  assert.equal(parsePluginCommand('help').kind, 'help')
})

test('renderList：分组 + 启用计数 + 核心锁死标注 + 分类过滤', () => {
  const items = [
    { name: 'dsh-test-drive', version: '0.3.11', category: 'dev', enabled: true, loadKind: 'bundle', isCore: false },
    { name: 'dsh-mcp-diff', version: '0.7.0', category: 'dev', enabled: false, loadKind: 'bundle', isCore: false },
    { name: 'dsh-simple-wiki-memory', version: '0.1.3', category: 'memory', enabled: true, loadKind: 'bundle', isCore: false },
    { name: 'session-query-sqlite', version: '', category: 'other', enabled: true, loadKind: 'patch', isCore: true },
  ]
  const all = renderList(items)
  assert.equal(all.kind, 'success')
  assert.match(all.text, /插件 4 个（启用 3 \/ 停用 1）/)
  assert.match(all.text, /\[dev\] 开发与工程/)
  assert.match(all.text, /● dsh-test-drive v0\.3\.11 — 启用（bundle）/)
  assert.match(all.text, /○ dsh-mcp-diff v0\.7\.0 — 停用（bundle）/)
  assert.match(all.text, /核心锁死/)

  const onlyMemory = renderList(items, 'memory')
  assert.match(onlyMemory.text, /dsh-simple-wiki-memory/)
  assert.doesNotMatch(onlyMemory.text, /dsh-mcp-diff/)

  const none = renderList(items, 'quant')
  assert.match(none.text, /没有匹配的插件/)
})

test('executePluginCommand：list 读盘产出清单；unknown 给出可选名', async () => {
  const dir = await makeProfile()
  const list = await executePluginCommand({ rawInput: 'list' }, { profileDir: dir, backupDir: null, pkgInfo })
  assert.equal(list.kind, 'success')
  assert.match(list.text, /dsh-test-drive/)

  const missing = await executePluginCommand({ rawInput: 'disable nope' }, { profileDir: dir, backupDir: null, pkgInfo })
  assert.equal(missing.kind, 'error')
  assert.match(missing.text, /没有名为 nope 的插件/)
})

test('executePluginCommand：disable/enable 真的改 profile，并提示重启', async () => {
  const dir = await makeProfile()
  const off = await executePluginCommand({ rawInput: 'disable dsh-test-drive' }, { profileDir: dir, backupDir: null, pkgInfo })
  assert.equal(off.kind, 'success')
  assert.match(off.text, /已停用 dsh-test-drive/)
  assert.match(off.text, /重启 dsh web/)
  const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
  assert.equal(pkg.dsh.profile.bundles.includes('dsh-test-drive'), false)

  const again = await executePluginCommand({ rawInput: 'disable dsh-test-drive' }, { profileDir: dir, backupDir: null, pkgInfo })
  assert.match(again.text, /已经是停用状态/)

  const on = await executePluginCommand({ rawInput: 'enable dsh-test-drive' }, { profileDir: dir, backupDir: null, pkgInfo })
  assert.equal(on.kind, 'success')
  const pkg2 = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
  assert.equal(pkg2.dsh.profile.bundles.includes('dsh-test-drive'), true)
})

test('executePluginCommand：核心锁死 + 未知输入报 usage', async () => {
  const dir = await makeProfile()
  const locked = await executePluginCommand({ rawInput: 'disable @deepseek-ai/dsh-base' }, { profileDir: dir, backupDir: null, pkgInfo })
  assert.equal(locked.kind, 'error')
  assert.match(locked.text, /锁死/)

  const bad = await executePluginCommand({ rawInput: 'nonsense' }, { profileDir: dir, backupDir: null, pkgInfo })
  assert.equal(bad.kind, 'error')
  assert.match(bad.text, /用法/)

  const help = await executePluginCommand({ rawInput: 'help' }, { profileDir: dir, backupDir: null, pkgInfo })
  assert.equal(help.kind, 'success')
  assert.match(help.text, /用法/)
})

test('registerPluginCommand 注册名为 plugin 的命令，handler 可执行', async () => {
  const dir = await makeProfile()
  const registered = []
  const ctx = { commands: { register: (spec) => registered.push(spec) } }
  registerPluginCommand(ctx, { profileDir: dir, backupDir: null, pkgInfo })
  assert.equal(registered.length, 1)
  assert.equal(registered[0].name, 'plugin')
  assert.match(registered[0].input.hint, /enable/)
  const out = await registered[0].handler({ rawInput: 'list' })
  assert.equal(out.kind, 'success')
  assert.match(out.text, /dsh-test-drive/)
})
