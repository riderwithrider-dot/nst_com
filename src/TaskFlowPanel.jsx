// 업무 흐름도 (F안: Mermaid + 노드 클릭 메뉴)
// - 리스트형 연결 편집 UI 제거
// - Mermaid 노드를 직접 클릭 → 작은 메뉴: 상위 추가 / 병행 추가 / 숨김
// - 사용자별 숨김 상태는 기존대로 task.hiddenInFlow 사용 (이번 주 업무 doc 안에 보관)

import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ArrowRight, ArrowUp, BookmarkPlus, ChevronDown, ChevronUp, ExternalLink, EyeOff, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react'
import mermaid from 'mermaid'
import { STATUS_META, SUBTEAMS, DEFAULT_TEAM_ID, getSubteamLabel } from './lib/constants'
import { createKpi, deleteFlowSnapshot, saveFlowSnapshot, subscribeFlowSnapshots } from './lib/db'
import { generateId } from './lib/date'

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  flowchart: { curve: 'basis', useMaxWidth: false, padding: 14 },
  themeVariables: { fontFamily: 'inherit', fontSize: '13px' },
})

export default function TaskFlowPanel({ user, tasks = [], history = [], kpis = [], onUpdateTask, onUpdateTasksBatch, onDeleteTask }) {
  const [expanded, setExpanded] = useState(true)
  const [snapshots, setSnapshots] = useState([])
  const [activeSnapshotId, setActiveSnapshotId] = useState(null)
  const [snapshotError, setSnapshotError] = useState('')
  const [snapshotInputName, setSnapshotInputName] = useState('')
  // 접이식 게시글형 섹션 — 기본 모두 닫힘
  const [openSection, setOpenSection] = useState(null) // 'hidden' | 'snapshots' | null
  // 차트에 임시 핀(pin)한 KPI 라벨 (이번 주 task가 안 써도 차트에 표시)
  const [pinnedKpiLabels, setPinnedKpiLabels] = useState(() => new Set())

  function handlePinKpi(event) {
    const label = event.target.value
    if (!label) return
    setPinnedKpiLabels(prev => {
      const next = new Set(prev)
      next.add(label)
      return next
    })
    // select 자동 리셋
    event.target.value = ''
  }

  function handleUnpinKpi(label) {
    setPinnedKpiLabels(prev => {
      const next = new Set(prev)
      next.delete(label)
      return next
    })
  }

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

  // 입력 이름과 매칭되는 기존 스냅샷
  const matchingSnapshot = useMemo(() => {
    const trimmed = snapshotInputName.trim()
    if (!trimmed) return null
    return snapshots.find(s => s.name === trimmed) || null
  }, [snapshotInputName, snapshots])

  async function handleSaveSnapshotByName() {
    if (!user?.uid) {
      setSnapshotError('로그인 후 사용할 수 있습니다.')
      return
    }
    const name = snapshotInputName.trim()
    if (!name) {
      setSnapshotError('스냅샷 이름을 입력하세요.')
      return
    }
    try {
      setSnapshotError('')
      console.log('[스냅샷] 저장 시작:', { name, hiddenCount: effectiveHiddenIds.size, uid: user.uid })
      if (matchingSnapshot) {
        const ok = window.confirm(`"${name}" 스냅샷이 이미 있습니다. 현재 화면 상태로 덮어쓸까요?`)
        if (!ok) return
        await saveFlowSnapshot(DEFAULT_TEAM_ID, user.uid, matchingSnapshot.id, {
          name,
          hidden: Array.from(effectiveHiddenIds),
        })
        setActiveSnapshotId(matchingSnapshot.id)
        console.log('[스냅샷] 덮어쓰기 완료:', name)
      } else {
        const id = generateId('snap')
        await saveFlowSnapshot(DEFAULT_TEAM_ID, user.uid, id, {
          name,
          hidden: Array.from(effectiveHiddenIds),
        })
        setActiveSnapshotId(id)
        console.log('[스냅샷] 새로 저장 완료:', { name, id })
      }
      // 저장 성공 → 스냅샷 관리 섹션 자동 펼치기
      setOpenSection('snapshots')
      window.alert(`스냅샷 "${name}" 저장 완료\n스냅샷 관리 섹션에서 확인할 수 있습니다.`)
    } catch (err) {
      console.error('[스냅샷] 저장 실패:', err)
      setSnapshotError(`스냅샷 저장 실패: ${err.message || err.code || '알 수 없는 오류'}\n  1) F12 콘솔의 상세 에러 확인\n  2) Firestore 규칙(flowSnapshots) 배포 여부 확인\n  3) 네트워크/로그인 상태 확인`)
    }
  }

  function handleLoadByName() {
    if (matchingSnapshot) {
      setActiveSnapshotId(matchingSnapshot.id)
    }
  }

  function handleGoLive() {
    setActiveSnapshotId(null)
    setSnapshotInputName('')
  }

  async function handleDeleteSnapshotByName() {
    if (!matchingSnapshot || !user?.uid) return
    const ok = window.confirm(`"${matchingSnapshot.name}" 스냅샷을 삭제할까요?`)
    if (!ok) return
    try {
      setSnapshotError('')
      await deleteFlowSnapshot(DEFAULT_TEAM_ID, user.uid, matchingSnapshot.id)
      if (activeSnapshotId === matchingSnapshot.id) {
        setActiveSnapshotId(null)
      }
      setSnapshotInputName('')
    } catch (err) {
      setSnapshotError(`스냅샷 삭제 실패: ${err.message}`)
    }
  }

  // 활성 스냅샷이 바뀌면 입력란을 자동 동기화
  useEffect(() => {
    if (activeSnapshot) {
      setSnapshotInputName(activeSnapshot.name)
    } else {
      setSnapshotInputName('')
    }
  }, [activeSnapshot])

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

  // 이번 주 활성 task ID 셋 — KPI 노드 추출 시 history 부모(extras) 제외용
  const currentTaskIds = useMemo(
    () => new Set(activeNonHidden.map(t => t.id)),
    [activeNonHidden],
  )

  const chart = useMemo(
    () => buildChart(sortedTasks, currentTaskIds, pinnedKpiLabels),
    [sortedTasks, currentTaskIds, pinnedKpiLabels],
  )

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
      window.alert('스냅샷 보기 중에는 편집할 수 없습니다.\n  기존 업무흐름도로 돌아간 후 다시 시도하세요 (스냅샷 영역의 "기존 업무흐름도로 돌아가기" 버튼).')
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

  // 히스토리 업무를 차트에서 제외 (이번 주 업무들의 parentIds/siblingIds에서 제거)
  async function handleRemoveFromChart(historyTaskId) {
    if (blockIfSnapshot()) return
    const affected = tasks.filter(t =>
      (t.parentIds || []).includes(historyTaskId) || (t.siblingIds || []).includes(historyTaskId),
    )
    if (affected.length === 0) {
      window.alert('이 업무를 부모/병행으로 가진 이번 주 업무가 없습니다.')
      return
    }
    const titles = affected.map(t => `· ${t.title}`).join('\n')
    const ok = window.confirm(`다음 ${affected.length}개 이번 주 업무에서 이 업무 연결을 끊습니다 (히스토리 데이터는 보존):\n\n${titles}\n\n계속할까요?`)
    if (!ok) return
    const updates = affected.map(t => ({
      taskId: t.id,
      patch: {
        parentIds: (t.parentIds || []).filter(id => id !== historyTaskId),
        siblingIds: (t.siblingIds || []).filter(id => id !== historyTaskId),
      },
    }))
    if (onUpdateTasksBatch) {
      await onUpdateTasksBatch(updates)
    } else if (onUpdateTask) {
      // 폴백: batch 함수 없으면 순차 호출 (race 위험 있으나 fallback)
      for (const u of updates) {
        // eslint-disable-next-line no-await-in-loop
        await onUpdateTask(u.taskId, u.patch)
      }
    }
  }

  async function handleDeleteKpi(kpiLabel) {
    if (!kpiLabel) return
    if (blockIfSnapshot()) return
    const affected = tasks.filter(t => (t.kpi || t.impact) === kpiLabel)
    if (affected.length === 0) {
      window.alert('이 KPI를 사용 중인 이번 주 업무가 없습니다. 차트에서만 잠깐 사라집니다.')
      return
    }
    const ok = window.confirm(`KPI "${kpiLabel}"을(를) ${affected.length}개 업무에서 모두 제거할까요?\nKPI 정의 자체가 삭제되지는 않으며, 각 업무의 KPI 연결만 끊깁니다.`)
    if (!ok) return
    const updates = affected.map(t => ({ taskId: t.id, patch: { kpi: '', impact: '' } }))
    if (onUpdateTasksBatch) {
      await onUpdateTasksBatch(updates)
    } else if (onUpdateTask) {
      for (const u of updates) {
        // eslint-disable-next-line no-await-in-loop
        await onUpdateTask(u.taskId, u.patch)
      }
    }
  }

  // 클릭한 KPI를 같은 부서의 다른 KPI로 변경 (해당 라벨을 쓰는 모든 이번 주 업무에 일괄 적용)
  async function handleChangeKpi(oldLabel, newLabel) {
    if (!oldLabel || !newLabel || oldLabel === newLabel) return
    if (blockIfSnapshot()) return
    const affected = tasks.filter(t => (t.kpi || t.impact) === oldLabel)
    if (affected.length === 0) {
      window.alert(`이번 주 업무 중 "${oldLabel}" 라벨을 가진 게 없어 변경할 대상이 없습니다.`)
      return
    }
    const ok = window.confirm(`${affected.length}개 업무의 KPI를 "${oldLabel}" → "${newLabel}" 로 변경할까요?`)
    if (!ok) return
    const updates = affected.map(t => ({ taskId: t.id, patch: { kpi: newLabel, impact: newLabel } }))
    if (onUpdateTasksBatch) {
      await onUpdateTasksBatch(updates)
    } else if (onUpdateTask) {
      for (const u of updates) {
        // eslint-disable-next-line no-await-in-loop
        await onUpdateTask(u.taskId, u.patch)
      }
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
          <button
            type="button"
            className={`secondary-action mini ${kpiQuickOpen ? 'active' : ''}`}
            onClick={() => setKpiQuickOpen(!kpiQuickOpen)}
            title="KPI 추가 (이번 주 업무의 최상단 레이어로 표시됨)"
          >
            <Plus size={13} />
            KPI
          </button>
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

      {expanded && kpiQuickOpen && (
        <div className="flow-kpi-quick-add">
          <span className="flow-kpi-quick-label">차트에 KPI 추가</span>
          <select
            className="flow-kpi-pick-select"
            value=""
            onChange={handlePinKpi}
          >
            <option value="">팀장홈에서 등록한 KPI 선택…</option>
            {(() => {
              // 부서별로 그룹핑 + 이미 차트에 있는 것은 제외
              const usedLabels = new Set([
                ...tasks.map(t => (t.kpi || t.impact || '').trim()).filter(Boolean),
                ...Array.from(pinnedKpiLabels),
              ])
              const available = kpis.filter(k => !usedLabels.has(k.label))
              if (available.length === 0) {
                return <option value="" disabled>모든 KPI가 이미 차트에 있습니다</option>
              }
              const groups = { mine: [], all: [], others: [] }
              available.forEach(k => {
                const sub = k.subteam || 'all'
                if (sub === 'all') groups.all.push(k)
                else groups.others.push(k) // 본인 부서 정보 없음 → 부서별
              })
              const blocks = []
              if (groups.all.length > 0) {
                blocks.push(
                  <optgroup key="all" label="전사 공통">
                    {groups.all.map(k => <option key={k.id} value={k.label}>{k.label}</option>)}
                  </optgroup>,
                )
              }
              const byTeam = {}
              groups.others.forEach(k => {
                const key = k.subteam || 'misc'
                if (!byTeam[key]) byTeam[key] = []
                byTeam[key].push(k)
              })
              Object.entries(byTeam).forEach(([sub, items]) => {
                blocks.push(
                  <optgroup key={sub} label={getSubteamLabel(sub) || '미분류'}>
                    {items.map(k => <option key={k.id} value={k.label}>{k.label}</option>)}
                  </optgroup>,
                )
              })
              return blocks
            })()}
          </select>
          <small className="flow-kpi-quick-hint">
            팀장홈에서 등록된 KPI만 추가 가능 · 신규 KPI는 팀장홈 KPI 바에서 만들어주세요
          </small>
          {pinnedKpiLabels.size > 0 && (
            <div className="flow-kpi-pinned-list">
              <small>핀한 KPI:</small>
              {Array.from(pinnedKpiLabels).map(label => (
                <span key={label} className="flow-kpi-pinned-chip">
                  {label}
                  <button type="button" onClick={() => handleUnpinKpi(label)} aria-label="제거">×</button>
                </span>
              ))}
            </div>
          )}
          <button
            type="button"
            className="ghost-action"
            onClick={() => setKpiQuickOpen(false)}
          >
            닫기
          </button>
        </div>
      )}

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
            kpis={kpis}
            onAddRelation={handleAddRelation}
            onHide={handleHide}
            onResetRelations={handleResetRelations}
            onDelete={onDeleteTask ? handleDelete : null}
            onDeleteKpi={(onUpdateTask || onUpdateTasksBatch) ? handleDeleteKpi : null}
            onChangeKpi={(onUpdateTask || onUpdateTasksBatch) ? handleChangeKpi : null}
            onRemoveFromChart={(onUpdateTask || onUpdateTasksBatch) ? handleRemoveFromChart : null}
          />
        )
      )}

      {expanded && activeSnapshot && (
        <div className="flow-snapshot-banner">
          <span>스냅샷 보는 중: <strong>{activeSnapshot.name}</strong> · 변경은 원본 업무흐름도에 반영되지 않습니다</span>
          <button type="button" className="ghost-action" onClick={handleGoLive}>
            기존 업무흐름도로 돌아가기
          </button>
        </div>
      )}

      {expanded && (
        <div className="flow-collapsible-list">
          {/* 스냅샷 관리 (게시글형 접이식) */}
          <CollapsibleSection
            title={`스냅샷 관리${snapshots.length > 0 ? ` (${snapshots.length}건 저장됨)` : ''}`}
            isOpen={openSection === 'snapshots'}
            onToggle={() => setOpenSection(openSection === 'snapshots' ? null : 'snapshots')}
          >
            {snapshotError && <div className="alert error slim" style={{ whiteSpace: 'pre-wrap' }}>{snapshotError}</div>}
            <div className="flow-snapshot-input-row">
              <input
                type="text"
                className="flow-snapshot-name-input"
                list="flow-snapshots-datalist"
                placeholder="스냅샷 이름 입력 (예: 5월 보고용, 현대홈쇼핑 PT용)"
                value={snapshotInputName}
                onChange={event => setSnapshotInputName(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    handleSaveSnapshotByName()
                  }
                }}
              />
              <datalist id="flow-snapshots-datalist">
                {snapshots.map(s => <option key={s.id} value={s.name} />)}
              </datalist>
            </div>
            <div className="flow-snapshot-input-actions">
              <button
                type="button"
                className="primary-action mini"
                onClick={handleSaveSnapshotByName}
                disabled={!snapshotInputName.trim()}
                title={matchingSnapshot ? '같은 이름의 스냅샷 덮어쓰기' : '새 스냅샷으로 저장'}
              >
                <Save size={13} />
                {matchingSnapshot ? '덮어쓰기' : '새로 저장'}
              </button>
              <button
                type="button"
                className="ghost-action"
                onClick={handleLoadByName}
                disabled={!matchingSnapshot || activeSnapshotId === matchingSnapshot.id}
                title="이 이름의 스냅샷 불러오기"
              >
                불러오기
              </button>
              <button
                type="button"
                className="ghost-action danger"
                onClick={handleDeleteSnapshotByName}
                disabled={!matchingSnapshot}
                title="이 이름의 스냅샷 삭제"
              >
                <Trash2 size={13} /> 삭제
              </button>
              {activeSnapshot && (
                <button
                  type="button"
                  className="ghost-action"
                  onClick={handleGoLive}
                  title="활성 스냅샷 해제하고 기존 업무흐름도로 돌아가기"
                >
                  기존 흐름도로
                </button>
              )}
            </div>
            {snapshots.length > 0 && (
              <ul className="flow-snapshot-quick-list">
                {snapshots.map(s => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={s.id === activeSnapshotId ? 'active' : ''}
                      onClick={() => { setSnapshotInputName(s.name); setActiveSnapshotId(s.id) }}
                    >
                      {s.name}
                      <small>· {(s.hidden || []).length}개 숨김</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleSection>

          {/* 숨겨진 업무 (게시글형 접이식) */}
          {hiddenTasks.length > 0 && (
            <CollapsibleSection
              title={activeSnapshot
                ? `스냅샷 숨김 ${hiddenTasks.length}건 (원본 흐름도 영향 없음)`
                : `숨겨진 업무 (${hiddenTasks.length}건)`}
              isOpen={openSection === 'hidden'}
              onToggle={() => setOpenSection(openSection === 'hidden' ? null : 'hidden')}
            >
              <ul className="flow-hidden-inline-list">
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
            </CollapsibleSection>
          )}
        </div>
      )}
    </section>
  )
}

function CollapsibleSection({ title, isOpen, onToggle, children }) {
  return (
    <div className={`flow-collapsible ${isOpen ? 'open' : ''}`}>
      <button
        type="button"
        className="flow-collapsible-head"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <span>{title}</span>
        {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {isOpen && <div className="flow-collapsible-body">{children}</div>}
    </div>
  )
}

function FlowMermaidInteractive({
  chart,
  tasks,
  displayTasks,
  allTasks,
  idMap,
  kpiMap,
  kpis,
  onAddRelation,
  onHide,
  onResetRelations,
  onDelete,
  onDeleteKpi,
  onChangeKpi,
  onRemoveFromChart,
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

    // 모든 노드(task + KPI)에 pointer 커서, layer anchor는 숨김
    wrap.querySelectorAll('.node').forEach(node => {
      const sanitized = node.getAttribute('data-id') || extractIdFromMermaid(node.getAttribute('id') || '')
      if (!sanitized) return
      if (sanitized === '__layer_anchor__') {
        node.style.display = 'none'
        return
      }
      if (sanitized.startsWith('kpi_')) {
        if (kpiMap?.has(sanitized)) node.style.cursor = 'pointer'
      } else if (idMap.has(sanitized)) {
        node.style.cursor = 'pointer'
      }
    })

    // layer anchor와 연결된 점선 엣지도 숨김
    wrap.querySelectorAll('.edgePath, .edgePaths > path, .flowchart-link').forEach(edge => {
      const id = edge.getAttribute('id') || ''
      if (id.includes('__layer_anchor__')) {
        edge.style.display = 'none'
      }
    })

    // 이벤트 위임: wrap 한 곳에만 부착 → foreignObject 안 HTML 클릭도 잡힘
    function handleWrapClick(event) {
      const node = event.target.closest('.node')
      if (!node) return
      const sanitized = node.getAttribute('data-id') || extractIdFromMermaid(node.getAttribute('id') || '')
      if (!sanitized) return
      if (sanitized === '__layer_anchor__') return

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

  const activeMenuTask = (menu && menu.kind === 'task')
    ? (tasks.find(t => t.id === menu.taskId) || displayTasks.find(t => t.id === menu.taskId))
    : null
  const isMenuHistoryItem = (menu && menu.kind === 'task' && activeMenuTask)
    ? !tasks.some(t => t.id === menu.taskId)
    : false

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
        isMenuHistoryItem ? (
          <HistoryClickMenu
            task={activeMenuTask}
            x={menu.x}
            y={menu.y}
            onClose={() => setMenu(null)}
            onRemoveFromChart={onRemoveFromChart ? () => { onRemoveFromChart(menu.taskId); setMenu(null) } : null}
          />
        ) : (
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
        )
      )}
      {menu && menu.kind === 'kpi' && (
        <KpiClickMenu
          kpiLabel={menu.kpiLabel}
          kpis={kpis}
          tasks={tasks}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onDelete={onDeleteKpi ? () => { onDeleteKpi(menu.kpiLabel); setMenu(null) } : null}
          onChangeKpi={onChangeKpi ? newLabel => { onChangeKpi(menu.kpiLabel, newLabel); setMenu(null) } : null}
        />
      )}
    </div>
  )
}

function HistoryClickMenu({ task, x, y, onClose, onRemoveFromChart }) {
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
        완료업무 히스토리 항목 — 차트에 보이는 이유는 이번 주 업무의 부모/병행으로 연결되어 있기 때문
      </div>
      <div className="flow-node-menu-actions">
        {onRemoveFromChart && (
          <button
            type="button"
            className="ghost-action danger"
            onClick={onRemoveFromChart}
            title="이번 주 업무에서 이 항목을 부모/병행으로 가진 모든 연결을 끊음 (히스토리 데이터는 보존)"
          >
            <Trash2 size={13} /> 차트에서 제외
          </button>
        )}
      </div>
    </div>
  )
}

function KpiClickMenu({ kpiLabel, kpis = [], tasks, x, y, onClose, onDelete, onChangeKpi }) {
  const linkedTasks = tasks.filter(t => (t.kpi || t.impact) === kpiLabel)
  // 클릭한 KPI의 부서 찾기 (kpis 컬렉션에서 매칭)
  const currentKpiDef = kpis.find(k => k.label === kpiLabel)
  const currentSubteam = currentKpiDef?.subteam || ''
  // 같은 부서의 다른 KPI 후보 (전사 공통 항상 포함)
  const sameSubteamCandidates = kpis.filter(k =>
    k.label !== kpiLabel && (k.subteam === currentSubteam || k.subteam === '' || !k.subteam),
  )
  const subteamLabel = currentKpiDef
    ? (currentSubteam ? `부서: ${getSubteamLabel(currentSubteam)}` : '전사 공통')
    : '미등록 KPI'

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
        {subteamLabel} · 연결된 이번 주 업무 {linkedTasks.length}개
      </div>
      {linkedTasks.length > 0 && (
        <ul className="flow-node-menu-linked">
          {linkedTasks.map(t => (
            <li key={t.id}>{t.title}</li>
          ))}
        </ul>
      )}

      {/* KPI 변경 드롭다운 — 같은 부서의 다른 KPI로 일괄 변경 */}
      {onChangeKpi && (
        <div className="flow-node-menu-row">
          <span className="flow-node-menu-label">KPI 변경</span>
          <select
            disabled={sameSubteamCandidates.length === 0}
            value=""
            onChange={event => { const v = event.target.value; if (v) onChangeKpi(v) }}
          >
            <option value="">
              {sameSubteamCandidates.length === 0
                ? '같은 부서 다른 KPI 없음'
                : `다른 KPI 선택 (${sameSubteamCandidates.length}건)`}
            </option>
            {sameSubteamCandidates.map(k => (
              <option key={k.id} value={k.label}>
                {k.label}
                {k.subteam !== currentSubteam ? ' (전사)' : ''}
              </option>
            ))}
          </select>
        </div>
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

function buildChart(tasks, currentTaskIds = null, pinnedKpiLabels = null) {
  if (tasks.length === 0 && (!pinnedKpiLabels || pinnedKpiLabels.size === 0)) {
    return 'graph TD\n  empty["연결된 업무가 없습니다"]'
  }

  const taskIds = new Set(tasks.map(t => t.id))
  // currentTaskIds 안 주어지면 모든 task를 "현재"로 간주 (이전 호환)
  const isCurrent = id => (currentTaskIds ? currentTaskIds.has(id) : true)
  const lines = ['graph TD']

  // KPI 가상 노드 — 이번 주 활성 task의 KPI만 (history 부모는 제외) + 핀한 KPI
  const kpiLabels = new Set()
  tasks.forEach(t => {
    if (!isCurrent(t.id)) return
    const label = (t.kpi || t.impact || '').trim()
    if (label) kpiLabels.add(label)
  })
  if (pinnedKpiLabels) {
    pinnedKpiLabels.forEach(label => kpiLabels.add(label))
  }
  const kpiId = label => 'kpi_' + sanitizeId(label)

  // 부모 화살표 (모든 표시 task — extras 포함)
  tasks.forEach(t => {
    ;(t.parentIds || []).forEach(pid => {
      if (taskIds.has(pid)) {
        lines.push(`  ${sanitizeId(pid)} --> ${sanitizeId(t.id)}`)
      }
    })
  })

  // KPI → root task 화살표 — 이번 주 활성 task 중 부모가 트리 안에 없는 것만
  tasks.forEach(t => {
    if (!isCurrent(t.id)) return
    const label = (t.kpi || t.impact || '').trim()
    if (!label) return
    const hasParentInTree = (t.parentIds || []).some(pid => taskIds.has(pid))
    if (hasParentInTree) return
    lines.push(`  ${kpiId(label)} ==> ${sanitizeId(t.id)}`)
  })

  // KPI를 최상단 레이어에 강제로 배치 — KPI 없는 root task가 KPI보다 위로 올라가지 않게
  // KPI가 있을 때만 이런 처리 (없으면 일반 layout)
  if (kpiLabels.size > 0) {
    // KPI 라벨 없는 이번 주 root task를 가상 KPI에 약하게 연결 → KPI들과 같은 row로 정렬되되
    // 실제 화살표는 안 보이도록 invisible style
    const orphanRoots = []
    tasks.forEach(t => {
      if (!isCurrent(t.id)) return
      const label = (t.kpi || t.impact || '').trim()
      if (label) return
      const hasParentInTree = (t.parentIds || []).some(pid => taskIds.has(pid))
      if (hasParentInTree) return
      orphanRoots.push(t)
    })
    if (orphanRoots.length > 0) {
      // 가상 anchor 노드 (보이지 않는 더미) 만들고 orphan root 위에 두기
      lines.push('  __layer_anchor__[" "]:::layerAnchor')
      orphanRoots.forEach(t => {
        lines.push(`  __layer_anchor__ -.- ${sanitizeId(t.id)}`)
      })
    }
  }

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
  lines.push('  classDef layerAnchor fill:transparent,stroke:transparent,color:transparent')

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
