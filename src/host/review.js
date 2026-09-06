// review.js — 纯函数：按需插件停用回顾状态（周期提醒）
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export const REVIEW_PERIOD_DAYS = 14
export const REVIEW_CANDIDATES = [
  'dsh-multi-folder',
  'dsh-test-drive',
  'dsh-mcp-diff',
  'dshmarket',
  '@tt-a1i/archify-dsh',
]

// 由 lastReviewAt 计算回顾状态：due=从未回顾或超过周期
export function buildReviewState({ lastReviewAt, now = Date.now() }) {
  const periodDays = REVIEW_PERIOD_DAYS
  const candidates = REVIEW_CANDIDATES
  if (lastReviewAt == null) return { periodDays, lastReviewAt: null, daysSince: null, due: true, candidates }
  const daysSince = Math.max(0, Math.floor((now - Date.parse(lastReviewAt)) / 86400000))
  return { periodDays, lastReviewAt, daysSince, due: daysSince >= periodDays, candidates }
}

// 读状态文件；缺文件/损坏 → { lastReviewAt: null }
export async function readReviewState(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return { lastReviewAt: null }
  }
}

export async function writeReviewState(file, lastReviewAt) {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify({ lastReviewAt }, null, 2), 'utf8')
  return { lastReviewAt }
}
