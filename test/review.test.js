import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { buildReviewState, readReviewState, writeReviewState, REVIEW_CANDIDATES } from '../src/host/review.js'

const DAY = 24 * 60 * 60 * 1000

test('buildReviewState: 从未回顾 → due', () => {
  const s = buildReviewState({ lastReviewAt: null, now: Date.now() })
  assert.equal(s.periodDays, 14)
  assert.equal(s.due, true)
  assert.equal(s.daysSince, null)
  assert.deepEqual(s.candidates, ['dsh-multi-folder', 'dsh-test-drive', 'dsh-mcp-diff', 'dshmarket', '@tt-a1i/archify-dsh'])
})

test('buildReviewState: 周期内 → 不 due，daysSince 正确', () => {
  const now = 1_800_000_000_000
  const s = buildReviewState({ lastReviewAt: new Date(now - 5 * DAY).toISOString(), now })
  assert.equal(s.due, false)
  assert.equal(s.daysSince, 5)
})

test('buildReviewState: 达到/超过 14 天周期 → due', () => {
  const now = 1_800_000_000_000
  assert.equal(buildReviewState({ lastReviewAt: new Date(now - 14 * DAY).toISOString(), now }).due, true)
  const s30 = buildReviewState({ lastReviewAt: new Date(now - 30 * DAY).toISOString(), now })
  assert.equal(s30.due, true)
  assert.equal(s30.daysSince, 30)
})

test('readReviewState / writeReviewState 文件往返（缺文件 → lastReviewAt=null）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pm-review-'))
  const file = join(dir, 'review-state.json')
  const initial = await readReviewState(file)
  assert.equal(initial.lastReviewAt, null)
  const at = new Date().toISOString()
  await writeReviewState(file, at)
  const after = await readReviewState(file)
  assert.equal(after.lastReviewAt, at)
  await rm(dir, { recursive: true, force: true })
})

test('REVIEW_CANDIDATES 恰为 5 个按需插件', () => {
  assert.equal(REVIEW_CANDIDATES.length, 5)
})
