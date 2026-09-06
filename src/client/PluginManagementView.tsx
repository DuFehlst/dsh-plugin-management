import { useEffect, useState } from 'react'

interface Item {
  name: string
  version: string
  description: string
  category: string
  enabled: boolean
  loadKind: string
  isCore: boolean
  spec: string | null
}

const CAT_LABEL: Record<string, string> = {
  memory: '记忆与工作流',
  visual: '会话结构',
  files: '文件与工作区',
  dev: '开发与工程',
  quant: '量化数据',
  ecosystem: '生态与通知',
  skill: '外部技能',
  other: '其他',
}

interface ReviewState {
  periodDays: number
  lastReviewAt: string | null
  daysSince: number | null
  due: boolean
  candidates: string[]
}

function fetchInventory(): Promise<Item[]> {
  return fetch('/plugin-management/api/inventory')
    .then(r => r.json())
    .then(d => d.items ?? [])
}

function fetchReview(): Promise<ReviewState> {
  return fetch('/plugin-management/api/review').then(r => r.json())
}

export function PluginManagementView({ close }: { close?: () => void }) {
  const [items, setItems] = useState<Item[]>([])
  const [review, setReview] = useState<ReviewState | null>(null)
  const [loading, setLoading] = useState<'loading' | 'ready' | 'error'>('loading')
  const [msg, setMsg] = useState('')

  const reload = () => {
    setLoading('loading')
    fetchInventory()
      .then(its => { setItems(its); setLoading('ready') })
      .catch(() => setLoading('error'))
  }

  useEffect(() => {
    reload()
    fetchReview().then(setReview).catch(() => {})
  }, [])

  const markReviewed = async () => {
    try {
      await fetch('/plugin-management/api/review', { method: 'POST' })
      const d = await fetchReview()
      setReview(d)
      setMsg('已记录回顾，14 天后到期再提醒。')
    } catch (e) {
      setMsg(`回顾确认失败：${String(e)}`)
    }
  }

  const toggle = async (name: string, enabled: boolean) => {
    try {
      const r = await fetch('/plugin-management/api/toggle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, enabled }),
      })
      const d = await r.json()
      if (!d.ok) {
        setMsg(d.reason === 'locked' ? '核心/基础插件不可停用' : `变更失败：${d.reason ?? 'unknown'}`)
        return
      }
      setMsg(`已${enabled ? '启用' : '停用'} ${name} —— 需重启 dsh web 生效；变更已备份。`)
      reload()
    } catch (e) {
      setMsg(`请求失败：${String(e)}`)
    }
  }

  if (loading === 'loading') return <div style={{ padding: 16 }}>加载中…</div>
  if (loading === 'error') return <div style={{ padding: 16 }}>加载失败 <button onClick={reload}>重试</button></div>

  const groups = Object.entries(items.reduce<Record<string, Item[]>>((acc, it) => {
    (acc[it.category] ??= []).push(it)
    return acc
  }, {}))

  return (
    <div style={{ padding: 16 }}>
      <h3>插件管理 · {items.length} 个插件</h3>
      {msg && <div style={{ color: '#b45309', marginBottom: 8 }}>{msg}</div>}
      {review?.due && (
        <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
          <div style={{ fontWeight: 600 }}>按需插件停用回顾提醒</div>
          <div style={{ fontSize: 12, color: '#6b7280', margin: '4px 0' }}>
            {review.daysSince == null ? '尚未做过回顾。' : `已 ${review.daysSince} 天未回顾（周期 ${review.periodDays} 天）。`}
            请逐项确认以下插件停用 / 保留：{review.candidates.join(' / ')}
          </div>
          <button onClick={markReviewed} style={{ marginTop: 4 }}>已回顾（下次到期再提醒）</button>
        </div>
      )}
      {review && !review.due && (
        <div style={{ color: 'rgba(0,0,0,.35)', fontSize: 12, marginBottom: 8 }}>
          按需插件回顾：{review.daysSince ?? 0} 天前已做，到期后会再提醒。
        </div>
      )}
      {groups.map(([cat, list]) => (
        <div key={cat} style={{ marginBottom: 20 }}>
          <h4 style={{ margin: '8px 0' }}>{CAT_LABEL[cat] ?? cat}</h4>
          {list.map(it => (
            <div key={it.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 8px', borderBottom: '1px solid #eee' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>
                  {it.name} <span style={{ color: 'rgba(0,0,0,.35)', fontSize: 11 }}>{it.loadKind}</span>
                  {it.isCore && <span style={{ color: '#b45309', fontSize: 12 }}>核心</span>}
                </div>
                <div style={{ color: '#6b7280', fontSize: 12 }}>{it.description || it.spec || ''}</div>
              </div>
              <button
                disabled={it.isCore}
                onClick={() => toggle(it.name, !it.enabled)}
                style={{ cursor: it.isCore ? 'not-allowed' : 'pointer' }}
              >
                {it.enabled ? '停用' : '启用'}
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
