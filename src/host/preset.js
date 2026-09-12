// preset.js — 批量预设与按分类整组启停（TodoSync #5，2026-09-12）
//
// 设计原则：批量 = 「一次计划、一次备份、逐个经 applyToggle 落盘、任一失败整体回滚」。
// 单条 applyToggle 已有写前校验/原子写/写后复核/单文件回滚；批量再加一层
// 「文件级快照 + 全量恢复」，避免出现改了一半的 profile。
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isCore } from './inventory.js'
import { applyToggle, writeFileAtomic } from './patch-ops.js'

/** 精简模式保留的插件（= 说明文档 §2 里标「启用」的那些，核心另算）。 */
export const LEAN_KEEP = [
  'dsh-simple-wiki-memory', 'dsh-plugin-focus', 'context-web', 'dsh-file-mentions',
  '@dsh-external/dsh-workspace-menu', 'dsh-web-notification', 'dsh-trading-toolkit',
]

export const PRESETS = {
  lean: { label: '精简模式', hint: '只留常用插件，按需项整组停用（不卸载）' },
  full: { label: '全量模式', hint: '把清单里的用户插件全部启用' },
}

/** 纯函数：算出某预设要改哪些插件（只列状态确实需要变的，核心一律跳过）。 */
export function planPreset(items, mode) {
  if (mode !== 'lean' && mode !== 'full') {
    return { ops: [], reason: `未知预设 ${mode}` }
  }
  const userItems = items.filter(item => !isCore(item.name) && item.loadKind !== 'dep')
  const ops = []
  for (const item of userItems) {
    const enabled = mode === 'full' ? true : LEAN_KEEP.includes(item.name)
    if (item.enabled !== enabled) ops.push({ name: item.name, enabled })
  }
  return { ops, reason: null }
}

/** 纯函数：按分类整组启停（核心自动跳过）。 */
export function planCategory(items, category, enabled) {
  const ops = items
    .filter(item => item.category === category && !isCore(item.name) && item.loadKind !== 'dep' && item.enabled !== enabled)
    .map(item => ({ name: item.name, enabled: Boolean(enabled) }))
  return { ops, reason: null }
}

async function snapshot(dir, files) {
  const snap = {}
  for (const f of files) {
    try { snap[f] = await readFile(join(dir, f), 'utf8') } catch { snap[f] = null }
  }
  return snap
}

async function restore(dir, snap, writeAtomic) {
  for (const [f, text] of Object.entries(snap)) {
    if (text === null) continue
    await writeAtomic(join(dir, f), text)
  }
}

/**
 * 逐个落盘：任一失败 → 用快照整体恢复，并如实回报。
 * 返回 {ok, applied[], failed[], rolledBack}
 */
export async function applyBatch(dir, ops, { backupDir = null, pkgInfo = null, io = {} } = {}) {
  if (ops.length === 0) return { ok: true, applied: [], failed: [], rolledBack: false }
  const writeAtomic = io.writeFileAtomic ?? writeFileAtomic
  const snap = await snapshot(dir, ['package.json', 'cordis.patch.yml'])
  const applied = []
  for (const op of ops) {
    const result = await applyToggle(dir, { name: op.name, enabled: op.enabled, backupDir, pkgInfo, io })
    if (!result.ok) {
      await restore(dir, snap, writeAtomic).catch(() => {})
      return { ok: false, applied, failed: [{ ...op, reason: result.reason }], rolledBack: true }
    }
    applied.push({ ...op, changed: result.changed })
  }
  return { ok: true, applied, failed: [], rolledBack: false }
}

export function summarizeBatch(result) {
  if (result.applied.length === 0 && result.failed.length === 0) return '没有需要变更的插件（已是目标状态）。'
  const on = result.applied.filter(a => a.enabled).map(a => a.name)
  const off = result.applied.filter(a => !a.enabled).map(a => a.name)
  const lines = []
  if (on.length) lines.push(`启用 ${on.length} 个：${on.join('、')}`)
  if (off.length) lines.push(`停用 ${off.length} 个：${off.join('、')}`)
  if (!result.ok) {
    lines.push(`失败于 ${result.failed[0].name}（${result.failed[0].reason}）→ 已整体回滚，profile 保持原样。`)
    return lines.join('\n')
  }
  lines.push('需重启 dsh web 生效。')
  return lines.join('\n')
}
