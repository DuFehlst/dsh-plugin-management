// patch-ops.js — 纯函数：bundle 类增删 dsh.profile.bundles；patch 类增删/改写 disabled 行
//
// 2026-09-12（#3 硬化）：这是唯一能改坏用户 profile（package.json / cordis.patch.yml）、
// 导致 `dsh web` 起不来的路径，故补齐四件事：
//   1. 引号 id 归一化 + 同一 id 多命中（多个 insert 块）+ 不产生重复 disabled 键；
//   2. 写前校验（JSON 可解析 / bundles 合法 / 无 tab 缩进 / 目标效果可复核）；
//   3. 原子写（同目录临时文件 + rename），不留半写状态；
//   4. 写后读回复核，不符则回滚原文并报 verify-failed。
import { copyFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isCore } from './inventory.js'

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 去掉 YAML 里可能包裹 id 的成对引号
function normalizeScalar(raw) {
  const s = String(raw ?? '').trim()
  if (s.length >= 2 && ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"')))) {
    return s.slice(1, -1)
  }
  return s
}

function indentOf(line) {
  return (line.match(/^\s*/) || [''])[0].length
}

// id 行的子行区间 [start, end)：非空行且缩进 > idIndent；空行/注释行不终止映射
function childRange(lines, idIdx, idIndent) {
  let last = idIdx
  for (let j = idIdx + 1; j < lines.length; j++) {
    const l = lines[j]
    if (l.trim() === '') continue
    if (indentOf(l) <= idIndent) break
    last = j
  }
  return { start: idIdx + 1, end: last + 1 }
}

const ID_LINE_RE = /^\s*-\s*id:\s*([^\s#]+)/

// 解析 cordis.patch.yml：收集所有 `- id: <name>` 行及其是否在 insert 列表、是否 disabled
export function scanPatchRows(patchText) {
  const rows = []
  const lines = String(patchText ?? '').split(/\r?\n/)
  let inInsert = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*-\s*insert:/.test(line)) inInsert = true
    const m = ID_LINE_RE.exec(line)
    if (!m) continue
    const id = normalizeScalar(m[1])
    const idIndent = indentOf(line)
    const { start, end } = childRange(lines, i, idIndent)
    const keyIndent = start < end ? indentOf(lines[start]) : idIndent + 2
    let disabled = false
    for (let j = start; j < end; j++) {
      if (indentOf(lines[j]) !== keyIndent) continue
      const dm = /^\s*disabled:\s*([^\s#]+)/.exec(lines[j])
      if (dm) {
        disabled = /^true$/i.test(normalizeScalar(dm[1]))
        break
      }
    }
    rows.push({ id, line: i, hasInsert: inInsert, disabled })
  }
  return rows
}

// 在某 `- id: <name>` 行的子块里改写/增/删 disabled 键（已有 disabled: false 会被改写而非追加）；
// 同一 id 出现在多个块时全部命中。返回 {text, changed, found}
export function setPatchDisabled(patchText, name, disabled) {
  const src = String(patchText ?? '')
  const lines = src.split(/\r?\n/)
  const re = new RegExp(`^\\s*-\\s*id:\\s*['"]?${escapeRegex(name)}['"]?\\s*(?:#.*)?$`)
  const hits = []
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) hits.push(i)
  if (hits.length === 0) return { text: src, changed: false, found: false }

  let changed = false
  // 自下而上改：插入/删除只影响更大下标，而更大下标的命中已经处理完
  for (let k = hits.length - 1; k >= 0; k--) {
    const idIdx = hits[k]
    const idIndent = indentOf(lines[idIdx])
    const { start, end } = childRange(lines, idIdx, idIndent)
    const keyIndent = start < end ? indentOf(lines[start]) : idIndent + 2
    let disIdx = -1
    for (let j = start; j < end; j++) {
      if (indentOf(lines[j]) === keyIndent && /^\s*disabled:/.test(lines[j])) { disIdx = j; break }
    }
    if (disabled) {
      const line = `${' '.repeat(keyIndent)}disabled: true`
      if (disIdx >= 0) {
        if (lines[disIdx] !== line) { lines[disIdx] = line; changed = true }
      } else {
        lines.splice(idIdx + 1, 0, line)
        changed = true
      }
    } else if (disIdx >= 0) {
      lines.splice(disIdx, 1)
      changed = true
    }
  }
  return { text: lines.join('\n'), changed, found: true }
}

// 写前/写后复核对 patch 文本的结构校验
export function validatePatchText(text, { name, expectedDisabled } = {}) {
  const lines = String(text ?? '').split(/\r?\n/)
  if (lines.some(l => /^\s*\t/.test(l) || / +\t/.test(l))) return { ok: false, reason: 'patch-tab-indent' }
  if (name !== undefined) {
    const hits = scanPatchRows(text).filter(r => r.id === name)
    if (hits.length === 0) return { ok: false, reason: 'patch-row-missing' }
    if (expectedDisabled !== undefined && hits.some(h => h.disabled !== expectedDisabled)) {
      return { ok: false, reason: 'patch-effect-mismatch' }
    }
  }
  return { ok: true }
}

// 写前/写后复核对 profile package.json 的结构校验
export function validatePackageText(text) {
  let pkg
  try {
    pkg = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'package-json-parse' }
  }
  const bundles = pkg?.dsh?.profile?.bundles
  if (bundles !== undefined) {
    if (!Array.isArray(bundles) || bundles.some(b => typeof b !== 'string' || !b.trim())) {
      return { ok: false, reason: 'bundles-invalid' }
    }
    if (new Set(bundles).size !== bundles.length) return { ok: false, reason: 'bundles-duplicate' }
  }
  return { ok: true }
}

// 原子写：同目录临时文件 + rename，避免半写状态
export async function writeFileAtomic(path, text) {
  const tmp = `${path}.pm-tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
  try {
    await writeFile(tmp, text, 'utf8')
    await rename(tmp, path)
  } catch (error) {
    await unlink(tmp).catch(() => {})
    throw error
  }
}

async function validateBackup(dir, backupDir) {
  if (!backupDir) return
  await mkdir(backupDir, { recursive: true })
  for (const f of ['package.json', 'cordis.patch.yml']) {
    await copyFile(join(dir, f), join(backupDir, f)).catch(() => {})
  }
}

export async function applyToggle(dir, { name, enabled, backupDir = null, pkgInfo = null, io = {} } = {}) {
  if (isCore(name)) return { ok: false, reason: 'locked', name }

  const read = io.readFile ?? readFile
  const writeAtomic = io.writeFileAtomic ?? writeFileAtomic

  const packagePath = join(dir, 'package.json')
  const patchPath = join(dir, 'cordis.patch.yml')
  let pkgText
  let pkg
  try {
    pkgText = await read(packagePath, 'utf8')
    pkg = JSON.parse(pkgText)
  } catch {
    return { ok: false, reason: 'no-profile' }
  }
  let patchText = ''
  try { patchText = await read(patchPath, 'utf8') } catch { patchText = '' }

  const bundles = pkg.dsh?.profile?.bundles ?? []
  const hasBundleDecl = pkgInfo?.(name)?.hasBundle === true
  const row = scanPatchRows(patchText).find(r => r.id === name)
  const inBundle = bundles.includes(name)
  const loadKind = (inBundle || hasBundleDecl) ? 'bundle' : (row ? 'patch' : 'unknown')
  if (loadKind === 'unknown') return { ok: false, reason: 'unknown-loadkind', name }

  let targetPath
  let originalText
  let nextText
  let changed
  let verify

  if (loadKind === 'bundle') {
    const next = new Set(bundles)
    if (enabled) next.add(name)
    else next.delete(name)
    pkg.dsh.profile.bundles = [...next]
    nextText = `${JSON.stringify(pkg, null, 2)}\n`
    changed = enabled !== inBundle
    targetPath = packagePath
    originalText = pkgText
    verify = (text) => {
      const v = validatePackageText(text)
      if (!v.ok) return v
      const b = JSON.parse(text)?.dsh?.profile?.bundles ?? []
      return b.includes(name) === enabled ? { ok: true } : { ok: false, reason: 'bundle-effect-mismatch' }
    }
  } else {
    const setRes = setPatchDisabled(patchText, name, !enabled)
    if (!setRes.found) return { ok: false, reason: 'not-found-patch-row', name }
    nextText = setRes.text
    changed = setRes.changed
    targetPath = patchPath
    originalText = patchText
    verify = (text) => validatePatchText(text, { name, expectedDisabled: !enabled })
  }

  await validateBackup(dir, backupDir)

  // 写前校验：不合格就不落盘（宁可不动，也不写坏）
  const pre = verify(nextText)
  if (!pre.ok) return { ok: false, reason: 'validate-failed', detail: pre.reason, name, loadKind }

  if (changed) {
    try {
      await writeAtomic(targetPath, nextText)
      // 写后复核：读回磁盘再验一次效果
      const after = await read(targetPath, 'utf8')
      const post = verify(after)
      if (!post.ok) {
        const err = new Error(post.reason)
        err.verifyFailed = true
        throw err
      }
    } catch (error) {
      // 回滚：把原文原子写回（仅当确实写过）
      let rolledBack = false
      if (changed) {
        try { await writeAtomic(targetPath, originalText); rolledBack = true } catch { rolledBack = false }
      }
      return {
        ok: false,
        reason: error?.verifyFailed ? 'verify-failed' : 'write-failed',
        detail: String(error?.message ?? error),
        name,
        loadKind,
        rolledBack,
      }
    }
  }

  return { ok: true, loadKind, name, enabled, changed }
}
