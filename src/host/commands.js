// commands.js — `/plugin` 斜杠命令：list / enable / disable
//
// 2026-09-12（TodoSync #1）：命令注册 API 就在 `@deepseek-ai/dsh-commands`
// （随 dsh-base 加载，服务名 `commands`，参考实现 `dsh-command-goal`）。
// 命令体直接复用本插件的 applyToggle（与设置面板同一条写侧安全链），
// 不重复实现启停逻辑，也不经过 HTTP。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildInventory, isCore, CATEGORIES } from './inventory.js'
import { applyToggle, scanPatchRows } from './patch-ops.js'

export const USAGE = '用法：/plugin [list [分类] | enable <插件名> | disable <插件名>]'

const CATEGORY_LABEL = {
  memory: '记忆与工作流', visual: '会话结构', files: '文件与工作区', dev: '开发与工程',
  quant: '量化数据', ecosystem: '生态与通知', skill: '外部技能', other: '其他',
}

/** 只解析 `/plugin` 自己的文法；其余输入一律按未知子命令处理。 */
export function parsePluginCommand(rawInput) {
  const input = String(rawInput ?? '').trim()
  if (input === '') return { kind: 'list', category: null }
  const parts = input.split(/\s+/)
  const verb = parts[0].toLowerCase()
  const arg = parts.slice(1).join(' ').trim()
  if (verb === 'list' || verb === 'ls') return { kind: 'list', category: arg === '' ? null : arg }
  if (verb === 'enable' || verb === 'disable') {
    if (arg === '') return { kind: 'invalid', reason: `/${verb} 需要一个插件名。${USAGE}` }
    return { kind: verb, name: arg }
  }
  if (verb === 'help') return { kind: 'help' }
  return { kind: 'invalid', reason: `未知子命令 ${verb}。${USAGE}` }
}

/** 读盘 → 分类清单（与设置面板同一个 buildInventory）。 */
export function readInventory(profileDir, pkgInfo) {
  const pkg = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))
  let patch = ''
  try { patch = readFileSync(join(profileDir, 'cordis.patch.yml'), 'utf8') } catch { patch = '' }
  return buildInventory({ packageJson: pkg, patchRows: scanPatchRows(patch), pkgInfo })
}

function matchesCategory(item, category) {
  if (category === null) return true
  const key = category.toLowerCase()
  return item.category.toLowerCase() === key || (CATEGORY_LABEL[item.category] ?? '').includes(category)
}

/** 人类可读清单：按分类分组，核心单列且标注锁死。 */
export function renderList(items, category = null) {
  const visible = items.filter(item => matchesCategory(item, category))
  if (visible.length === 0) {
    const known = Object.entries(CATEGORY_LABEL).map(([k, v]) => `${k}(${v})`).join('、')
    return { kind: 'success', text: `没有匹配的插件。可用分类：${known}` }
  }
  const enabled = visible.filter(i => i.enabled).length
  const lines = [`插件 ${visible.length} 个（启用 ${enabled} / 停用 ${visible.length - enabled}）`]
  for (const [key, label] of Object.entries(CATEGORY_LABEL)) {
    const group = visible.filter(i => i.category === key)
    if (group.length === 0) continue
    lines.push('', `[${key}] ${label}`)
    for (const item of group.sort((a, b) => a.name.localeCompare(b.name))) {
      const state = item.enabled ? '启用' : '停用'
      const lock = item.isCore ? ' ·核心锁死' : ''
      const version = item.version === '' ? '' : ` v${item.version}`
      lines.push(`  ${item.enabled ? '●' : '○'} ${item.name}${version} — ${state}（${item.loadKind}）${lock}`)
    }
  }
  lines.push('', '启停：/plugin enable <插件名> · /plugin disable <插件名>（核心不可停用；改完需重启 dsh web）')
  return { kind: 'success', text: lines.join('\n') }
}

const FAIL_TEXT = {
  locked: '这是核心/基础能力，已锁死不可停用。',
  'no-profile': '读不到 profile 的 package.json，未做任何改动。',
  'unknown-loadkind': '无法判断该插件的加载形态，未做任何改动。',
  'not-found-patch-row': '在 cordis.patch.yml 里找不到该插件行，未做任何改动。',
  'validate-failed': '改动未通过写前校验，profile 未被改动。',
  'verify-failed': '写后复核不通过，已回滚到改动前的 profile。',
  'write-failed': '写盘失败，profile 保持原样。',
}

export function describeFailure(result) {
  const base = FAIL_TEXT[result?.reason] ?? `变更失败：${result?.reason ?? 'unknown'}`
  if (result?.reason === 'write-failed' && result?.rolledBack === false) {
    return `${base}（回滚未成功，请用 backups 目录手动恢复）`
  }
  return base
}

/** 执行一条 `/plugin`：返回 dsh-commands 约定的 {kind, text}。 */
export async function executePluginCommand(invocation, { profileDir, backupDir, pkgInfo, io } = {}) {
  const command = parsePluginCommand(invocation?.rawInput)
  if (command.kind === 'help' || command.kind === 'invalid') {
    return { kind: command.kind === 'help' ? 'success' : 'error', text: command.reason ?? USAGE }
  }
  let items
  try {
    items = readInventory(profileDir, pkgInfo)
  } catch (error) {
    return { kind: 'error', text: `读不到 profile 清单：${String(error?.message ?? error)}` }
  }
  if (command.kind === 'list') return renderList(items, command.category)

  const item = items.find(i => i.name === command.name)
  if (item === undefined) {
    const names = items.map(i => i.name).join('、')
    return { kind: 'error', text: `没有名为 ${command.name} 的插件。现有：${names}` }
  }
  if (isCore(command.name)) return { kind: 'error', text: FAIL_TEXT.locked }

  const enabled = command.kind === 'enable'
  const result = await applyToggle(profileDir, { name: command.name, enabled, backupDir, pkgInfo, io })
  if (!result.ok) return { kind: 'error', text: describeFailure(result) }
  if (result.changed === false) {
    return { kind: 'success', text: `${command.name} 已经是${enabled ? '启用' : '停用'}状态，无需改动。` }
  }
  return {
    kind: 'success',
    text: `已${enabled ? '启用' : '停用'} ${command.name}（${result.loadKind}）。需重启 dsh web 生效；变更前已备份到 ${backupDir ?? 'profile 同级 backups'}。`,
  }
}

/** 注册到 ctx.commands（调用方保证 commands 服务存在）。 */
export function registerPluginCommand(ctx, options) {
  ctx.commands.register({
    name: 'plugin',
    description: '列出/启停 DSH 插件（list | enable | disable）',
    input: { hint: '[list [分类] | enable <插件名> | disable <插件名>]' },
    handler: invocation => executePluginCommand(invocation, options),
  })
}

export { CATEGORY_LABEL, CATEGORIES }
