import { useEffect, useState } from 'react'
import { Activity, ChevronDown, ChevronUp, ExternalLink, Eye, EyeOff } from 'lucide-react'
import mermaid from 'mermaid'

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  flowchart: { curve: 'basis', useMaxWidth: false, padding: 14 },
  themeVariables: { fontFamily: 'inherit', fontSize: '13px' },
})

export default function TaskFlowPanel({ tasks = [], history = [], kpis = [], onUpdateTask }) {
  const [expanded, setExpanded] = useState(true)
  const [openDropdown, setOpenDropdown] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showHidden, setShowHidden] = useState(false)

  // 검색 등에 사용 (전체 task 풀: 이번 주 + 과거 history)
  const allTasks = (() => {
    const seen = new Set()
    return [...tasks, ...history.flatMap(w => w.items || [])].filter(t => {
      if (!t || seen.has(t.id)) return false
      seen.add(t.id)
      return true
    })
  })()

  // 다이어그램에는 진행 중인 task + (조상 체인: done이거나 history여도 재귀적으로 포함)
  // 숨김 처리된 task는 제외 (showHidden 토글로 편집 화면에서만 다시 표시 가능)
  const activeTasks = tasks.filter(t => t.status !== 'done' && !t.hiddenInFlow)
  const hiddenCount = tasks.filter(t => t.status !== 'done' && t.hiddenInFlow).length
  const displayIds = new Set(activeTasks.map(t => t.id))
  const extraParents = []
  const queue = [...activeTasks]
  while (queue.length > 0) {
    const t = queue.shift()
    ;(t.parentIds || []).forEach(pid => {
      if (displayIds.has(pid)) return
      const parent = allTasks.find(x => x.id === pid)
      if (!parent) return
      displayIds.add(pid)
      extraParents.push(parent)
      queue.push(parent)
    })
  }
  const displayTasks = [...activeTasks, ...extraParents]
  const sortedTasks = sortTasksByHierarchy(displayTasks)
  const chart = buildChart(sortedTasks)
  const hasRelations = sortedTasks.some(t =>
    (t.parentIds || []).length > 0 ||
    (t.siblingIds || []).length > 0 ||
    !!(t.kpi || t.impact)
  )

  function openFullscreen() {
    const html = buildFullHtml(chart)
    const win = window.open('', '_blank')
    if (!win) {
      alert('팝업이 차단되었습니다. 브라우저에서 팝업을 허용해주세요.')
      return
    }
    win.document.open()
    win.document.write(html)
    win.document.close()
  }

  function addParent(taskId, parentId) {
    if (!onUpdateTask) return
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    const current = task.parentIds || []
    if (current.includes(parentId)) return
    onUpdateTask(taskId, { parentIds: [...current, parentId] })
    setOpenDropdown(null)
    setSearchQuery('')
  }

  function removeParent(taskId, parentId) {
    if (!onUpdateTask) return
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    onUpdateTask(taskId, { parentIds: (task.parentIds || []).filter(id => id !== parentId) })
  }

  function addSibling(taskId, siblingId) {
    if (!onUpdateTask) return
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    const current = task.siblingIds || []
    if (current.includes(siblingId)) return
    onUpdateTask(taskId, { siblingIds: [...current, siblingId] })
    setOpenDropdown(null)
    setSearchQuery('')
  }

  function removeSibling(taskId, siblingId) {
    if (!onUpdateTask) return
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    onUpdateTask(taskId, { siblingIds: (task.siblingIds || []).filter(id => id !== siblingId) })
  }

  function setKpi(taskId, kpiLabel) {
    if (!onUpdateTask) return
    onUpdateTask(taskId, { kpi: kpiLabel })
  }

  function toggleHide(taskId) {
    if (!onUpdateTask) return
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    onUpdateTask(taskId, { hiddenInFlow: !task.hiddenInFlow })
  }

  function getAvailableParents(taskId) {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return []
    const oneMonthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    const search = searchQuery.trim().toLowerCase()
    const pool = search
      ? allTasks.filter(t => (t.title || '').toLowerCase().includes(search))
      : allTasks.filter(t => {
          const ts = new Date(t.createdAt || t.updatedAt || 0).getTime()
          return ts >= oneMonthAgo
        })
    return pool.filter(t =>
      t.id !== taskId &&
      !(task.parentIds || []).includes(t.id) &&
      !(task.siblingIds || []).includes(t.id)
    )
  }

  function getAvailableSiblings(taskId) {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return []
    return tasks.filter(t =>
      t.id !== taskId &&
      t.status !== 'done' &&
      !(task.parentIds || []).includes(t.id) &&
      !(task.siblingIds || []).includes(t.id)
    )
  }

  function lookupTitle(id) {
    return allTasks.find(t => t.id === id)?.title || '(삭제됨)'
  }

  return (
    <section className="panel task-flow-panel">
      <div className="panel-head">
        <div>
          <Activity size={17} />
          <h2>업무 흐름도</h2>
        </div>
        <div className="task-flow-actions">
          {hasRelations && (
            <button
              type="button"
              className="secondary-action mini"
              onClick={openFullscreen}
              title="전체보기 새창에서 열기"
            >
              <ExternalLink size={13} />
              전체보기 새창
            </button>
          )}
          <button
            type="button"
            className="secondary-action mini"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {expanded ? '접기' : '펼치기'}
          </button>
        </div>
      </div>

      {expanded && (sortedTasks.length > 0 || hiddenCount > 0) && (
        <div className="task-flow-edit">
          <div className="task-flow-edit-head">
            <div className="task-flow-edit-title">연결 편집 (진행 중 업무, 부모→자식 순)</div>
            {hiddenCount > 0 && (
              <button
                type="button"
                className="secondary-action mini"
                onClick={() => setShowHidden(!showHidden)}
              >
                {showHidden ? <EyeOff size={13} /> : <Eye size={13} />}
                {showHidden ? `숨김 ${hiddenCount}개 가리기` : `숨김 ${hiddenCount}개 보기`}
              </button>
            )}
          </div>
          <div className="task-flow-edit-list">
            {sortedTasks.map(task => (
              <TaskFlowRow
                key={task.id}
                task={task}
                kpis={kpis}
                isOpen={openDropdown?.taskId === task.id}
                openType={openDropdown?.type}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onOpenParent={() => {
                  setOpenDropdown({ taskId: task.id, type: 'parent' })
                  setSearchQuery('')
                }}
                onOpenSibling={() => {
                  setOpenDropdown({ taskId: task.id, type: 'sibling' })
                  setSearchQuery('')
                }}
                onClose={() => setOpenDropdown(null)}
                availableParents={getAvailableParents(task.id)}
                availableSiblings={getAvailableSiblings(task.id)}
                onAddParent={parentId => addParent(task.id, parentId)}
                onAddSibling={siblingId => addSibling(task.id, siblingId)}
                onRemoveParent={parentId => removeParent(task.id, parentId)}
                onRemoveSibling={siblingId => removeSibling(task.id, siblingId)}
                onSetKpi={value => setKpi(task.id, value)}
                onToggleHide={() => toggleHide(task.id)}
                lookupTitle={lookupTitle}
              />
            ))}
            {showHidden && tasks.filter(t => t.status !== 'done' && t.hiddenInFlow).map(task => (
              <TaskFlowRow
                key={task.id}
                task={task}
                kpis={kpis}
                hidden
                isOpen={false}
                openType={null}
                searchQuery=""
                onSearchChange={() => {}}
                onOpenParent={() => {}}
                onOpenSibling={() => {}}
                onClose={() => {}}
                availableParents={[]}
                availableSiblings={[]}
                onAddParent={() => {}}
                onAddSibling={() => {}}
                onRemoveParent={() => {}}
                onRemoveSibling={() => {}}
                onSetKpi={value => setKpi(task.id, value)}
                onToggleHide={() => toggleHide(task.id)}
                lookupTitle={lookupTitle}
              />
            ))}
          </div>
        </div>
      )}

      {expanded && (
        !hasRelations ? (
          <p className="task-flow-empty">
            아직 연결된 진행 중 업무가 없습니다. 위에서 [↑+]로 이전 업무, [→+]로 병행 업무를 추가하세요.
          </p>
        ) : (
          <FlowMermaid chart={chart} />
        )
      )}
    </section>
  )
}

function TaskFlowRow({
  task,
  kpis = [],
  hidden = false,
  isOpen,
  openType,
  searchQuery,
  onSearchChange,
  onOpenParent,
  onOpenSibling,
  onClose,
  availableParents,
  availableSiblings,
  onAddParent,
  onAddSibling,
  onRemoveParent,
  onRemoveSibling,
  onSetKpi,
  onToggleHide,
  lookupTitle,
}) {
  const showParentDropdown = isOpen && openType === 'parent'
  const showSiblingDropdown = isOpen && openType === 'sibling'
  const parentIds = task.parentIds || []
  const siblingIds = task.siblingIds || []
  const currentKpi = task.kpi || task.impact || ''

  return (
    <div className={`task-flow-row ${hidden ? 'is-hidden' : ''}`}>
      <div className="task-flow-row-main">
        <span className="task-flow-row-title">{task.title || '제목 없음'}</span>
        <select
          className="task-flow-kpi-select"
          value={currentKpi}
          onChange={event => onSetKpi(event.target.value)}
          title="KPI 연결"
        >
          <option value="">KPI 미연결</option>
          {kpis.map(kpi => (
            <option key={kpi.id} value={kpi.label}>🎯 {kpi.label}</option>
          ))}
          {currentKpi && !kpis.some(k => k.label === currentKpi) && (
            <option value={currentKpi}>🎯 {currentKpi}</option>
          )}
        </select>
        <button
          type="button"
          className={`task-flow-btn hide ${hidden ? 'active' : ''}`}
          onClick={onToggleHide}
          title={hidden ? '다시 표시' : '흐름도에서 숨기기'}
        >
          {hidden ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
        <div className="task-flow-row-buttons">
          <div className="task-flow-btn-wrap">
            <button
              type="button"
              className={`task-flow-btn up ${showParentDropdown ? 'active' : ''}`}
              onClick={() => (showParentDropdown ? onClose() : onOpenParent())}
              title="이전 업무 추가"
            >
              ↑+
            </button>
            {showParentDropdown && (
              <div className="task-flow-dropdown above">
                <input
                  type="search"
                  placeholder="검색 (전체 기간)"
                  value={searchQuery}
                  onChange={event => onSearchChange(event.target.value)}
                  autoFocus
                />
                <div className="task-flow-dropdown-list">
                  {availableParents.length === 0 ? (
                    <div className="task-flow-dropdown-empty">
                      {searchQuery ? '검색 결과 없음' : '최근 1개월 업무 없음'}
                    </div>
                  ) : (
                    availableParents.slice(0, 30).map(t => (
                      <button
                        key={t.id}
                        type="button"
                        className="task-flow-dropdown-item"
                        onClick={() => onAddParent(t.id)}
                      >
                        {t.title}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="task-flow-btn-wrap">
            <button
              type="button"
              className={`task-flow-btn right ${showSiblingDropdown ? 'active' : ''}`}
              onClick={() => (showSiblingDropdown ? onClose() : onOpenSibling())}
              title="병행 업무 추가"
            >
              →+
            </button>
            {showSiblingDropdown && (
              <div className="task-flow-dropdown beside">
                <div className="task-flow-dropdown-list">
                  {availableSiblings.length === 0 ? (
                    <div className="task-flow-dropdown-empty">진행 중 이번 주 업무 없음</div>
                  ) : (
                    availableSiblings.slice(0, 30).map(t => (
                      <button
                        key={t.id}
                        type="button"
                        className="task-flow-dropdown-item"
                        onClick={() => onAddSibling(t.id)}
                      >
                        {t.title}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {(parentIds.length > 0 || siblingIds.length > 0) && (
        <div className="task-flow-row-relations">
          {parentIds.length > 0 && (
            <div className="task-flow-row-rel">
              <span className="task-flow-row-rel-label parent">↑ 이전</span>
              {parentIds.map(id => (
                <span key={id} className="task-flow-row-chip parent">
                  {lookupTitle(id)}
                  <button
                    type="button"
                    onClick={() => onRemoveParent(id)}
                    aria-label="연결 끊기"
                  >×</button>
                </span>
              ))}
            </div>
          )}
          {siblingIds.length > 0 && (
            <div className="task-flow-row-rel">
              <span className="task-flow-row-rel-label sibling">→ 병행</span>
              {siblingIds.map(id => (
                <span key={id} className="task-flow-row-chip sibling">
                  {lookupTitle(id)}
                  <button
                    type="button"
                    onClick={() => onRemoveSibling(id)}
                    aria-label="연결 끊기"
                  >×</button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FlowMermaid({ chart }) {
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setSvg('')

    const id = 'mmd-' + Math.random().toString(36).slice(2)
    mermaid.render(id, chart)
      .then(result => {
        if (cancelled) return
        setSvg(result.svg)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setError(err.message || String(err))
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [chart])

  if (error) return <pre className="task-flow-error">렌더 오류: {error}</pre>
  if (loading) return <p className="task-flow-loading">다이어그램 로딩 중...</p>
  return <div className="task-flow-mermaid" dangerouslySetInnerHTML={{ __html: svg }} />
}

// 부모 → 자식 순으로 정렬 (DFS)
function sortTasksByHierarchy(tasks) {
  if (tasks.length === 0) return []
  const taskIds = new Set(tasks.map(t => t.id))
  const sorted = []
  const visited = new Set()

  function visit(task) {
    if (visited.has(task.id)) return
    visited.add(task.id)
    sorted.push(task)
    const children = tasks.filter(t => (t.parentIds || []).includes(task.id))
    children.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
    children.forEach(visit)
  }

  // root: parentIds가 없거나, 부모가 현재 tasks 안에 없음
  const roots = tasks.filter(t => {
    const pids = t.parentIds || []
    return pids.length === 0 || !pids.some(id => taskIds.has(id))
  })
  roots.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
  roots.forEach(visit)

  // 미방문 task (cycle 등)
  tasks.forEach(t => {
    if (!visited.has(t.id)) visit(t)
  })

  return sorted
}

function buildChart(tasks) {
  if (tasks.length === 0) {
    return 'graph TD\n  empty["연결된 업무가 없습니다"]'
  }

  const taskIds = new Set(tasks.map(t => t.id))
  const lines = ['graph TD']

  // KPI 가상 노드: KPI 라벨이 있는 task들의 최상위
  const kpiLabels = new Set()
  tasks.forEach(t => {
    const label = (t.kpi || t.impact || '').trim()
    if (label) kpiLabels.add(label)
  })
  const kpiId = label => 'kpi_' + sanitizeId(label)

  // task 부모 화살표
  tasks.forEach(t => {
    (t.parentIds || []).forEach(pid => {
      if (taskIds.has(pid)) {
        lines.push(`  ${sanitizeId(pid)} --> ${sanitizeId(t.id)}`)
      }
    })
  })

  // KPI → task 화살표 (해당 task에 부모가 없는 루트 task에만 연결, 중복 시각 노이즈 방지)
  tasks.forEach(t => {
    const label = (t.kpi || t.impact || '').trim()
    if (!label) return
    const hasParentInTree = (t.parentIds || []).some(pid => taskIds.has(pid))
    if (hasParentInTree) return
    lines.push(`  ${kpiId(label)} ==> ${sanitizeId(t.id)}`)
  })

  const siblingPairs = new Set()
  tasks.forEach(t => {
    (t.siblingIds || []).forEach(sid => {
      if (!taskIds.has(sid)) return
      const pair = [t.id, sid].sort().join('|')
      if (!siblingPairs.has(pair)) {
        siblingPairs.add(pair)
        lines.push(`  ${sanitizeId(t.id)} -.- ${sanitizeId(sid)}`)
      }
    })
  })

  // KPI 노드 정의
  kpiLabels.forEach(label => {
    const safe = label.replace(/"/g, "'").replace(/[\[\]]/g, '').slice(0, 30)
    lines.push(`  ${kpiId(label)}(["🎯 ${safe}"]):::kpi`)
  })

  tasks.forEach(t => {
    const safeTitle = (t.title || '제목없음')
      .replace(/"/g, "'")
      .replace(/[\[\]]/g, '')
      .slice(0, 40)
    const status = t.status || 'todo'
    lines.push(`  ${sanitizeId(t.id)}["${safeTitle}"]:::${status}`)
  })

  lines.push('  classDef kpi fill:#0d7a6e,stroke:#065f55,color:white,font-weight:bold')
  lines.push('  classDef done fill:#10b981,stroke:#059669,color:white,font-weight:bold')
  lines.push('  classDef doing fill:#3b82f6,stroke:#2563eb,color:white,font-weight:bold')
  lines.push('  classDef todo fill:#9ca3af,stroke:#6b7280,color:white')
  lines.push('  classDef review fill:#f59e0b,stroke:#d97706,color:white,font-weight:bold')
  lines.push('  classDef blocked fill:#ef4444,stroke:#dc2626,color:white,font-weight:bold')

  return lines.join('\n')
}

function sanitizeId(id) {
  return String(id).replace(/[^a-zA-Z0-9_]/g, '_')
}

function buildFullHtml(chart) {
  const escaped = chart
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>업무 흐름도</title>
<style>
  body { margin: 0; padding: 28px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f7f6; color: #18211d; }
  h1 { font-size: 22px; margin: 0 0 18px; }
  .container { background: white; padding: 32px; border-radius: 14px; box-shadow: 0 6px 22px rgba(0,0,0,0.06); overflow: auto; }
  .mermaid { text-align: center; }
  .mermaid svg { max-width: 100%; height: auto; }
</style>
</head>
<body>
<h1>업무 흐름도</h1>
<div class="container">
<pre class="mermaid">${escaped}</pre>
</div>
<script type="module">
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs'
mermaid.initialize({ startOnLoad: true, theme: 'default', flowchart: { curve: 'basis' } })
</script>
</body>
</html>`
}
