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

function fetchInventory(): Promise<Item[]> {
  return fetch('/plugin-management/api/inventory')
    .then(r => r.json())
    .then(d => d.items ?? [])
}

export function PluginManagementView({ close }: { close?: () => void }) {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState<'loading' | 'ready' | 'error'>('loading')
  const [msg, setMsg] = useState('')

  const reload = () => {
    setLoading('loading')
    fetchInventory()
      .then(its => { setItems(its); setLoading('ready') })
      .catch(() => setLoading('error'))
  }

  useEffect(() => { reload() }, [])

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
