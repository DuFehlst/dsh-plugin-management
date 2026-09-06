// patch-ops.js — 纯函数：bundle 类增删 dsh.profile.bundles；patch 类增删 disabled:true 行
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isCore } from './inventory.js'

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 解析 cordis.patch.yml：收集所有 `- id: <name>` 行及其是否在 insert 列表、是否 disabled
export function scanPatchRows(patchText) {
  const rows = []
  let inInsert = false
  const lines = patchText.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*-\s*insert:/.test(line)) inInsert = true
    const m = /^\s*-\s*id:\s*(\S+)/.exec(line)
    if (m) {
      let disabled = false
      for (let j = i + 1; j < lines.length && j <= i + 8; j++) {
        if (/^\s*disabled:\s*true/.test(lines[j])) { disabled = true; break }
        if (/^\s*-\s/.test(lines[j])) break
      }
      rows.push({ id: m[1], line: i, hasInsert: inInsert, disabled })
    }
  }
  return rows
}

// 在某 `- id: <name>` 行下增/删 disabled:true 子行；返回 {text, changed, found}
function setPatchDisabled(patchText, name, disabled) {
  const lines = patchText.split(/\r?\n/)
  const re = new RegExp(`^\\s*-\\s*id:\\s*${escapeRegex(name)}\\s*$`)
  const idIdx = lines.findIndex(l => re.test(l))
  if (idIdx < 0) return { text: patchText, changed: false, found: false }
  const idIndent = (lines[idIdx].match(/^\s*/) || [''])[0].length
  let disIdx = -1
  for (let j = idIdx + 1; j < lines.length; j++) {
    const l = lines[j]
    if (/^\s*disabled:\s*true/.test(l)) { disIdx = j; break }
    if (/^\s*-\s/.test(l)) break
    if (l.trim() === '') break
  }
  if (disabled) {
    if (disIdx >= 0) return { text: patchText, changed: false, found: true }
    const indent = ' '.repeat(idIndent + 2)
    lines.splice(idIdx + 1, 0, `${indent}disabled: true`)
    return { text: lines.join('\n'), changed: true, found: true }
  }
  if (disIdx < 0) return { text: patchText, changed: false, found: true }
  lines.splice(disIdx, 1)
  return { text: lines.join('\n'), changed: true, found: true }
}

async function validateBackup(dir, backupDir) {
  if (!backupDir) return
  await mkdir(backupDir, { recursive: true })
  for (const f of ['package.json', 'cordis.patch.yml']) {
    await copyFile(join(dir, f), join(backupDir, f)).catch(() => {})
  }
}

export async function applyToggle(dir, { name, enabled, backupDir = null, pkgInfo = null } = {}) {
  if (isCore(name)) return { ok: false, reason: 'locked', name }

  const packagePath = join(dir, 'package.json')
  const patchPath = join(dir, 'cordis.patch.yml')
  let pkg
  try { pkg = JSON.parse(await readFile(packagePath, 'utf8')) } catch { return { ok: false, reason: 'no-profile' } }
  let patch = ''
  try { patch = await readFile(patchPath, 'utf8') } catch { patch = '' }

  const bundles = pkg.dsh?.profile?.bundles ?? []
  const hasBundleDecl = pkgInfo?.(name)?.hasBundle === true
  const row = scanPatchRows(patch).find(r => r.id === name)
  const inBundle = bundles.includes(name)
  const loadKind = (inBundle || hasBundleDecl) ? 'bundle' : (row ? 'patch' : 'unknown')
  if (loadKind === 'unknown') return { ok: false, reason: 'unknown-loadkind', name }

  await validateBackup(dir, backupDir)

  if (loadKind === 'bundle') {
    const next = new Set(bundles)
    if (enabled) next.add(name)
    else next.delete(name)
    pkg.dsh.profile.bundles = [...next]
    await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
    return { ok: true, loadKind, name, enabled, changed: enabled !== inBundle }
  }

  const setRes = setPatchDisabled(patch, name, !enabled)
  if (!setRes.found) return { ok: false, reason: 'not-found-patch-row', name }
  if (setRes.changed) await writeFile(patchPath, setRes.text, 'utf8')
  return { ok: true, loadKind, name, enabled, changed: setRes.changed }
}
