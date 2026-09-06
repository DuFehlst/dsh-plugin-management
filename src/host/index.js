import { readFile, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildInventory } from './inventory.js'
import { applyToggle, scanPatchRows } from './patch-ops.js'
import { buildReviewState, readReviewState, writeReviewState } from './review.js'

export const name = 'dsh-plugin-management'
export const inject = ['webServer']

// ctx.baseUrl 可能是 file:/// URL 或路径，统一转成本地文件路径
export function toPath(u) {
  if (u == null) return ''
  const s = String(u)
  if (s.startsWith('file:')) {
    try { return fileURLToPath(s) } catch { return s.replace(/^file:\/\/\/?/, '') }
  }
  return s
}

const MAX_BODY_BYTES = 64 * 1024

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

async function readJsonBody(req) {
  const chunks = []
  let length = 0
  for await (const chunk of req) {
    length += chunk.length
    if (length > MAX_BODY_BYTES) throw new Error('body too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

// 读取某包在 profile node_modules 下的版本/描述/bundle 声明；未安装返回空
function pkgInfoFactory(profileDir) {
  return (name) => {
    try {
      const p = join(profileDir, 'node_modules', ...name.split('/'), 'package.json')
      const j = JSON.parse(readFileSync(p, 'utf8'))
      return {
        version: j.version ?? '',
        description: j.description ?? '',
        hasBundle: !!(j.dsh?.bundle?.patch),
      }
    } catch {
      return { version: '', description: '', hasBundle: false }
    }
  }
}

export function apply(ctx, config) {
  const profileDir = toPath(ctx.baseUrl)
  const pkgInfo = pkgInfoFactory(profileDir)
  const backupDir = config?.backupDir ?? join(process.env.DSH_HOME ?? dirname(profileDir), 'dsh-plugin-management', 'backups')
  const reviewFile = config?.reviewFile ?? join(process.env.DSH_HOME ?? dirname(profileDir), 'dsh-plugin-management', 'review-state.json')

  const api = async (req, res) => {
    try {
      const path = new URL(req.url ?? '/', 'http://x').pathname

      if (path === '/plugin-management/api/inventory' && req.method === 'GET') {
        const pkg = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))
        let patch = ''
        try { patch = readFileSync(join(profileDir, 'cordis.patch.yml'), 'utf8') } catch { patch = '' }
        const rows = scanPatchRows(patch)
        const items = buildInventory({ packageJson: pkg, patchRows: rows, pkgInfo })
        return sendJson(res, 200, { items })
      }

      if (path === '/plugin-management/api/toggle' && req.method === 'POST') {
        const body = JSON.parse(await readJsonBody(req))
        const result = await applyToggle(profileDir, {
          name: body.name,
          enabled: body.enabled,
          backupDir,
          pkgInfo,
        })
        return sendJson(res, 200, { ...result, restartRequired: true })
      }

      if (path === '/plugin-management/api/review' && req.method === 'GET') {
        const state = await readReviewState(reviewFile)
        return sendJson(res, 200, buildReviewState({ lastReviewAt: state?.lastReviewAt ?? null }))
      }

      if (path === '/plugin-management/api/review' && req.method === 'POST') {
        const lastReviewAt = new Date().toISOString()
        await writeReviewState(reviewFile, lastReviewAt)
        return sendJson(res, 200, buildReviewState({ lastReviewAt }))
      }

      return sendJson(res, 404, { error: 'not-found' })
    } catch (error) {
      return sendJson(res, 500, { error: String(error?.message ?? error) })
    }
  }

  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/plugin-management/api', handler: api }), 'pm-api')
}
