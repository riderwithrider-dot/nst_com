// 업무 흐름도 (F안: Mermaid + 노드 클릭 메뉴)
// - 리스트형 연결 편집 UI 제거
// - Mermaid 노드를 직접 클릭 → 작은 메뉴: 상위 추가 / 병행 추가 / 숨김
// - 사용자별 숨김 상태는 기존대로 task.hiddenInFlow 사용 (이번 주 업무 doc 안에 보관)

import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ArrowRight, ArrowUp, BookmarkPlus, ChevronDown, ChevronUp, ExternalLink, EyeOff, RotateCcw, Save, Trash2, X } from 'lucide-react'
import mermaid from 'mermaid'
import { STATUS_META, DEFAULT_TEAM_ID } from './lib/constants'
import { deleteFlowSnapshot, saveFlowSnapshot, subscribeFlowSnapshots } from './lib/db'
import { generateId } from './lib/date'

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  flowchart: { curve: 'basis', useMaxWidth: false, padding: 14 },
  themeVariables: { fontFamily: 'inherit', fontSize: '13px' },
})

export default function TaskFlowPanel({ user, tasks = [], history = [], kpis = [], onUpdateTask, onDeleteTask }) {
  const [expanded, setExpanded] = useState(true)
  const [snapshots, setSnapshots] = useState([])
  const [activeSnapshotId, setActiveSnapshotId] = useState(null)
  const [snapshotError, setSnapshotError] = useState('')

  useEffect(() => {
    if (!user?.uid) return undefined
    return subscribeFlowSnapshots(DEFAULT_TEAM_ID, user.uid, setSnapshots)
  }, [user?.uid])

  const activeSnapshot = useMemo(
    () => snapshots.find(s => s.id === activeSnapshotId) || null,
    [snapshots, activeSnapshotId],
  )

  // 스냅샷 활성 시 그 hidden 목록을 우선, 아니면 task.hiddenInFlow 사용
  const effectiveHiddenIds = useMemo(() => {
    if (activeSnapshot) return new Set(activeSnapshot.hidden || [])
    return new Set(tasks.filter(t => t.hiddenInFlow).map(t => t.id))
  }, [activeSnapshot, tasks])

  async function handleSaveSnapshot() {
    if (!user?.uid) {
      setSnapshotError('로그인 후 사용할 수 있습니다.')
      return
    }
    const name = window.prompt('스냅샷 이름을 입력하세요 (예: 5월 보고용, 현대홈쇼핑 PT용)')
    if (!name || !name.trim()) return
    const id = generateId('snap')
    try {
      setSnapshotError('')
      await saveFlowSnapshot(DEFAULT_TEAM_ID, user.uid, id, {
        name: name.trim(),
        // 현재 보이는 상태 그대로 저장: 숨김 처리된 task id들 + 활성 스냅샷이면 그 hidden 사용
        hidden: Array.from(effectiveHiddenIds),
      })
      setActiveSnapshotId(id)
    } catch (err) {
      setSnapshotError(`스냅샷 저장 실패: ${err.message}\n  Firestore 규칙(flowSnapshots) 배포 여부를 확인하세요.`)
    }
  }

  async function handleOverwriteSnapshot() {
    if (!activeSnapshot || !user?.uid) return
    const ok = window.confirm(`"${activeSnapshot.name}" 스냅샷을 현재 화면 상태로 덮어쓸까요?`)
    if (!ok) return
    try {
      setSnapshotError('')
      await saveFlowSnapshot(DEFAULT_TEAM_ID, user.uid, activeSnapshot.id, {
        name: activeSnapshot.name,
        hidden: Array.from(effectiveHiddenIds),
      })
    } catch (err) {
      setSnapshotError(`덮어쓰기 실패: ${err.message}`)
    }
  }

  async function handleDeleteSnapshot() {
    if (!activeSnapshot || !user?.uid) return
    const ok = window.confirm(`"${activeSnapshot.name}" 스냅샷을 삭제할까요?`)
    if (!ok) return
    try {
      setSnapshotError('')
      await deleteFlowSnapshot(DEFAULT_TEAM_ID, user.uid, activeSnapshot.id)
      setActiveSnapshotId(null)
    } catch (err) {
      setSnapshotError(`스냅샷 삭제 실패: ${err.message}`)
    }
  }

  // 검색/조상 보강용 전체 task 풀 (이번 주 + 과거 history)
  const allTasks = useMemo(() => {
    const seen = new Set()
    return [...tasks, ...history.flatMap(w => w.items || [])].filter(t => {
      if (!t || seen.has(t.id)) return false
      seen.add(t.id)
      return true
    })
  }, [tasks, history])

  const activeNonHidden = useMemo(
    () => tasks.filter(t => t.status !== 'done' && !effectiveHiddenIds.has(t.id)),
    [tasks, effectiveHiddenIds],
  )
  const hiddenTasks = useMemo(
    () => tasks.filter(t => t.status !== 'done' && effectiveHiddenIds.has(t.id)),
    [tasks, effectiveHiddenIds],
  )

  // 다이어그램에 표시: 진행 중 + 부모 체인(완료/히스토리여도 부모면 포함)
  const displayTasks = useMemo(() => {
    const ids = new Set(activeNonHidden.map(t => t.id))
    const extras = []
    const queue = [...activeNonHidden]
    while (queue.length > 0) {
      const t = queue.shift()
      ;(t.parentIds || []).forEach(pid => {
        if (ids.has(pid)) return
        const parent = allTasks.find(x => x.id === pid)
        if (!parent) return
        ids.add(pid)
        extras.push(parent)
        queue.push(parent)
      })
    }
    return [...activeNonHidden, ...extras]
  }, [activeNonHidden, allTasks])

  const sortedTasks = useMemo(() => sortTasksByHierarchy(displayTasks), [displayTasks])

  const chart = useMemo(() => buildChart(sortedTasks), [sortedTasks])

  // sanitizedId → 원래 taskId 매핑 (Mermaid가 ID를 sanitize 하므로)
  const idMap = useMemo(() => {
    const m = new Map()
    sortedTasks.forEach(t => m.set(sanitizeId(t.id), t.id))
    return m
  }, [sortedTasks])

  // KPI 가상 노드 sanitized id → 원래 label 매핑
  const kpiMap = useMemo(() => {
    const m = new Map()
    sortedTasks.forEach(t => {
      const label = (t.kpi || t.impact || '').trim()
      if (label) m.set(`kpi_${sanitizeId(label)}`, label)
    })
    return m
  }, [sortedTasks])

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

  function blockIfSnapshot() {
    if (activeSnapshot) {
      window.alert('스냅샷 보기 중에는 편집할 수 없습니다.\n  라이브로 돌아간 후 다시 시도하세요 (스냅샷 영역의 "라이브로 돌아가기" 버튼).')
      return true
    }
    return false
  }

  function handleAddRelation(taskId, kind, otherId) {
    if (!onUpdateTask) return
    if (blockIfSnapshot()) return
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    if (taskId === otherId) return
    const key = kind === 'parent' ? 'parentIds' : 'siblingIds'
    const exclude = kind === 'parent' ? 'siblingIds' : 'parentIds'
    const current = task[key] || []
    if (current.includes(otherId)) return
    onUpdateTask(taskId, {
      [key]: [...current, otherId],
      [exclude]: (task[exclude] || []).filter(id => id !== otherId),
    })
  }

  function handleHide(taskId) {
    if (!onUpdateTask) return
    if (blockIfSnapshot()) return
    onUpdateTask(taskId, { hiddenInFlow: true })
  }

  function handleUnhide(taskId) {
    if (!onUpdateTask) return
    if (blockIfSnapshot()) return
    onUpdateTask(taskId, { hiddenInFlow: false })
  }

  function handleResetRelations(taskId) {
    if (!onUpdateTask) return
    if (blockIfSnapshot()) return
    onUpdateTask(taskId, { hiddenInFlow: false, parentIds: [], siblingIds: [] })
  }

  function handleDelete(taskId) {
    if (!onDeleteTask) return
    if (blockIfSnapshot()) return
    const task = tasks.find(t => t.id === taskId)
    const title = task?.title || '이 업무'
    const ok = window.confirm(`"${title}"을(를) 삭제할까요?\n진행내용·코멘트·이미지가 모두 같이 삭제되며 되돌릴 수 없습니다.`)
    if (!ok) return
    onDeleteTask(taskId)
  }

  async function handleDeleteKpi(kpiLabel) {
    if (!onUpdateTask || !kpiLabel) return
    if (blockIfSnapshot()) return
    const affected = tasks.filter(t => (t.kpi || t.impact) === kpiLabel)
    if (affected.length === 0) {
      window.alert('이 KPI를 사용 중인 이번 주 업무가 없습니다. 차트에서만 잠깐 사라집니다.')
      return
    }
    const ok = window.confirm(`KPI "${kpiLabel}"을(를) ${affected.length}개 업무에서 모두 제거할까요?\nKPI 정의 자체가 삭제되지는 않으며, 각 업무의 KPI 연결만 끊깁니다.`)
    if (!ok) return
    for (const t of affected) {
      // 순차 실행 — onUpdateTask가 tasks 배열 전체를 저장하는 구조라 병렬 시 race 발생
      // eslint-disable-next-line no-await-in-loop
      await onUpdateTask(t.id, { kpi: '', impact: '' })
    }
  }

  return (
    <section className="panel task-flow-panel">
      <div className="panel-head">
        <div>
          <Activity size={17} />
          <h2>업무 흐름도</h2>
        </div>
        <div className="task-flow-actions">
          {sortedTasks.length > 0 && (
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

      {expanded && (
        sortedTasks.length === 0 ? (
          <p className="task-flow-empty">
            진행 중 업무가 없습니다. 이번 주 업무를 등록하면 여기에 흐름도가 표시되고, 노드를 클릭해 상위/병행/숨김을 설정할 수 있습니다.
          </p>
        ) : (
          <FlowMermaidInteractive
            chart={chart}
            tasks={tasks}
            displayTasks={sortedTasks}
            allTasks={allTasks}
            idMap={idMap}
            kpiMap={kpiMap}
            onAddRelation={handleAddRelation}
            onHide={handleHide}
            onResetRelations={handleResetRelations}
            onDelete={onDeleteTask ? handleDelete : null}
            onDeleteKpi={onUpdateTask ? handleDeleteKpi : null}
          />
        )
      )}

      {expanded && hiddenTasks.length > 0 && (
        <div className="flow-hidden-list">
          <strong>
            {activeSnapshot ? `스냅샷 숨김 ${hiddenTasks.length}건 — 라이브 데이터에는 영향 없음` : `숨겨진 업무 (${hiddenTasks.length}건)`}
          </strong>
          <ul>
            {hiddenTasks.map(t => (
              <li key={t.id}>
                <span>{t.title}</span>
                {!activeSnapshot && (
                  <button type="button" className="ghost-action" onClick={() => handleUnhide(t.id)}>
                    다시 보기
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {expanded && (
        <div className="flow-snapshot-bar">
          {snapshotError && <div className="alert error slim" style={{ whiteSpace: 'pre-wrap' }}>{snapshotError}</div>}
          <div className="flow-snapshot-controls">
            <label className="flow-snapshot-select-label">
              <span>스냅샷</span>
              <select
                value={activeSnapshotId || ''}
                onChange={event => setActiveSnapshotId(event.target.value || null)}
              >
                <option value="">— 라이브 (현재 데이터) —</option>
                {snapshots.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            {activeSnapshot && (
              <>
                <button
                  type="button"
                  className="ghost-action"
                  onClick={handleOverwriteSnapshot}
                  title="현재 화면 상태로 이 스냅샷 덮어쓰기"
                >
                  <Save size={13} /> 덮어쓰기
                </button>
                <button
                  type="button"
                  className="ghost-action danger"
                  onClick={handleDeleteSnapshot}
                  title="이 스냅샷 삭제"
                >
                  <Trash2 size={13} /> 스냅샷 삭제
                </button>
              </>
            )}
            <button
              type="button"
              className="primary-action mini"
              onClick={handleSaveSnapshot}
              title="현재 화면 상태를 새 스냅샷으로 저장"
            >
              <BookmarkPlus size={13} /> 새 스냅샷 저장
            </button>
          </div>
          {activeSnapshot && (
            <div className="flow-snapshot-banner">
              <span>스냅샷 보는 중: <strong>{activeSnapshot.name}</strong> · 변경은 라이브 데이터에 반영되지 않습니다</span>
              <button type="button" className="ghost-action" onClick={() => setActiveSnapshotId(null)}>
                라이브로 돌아가기
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function FlowMermaidInteractive({
  chart,
  tasks,
  displayTasks,
  allTasks,
  idMap,
  kpiMap,
  onAddRelation,
  onHide,
  onResetRelations,
  onDelete,
  onDeleteKpi,
}) {
  const wrapRef = useRef(null)
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [menu, setMenu] = useState(null) // { taskId, x, y }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setSvg('')
    setMenu(null)

    const id = 'mmd-' + Math.random().toString(36).slice(2)
    mermaid.render(id, chart)
      .then(result => {
        if (cancelled) return
        setSvg(result.svg)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        const msg = err?.message || String(err)
        setError(`다이어그램 렌더 실패: ${msg}\n  페이지를 새로고침하거나 네트워크 상태를 확인하세요.`)
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [chart])

  useEffect(() => {
    if (!svg) return
    const wrap = wrapRef.current
    if (!wrap) return

    // 모든 노드(task + KPI)에 pointer 커서
    wrap.querySelectorAll('.node').forEach(node => {
      const sanitized = node.getAttribute('data-id') || extractIdFromMermaid(node.getAttribute('id') || '')
      if (!sanitized) return
      if (sanitized.startsWith('kpi_')) {
        if (kpiMap?.has(sanitized)) node.style.cursor = 'pointer'
      } else if (idMap.has(sanitized)) {
        node.style.cursor = 'pointer'
      }
    })

    // 이벤트 위임: wrap 한 곳에만 부착 → foreignObject 안 HTML 클릭도 잡힘
    function handleWrapClick(event) {
      const node = event.target.closest('.node')
      if (!node) return
      const sanitized = node.getAttribute('data-id') || extractIdFromMermaid(node.getAttribute('id') || '')
      if (!sanitized) return

      const wrapRect = wrap.getBoundingClientRect()
      const nodeRect = node.getBoundingClientRect()
      const x = nodeRect.left - wrapRect.left + nodeRect.width / 2
      const y = nodeRect.bottom - wrapRect.top + 8

      if (sanitized.startsWith('kpi_')) {
        const kpiLabel = kpiMap?.get(sanitized)
        if (!kpiLabel) return
        event.stopPropagation()
        setMenu({ kind: 'kpi', kpiLabel, x, y })
        return
      }

      const taskId = idMap.get(sanitized)
      if (!taskId) return
      event.stopPropagation()
      setMenu({ kind: 'task', taskId, x, y })
    }

    function handleDocClick(event) {
      // 메뉴 안 클릭이면 유지
      if (event.target.closest && event.target.closest('.flow-node-menu')) return
      // 노드 클릭이면 wrap 핸들러가 처리하므로 닫지 말 것
      if (event.target.closest && event.target.closest('.task-flow-mermaid-wrap .node')) return
      setMenu(null)
    }

    wrap.addEventListener('click', handleWrapClick)
    document.addEventListener('click', handleDocClick)

    return () => {
      wrap.removeEventListener('click', handleWrapClick)
      document.removeEventListener('click', handleDocClick)
    }
  }, [svg, idMap, kpiMap])

  const activeMenuTask = (menu && menu.kind === 'task') ? tasks.find(t => t.id === menu.taskId) : null

  if (error) {
    return <pre className="task-flow-error" style={{ whiteSpace: 'pre-wrap' }}>{error}</pre>
  }
  if (loading) {
    return <p className="task-flow-loading">다이어그램 로딩 중...</p>
  }

  return (
    <div className="task-flow-mermaid-wrap" ref={wrapRef}>
      <div className="task-flow-mermaid" dangerouslySetInnerHTML={{ __html: svg }} />
      {menu && menu.kind === 'task' && activeMenuTask && (
        <NodeClickMenu
          task={activeMenuTask}
          tasks={tasks}
          allTasks={allTasks}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onHide={() => { onHide(menu.taskId); setMenu(null) }}
          onReset={() => { onResetRelations(menu.taskId); setMenu(null) }}
          onAddRelation={(kind, otherId) => { onAddRelation(menu.taskId, kind, otherId); setMenu(null) }}
          onDelete={onDelete ? () => { onDelete(menu.taskId); setMenu(null) } : null}
        />
      )}
      {menu && menu.kind === 'kpi' && (
        <KpiClickMenu
          kpiLabel={menu.kpiLabel}
          tasks={tasks}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onDelete={onDeleteKpi ? () => { onDeleteKpi(menu.kpiLabel); setMenu(null) } : null}
        />
      )}
    </div>
  )
}

function KpiClickMenu({ kpiLabel, tasks, x, y, onClose, onDelete }) {
  const linkedTasks = tasks.filter(t => (t.kpi || t.impact) === kpiLabel)
  return (
    <div
      className="flow-node-menu"
      style={{ left: `${x}px`, top: `${y}px` }}
      onClick={event => event.stopPropagation()}
    >
      <div className="flow-node-menu-head">
        <strong title={kpiLabel}>{kpiLabel}</strong>
        <button type="button" className="icon-button subtle" onClick={onClose} title="닫기">
          <X size={14} />
        </button>
      </div>
      <div className="flow-node-menu-meta">
        KPI · 연결된 이번 주 업무 {linkedTasks.length}개
      </div>
      {linkedTasks.length > 0 && (
        <ul className="flow-node-menu-linked">
          {linkedTasks.map(t => (
            <li key={t.id}>{t.title}</li>
          ))}
        </ul>
      )}
      <div className="flow-node-menu-actions">
        {onDelete && (
          <button
            type="button"
            className="ghost-action danger"
            onClick={onDelete}
            title="이 KPI를 모든 업무에서 제거"
          >
            <Trash2 size={13} /> KPI 연결 모두 끊기
          </button>
        )}
      </div>
    </div>
  )
}

function NodeClickMenu({ task, tasks, allTasks, x, y, onClose, onHide, onReset, onAddRelation, onDelete }) {
  const [parentSearch, setParentSearch] = useState('')
  const parentIds = task.parentIds || []
  const siblingIds = task.siblingIds || []

  const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000
  const cutoffMs = Date.now() - ONE_MONTH_MS

  // 상위 후보: 검색어 있으면 완료업무 히스토리 포함 전체에서 title 매칭, 없으면 최근 1개월만
  const allowedAsParent = allTasks.filter(t =>
    t.id !== task.id && !parentIds.includes(t.id) && !siblingIds.includes(t.id),
  )
  const trimmedSearch = parentSearch.trim().toLowerCase()
  const parentCandidates = trimmedSearch
    ? allowedAsParent.filter(t => (t.title || '').toLowerCase().includes(trimmedSearch))
    : allowedAsParent.filter(t => {
        const ts = new Date(t.createdAt || t.updatedAt || 0).getTime()
        return Number.isFinite(ts) && ts >= cutoffMs
      })

  // 병행 후보: 이번 주 진행 중만
  const siblingCandidates = tasks.filter(t =>
    t.id !== task.id &&
    t.status !== 'done' &&
    !parentIds.includes(t.id) && !siblingIds.includes(t.id),
  )
  const sortedParents = sortByHierarchy(parentCandidates)
  const sortedSiblings = sortByHierarchy(siblingCandidates)

  return (
    <div
      className="flow-node-menu"
      style={{ left: `${x}px`, top: `${y}px` }}
      onClick={event => event.stopPropagation()}
    >
      <div className="flow-node-menu-head">
        <strong title={task.title}>{task.title}</strong>
        <button type="button" className="icon-button subtle" onClick={onClose} title="닫기">
          <X size={14} />
        </button>
      </div>
      <div className="flow-node-menu-meta">
        상태 {STATUS_META[task.status]?.label || task.status} · 모태 {parentIds.length} · 병행 {siblingIds.length}
      </div>

      <div className="flow-node-menu-row stacked">
        <span className="flow-node-menu-label">
          <ArrowUp size={13} /> 상위 추가
        </span>
        <div className="flow-node-menu-parent-controls">
          <input
            type="search"
            className="flow-node-menu-search"
            placeholder={trimmedSearch ? '검색 중 (전체 히스토리)' : '검색 (전체 히스토리에서)'}
            value={parentSearch}
            onChange={event => setParentSearch(event.target.value)}
          />
          <select
            disabled={sortedParents.length === 0}
            value=""
            onChange={event => { const v = event.target.value; if (v) onAddRelation('parent', v) }}
          >
            <option value="">
              {sortedParents.length === 0
                ? (trimmedSearch ? '검색 결과 없음' : '최근 1개월 내 업무 없음 — 위에서 검색')
                : (trimmedSearch ? `검색 결과 ${sortedParents.length}건` : `최근 1개월 ${sortedParents.length}건`)}
            </option>
            {sortedParents.slice(0, 50).map(({ task: t, depth }) => (
              <option key={t.id} value={t.id}>{indent(t.title, depth)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flow-node-menu-row">
        <span className="flow-node-menu-label">
          <ArrowRight size={13} /> 병행 추가
        </span>
        <select
          disabled={sortedSiblings.length === 0}
          value=""
          onChange={event => { const v = event.target.value; if (v) onAddRelation('sibling', v) }}
        >
          <option value="">{sortedSiblings.length === 0 ? '연결 가능한 업무 없음' : '업무 선택'}</option>
          {sortedSiblings.map(({ task: t, depth }) => (
            <option key={t.id} value={t.id}>{indent(t.title, depth)}</option>
          ))}
        </select>
      </div>

      <div className="flow-node-menu-actions">
        <button type="button" className="ghost-action" onClick={onHide}>
          <EyeOff size={13} /> 숨김
        </button>
        <button
          type="button"
          className="ghost-action"
          onClick={onReset}
          title="이 업무의 상위·병행 연결과 숨김 상태를 모두 해제"
        >
          <RotateCcw size={13} /> 연결 초기화
        </button>
        {onDelete && (
          <button
            type="button"
            className="ghost-action danger"
            onClick={onDelete}
            title="이 업무를 영구 삭제"
          >
            <Trash2 size={13} /> 삭제
          </button>
        )}
      </div>
    </div>
  )
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

  const roots = tasks.filter(t => {
    const pids = t.parentIds || []
    return pids.length === 0 || !pids.some(id => taskIds.has(id))
  })
  roots.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
  roots.forEach(visit)
  tasks.forEach(t => { if (!visited.has(t.id)) visit(t) })
  return sorted
}

// 메뉴 옵션용 - 부모/자식 계층 + depth
function sortByHierarchy(tasks) {
  if (tasks.length === 0) return []
  const ids = new Set(tasks.map(t => t.id))
  const visited = new Set()
  const result = []

  function visit(task, depth) {
    if (visited.has(task.id)) return
    visited.add(task.id)
    result.push({ task, depth })
    tasks
      .filter(t => (t.parentIds || []).includes(task.id))
      .forEach(child => visit(child, depth + 1))
  }

  const roots = tasks.filter(t => {
    const parents = t.parentIds || []
    return parents.length === 0 || !parents.some(p => ids.has(p))
  })
  roots.forEach(r => visit(r, 0))
  tasks.forEach(t => visit(t, 0))
  return result
}

function indent(title, depth) {
  if (depth <= 0) return title
  return `${'　'.repeat(depth - 1)}└ ${title}`
}

function buildChart(tasks) {
  if (tasks.length === 0) {
    return 'graph TD\n  empty["연결된 업무가 없습니다"]'
  }

  const taskIds = new Set(tasks.map(t => t.id))
  const lines = ['graph TD']

  // KPI 가상 노드
  const kpiLabels = new Set()
  tasks.forEach(t => {
    const label = (t.kpi || t.impact || '').trim()
    if (label) kpiLabels.add(label)
  })
  const kpiId = label => 'kpi_' + sanitizeId(label)

  // 부모 화살표
  tasks.forEach(t => {
    ;(t.parentIds || []).forEach(pid => {
      if (taskIds.has(pid)) {
        lines.push(`  ${sanitizeId(pid)} --> ${sanitizeId(t.id)}`)
      }
    })
  })

  // KPI → root task 화살표 (부모가 표시 트리 안에 없는 task에만)
  tasks.forEach(t => {
    const label = (t.kpi || t.impact || '').trim()
    if (!label) return
    const hasParentInTree = (t.parentIds || []).some(pid => taskIds.has(pid))
    if (hasParentInTree) return
    lines.push(`  ${kpiId(label)} ==> ${sanitizeId(t.id)}`)
  })

  // 병행(siblings) — 점선
  const siblingPairs = new Set()
  tasks.forEach(t => {
    ;(t.siblingIds || []).forEach(sid => {
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
    lines.push(`  ${kpiId(label)}(["${safe}"]):::kpi`)
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

// Mermaid 노드 id가 "flowchart-{원래id}-{N}" 형태일 때 원래 id 추출 (data-id 부재 시 폴백)
function extractIdFromMermaid(rawId) {
  const m = rawId.match(/^flowchart-(.+)-\d+$/)
  return m ? m[1] : null
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
