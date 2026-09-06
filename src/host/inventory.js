// inventory.js — 纯函数：把 profile 的 package.json + cordis.patch.yml 组装成分类插件清单
export const CORE_IDS = new Set([
  'session-query-sqlite', 'time-context', 'schedule', 'mcp-playwright', 'mcp-ashare',
  'terminal', 'terminal-bash', '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app',
])

export const CATEGORIES = {
  'dsh-simple-wiki-memory': 'memory', 'dsh-plugin-focus': 'memory',
  'context-web': 'visual',
  'dsh-plugin-workbench': 'files', 'dsh-open-in-app': 'files', 'dsh-file-mentions': 'files',
  'dsh-multi-folder': 'files', '@dsh-external/dsh-workspace-menu': 'files',
  'dsh-test-drive': 'dev', 'dsh-mcp-diff': 'dev',
  'dsh-trading-toolkit': 'quant',
  'dshmarket': 'ecosystem', 'dsh-web-notification': 'ecosystem',
  '@tt-a1i/archify-dsh': 'skill',
}

export function classify(name) {
  return CATEGORIES[name] ?? 'other'
}

export function isCore(name) {
  return CORE_IDS.has(name) || /^@deepseek-ai\//.test(name)
}

export function buildInventory({ packageJson, patchRows, pkgInfo }) {
  const deps = packageJson?.dependencies ?? {}
  const bundles = packageJson?.dsh?.profile?.bundles ?? []
  const patchById = new Map((patchRows ?? []).map(r => [r.id, r]))
  const names = new Set([...Object.keys(deps), ...bundles, ...patchById.keys()])

  const items = []
  for (const name of names) {
    const info = pkgInfo?.(name) ?? {}
    const inBundle = bundles.includes(name)
    const row = patchById.get(name)
    const loadKind = (inBundle || info.hasBundle) ? 'bundle' : (row ? 'patch' : 'dep')
    let enabled
    if (loadKind === 'bundle') enabled = inBundle
    else if (loadKind === 'patch') enabled = row ? !row.disabled : true
    else enabled = false
    items.push({
      name,
      version: info.version ?? '',
      description: info.description ?? '',
      category: classify(name),
      enabled,
      loadKind,
      isCore: isCore(name),
      spec: deps[name] ?? null,
    })
  }
  return items.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
}
