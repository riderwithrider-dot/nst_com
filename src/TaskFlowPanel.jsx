// 업무 흐름도 (F안: Mermaid + 노드 클릭 메뉴)
// - 리스트형 연결 편집 UI 제거
// - Mermaid 노드를 직접 클릭 → 작은 메뉴: 이전 업무 추가 (KPI 포함) / 병행 업무 추가 / 숨김
// - 사용자별 숨김 상태는 기존대로 task.hiddenInFlow 사용 (이번 주 업무 doc 안에 보관)

import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ArrowDown, ArrowRight, ArrowUp, BookmarkPlus, ChevronDown, ChevronUp, EyeOff, MinusCircle, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react'
import { STATUS_META, SUBTEAMS, DEFAULT_TEAM_ID, getSubteamLabel } from './lib/constants'
import { createKpi, deleteFlowSnapshot, saveFlowSnapshot, subscribeFlowSnapshots } from './lib/db'
import { generateId } from './lib/date'

// Mermaid 의존 제거 — 자체 SVG 기반 레이아웃 (computeFlowLayout) 사용
// rank/x/y 100% 예측 가능, ELK/dagre 같은 1.4MB 청크 로드 X

export default function TaskFlowPanel({ user, memberProfile, tasks = [], history = [], kpis = [], previewTask = null, onUpdateTask, onUpdateTasksBatch, onUpdateHistoryTask, onDeleteTask }) {
  const userSubteam = memberProfile?.subteam || ''
  const [expanded, setExpanded] = useState(true)
  const [snapshots, setSnapshots] = useState([])
  const [activeSnapshotId, setActiveSnapshotId] = useState(null)
  const [snapshotError, setSnapshotError] = useState('')
  const [snapshotInputName, setSnapshotInputName] = useState('')
  // 접이식 게시글형 섹션 — 기본 모두 닫힘
  const [openSection, setOpenSection] = useState(null) // 'hidden' | 'snapshots' | null
  // KPI 빠른 추가 영역 토글
  const [kpiQuickOpen, setKpiQuickOpen] = useState(false)
  // 차트에 임시 핀(pin)한 KPI 라벨 (이번 주 task가 안 써도 차트에 표시)
  const [pinnedKpiLabels, setPinnedKpiLabels] = useState(() => new Set())

  // === 되돌리기(undo) 스택 ===
  // 각 entry: { label, patches: [{ taskId, prevPatch }, ...] }
  // 최대 30개 보관 (메모리 제한)
  const [undoStack, setUndoStack] = useState([])


  function pushUndo(label, patches) {
    if (!patches || patches.length === 0) return
    setUndoStack(prev => {
      const next = [...prev, { label, patches, ts: Date.now() }]
      // 30개 초과 시 오래된 것 제거
      return next.length > 30 ? next.slice(next.length - 30) : next
    })
  }

  // 영향받는 task의 현재 필드 값을 prevPatch로 캡처
  function snapshotPatch(taskId, fields) {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return null
    const prev = {}
    fields.forEach(f => {
      // 배열은 복사
      const v = task[f]
      prev[f] = Array.isArray(v) ? [...v] : (v ?? null)
    })
    return { taskId, prevPatch: prev }
  }

  async function handleUndo() {
    if (undoStack.length === 0) return
    if (blockIfSnapshot()) return
    const last = undoStack[undoStack.length - 1]
    setUndoStack(prev => prev.slice(0, -1))
    try {
      if (onUpdateTasksBatch) {
        await onUpdateTasksBatch(last.patches.map(p => ({ taskId: p.taskId, patch: p.prevPatch })))
      } else if (onUpdateTask) {
        for (const p of last.patches) {
          // eslint-disable-next-line no-await-in-loop
          await onUpdateTask(p.taskId, p.prevPatch)
        }
      }
    } catch (err) {
      console.error('[흐름도 undo] 실패:', err)
      window.alert(`되돌리기 실패: ${err.message || '알 수 없는 오류'}`)
    }
  }

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

  // 스냅샷 활성 시: 저장된 taskSnapshots를 사용 (저장 당시 모습 그대로 — 원본 task 변경에 영향받지 않음)
  // 비활성 시: 현재 tasks 사용
  const effectiveTasks = useMemo(() => {
    if (activeSnapshot && Array.isArray(activeSnapshot.taskSnapshots) && activeSnapshot.taskSnapshots.length > 0) {
      return activeSnapshot.taskSnapshots
    }
    return tasks
  }, [activeSnapshot, tasks])

  const effectivePinnedKpiLabels = useMemo(() => {
    if (activeSnapshot && Array.isArray(activeSnapshot.pinnedKpis)) {
      return new Set(activeSnapshot.pinnedKpis)
    }
    return pinnedKpiLabels
  }, [activeSnapshot, pinnedKpiLabels])

  // 스냅샷 활성 시 그 hidden 목록을 우선, 아니면 task.hiddenInFlow 사용
  const effectiveHiddenIds = useMemo(() => {
    if (activeSnapshot) return new Set(activeSnapshot.hidden || [])
    return new Set(effectiveTasks.filter(t => t.hiddenInFlow).map(t => t.id))
  }, [activeSnapshot, effectiveTasks])

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
      // 저장 당시 차트의 모든 task 관계 상태를 캡처 — 원본 task 변경에도 스냅샷 모양 그대로 유지
      const taskSnapshots = effectiveTasks.map(t => ({
        id: t.id,
        title: t.title || '',
        parentIds: [...(t.parentIds || [])],
        siblingIds: [...(t.siblingIds || [])],
        kpi: t.kpi || '',
        impact: t.impact || '',
        status: t.status || 'todo',
        priority: t.priority || 'normal',
        isFocus: !!t.isFocus,
        hiddenInFlow: !!t.hiddenInFlow,
      }))
      const payload = {
        name,
        hidden: Array.from(effectiveHiddenIds),
        pinnedKpis: Array.from(effectivePinnedKpiLabels),
        taskSnapshots,
        snapshotVersion: 2, // v1 = hidden only, v2 = 전체 task 상태 포함
      }
      console.log('[스냅샷] 저장 시작:', { name, hiddenCount: effectiveHiddenIds.size, taskCount: taskSnapshots.length, uid: user.uid })
      if (matchingSnapshot) {
        const ok = window.confirm(`"${name}" 스냅샷이 이미 있습니다. 현재 화면 상태로 덮어쓸까요?`)
        if (!ok) return
        await saveFlowSnapshot(DEFAULT_TEAM_ID, user.uid, matchingSnapshot.id, payload)
        setActiveSnapshotId(matchingSnapshot.id)
        console.log('[스냅샷] 덮어쓰기 완료:', name)
      } else {
        const id = generateId('snap')
        await saveFlowSnapshot(DEFAULT_TEAM_ID, user.uid, id, payload)
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

  // 검색/조상 보강용 전체 task 풀 (effectiveTasks + 과거 history)
  // 스냅샷 활성 시: 저장된 taskSnapshots도 풀에 포함되어 부모 체인 lookup 가능
  const allTasks = useMemo(() => {
    const seen = new Set()
    return [...effectiveTasks, ...tasks, ...history.flatMap(w => w.items || [])].filter(t => {
      if (!t || seen.has(t.id)) return false
      // 휴지통/소프트 삭제된 task 제외 — 후보/연결 lookup에서 모두 안 보이게
      if (t.deletedAt) return false
      seen.add(t.id)
      return true
    })
  }, [effectiveTasks, tasks, history])

  const activeNonHidden = useMemo(() => {
    const base = effectiveTasks.filter(t => t.status !== 'done' && !effectiveHiddenIds.has(t.id))
    if (previewTask && previewTask.id) {
      return [...base, previewTask]
    }
    return base
  }, [effectiveTasks, effectiveHiddenIds, previewTask])
  const hiddenTasks = useMemo(
    () => effectiveTasks.filter(t => t.status !== 'done' && effectiveHiddenIds.has(t.id)),
    [effectiveTasks, effectiveHiddenIds],
  )

  // 차트에 표시될 모든 KPI 라벨 (현재 task가 쓰는 것 + 핀한 것)
  const allChartKpiLabels = useMemo(() => {
    const set = new Set()
    activeNonHidden.forEach(t => {
      const label = (t.kpi || t.impact || '').trim()
      if (label) set.add(label)
    })
    effectivePinnedKpiLabels.forEach(l => set.add(l))
    return set
  }, [activeNonHidden, effectivePinnedKpiLabels])

  // 다이어그램에 표시: 진행 중 + 부모 체인 + 차트 KPI에 연결된 history task
  const displayTasks = useMemo(() => {
    const ids = new Set(activeNonHidden.map(t => t.id))
    const extras = []
    // 1. 부모 체인 (완료/히스토리도 포함)
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
    // 2. 차트의 KPI에 연결된 history task (사용자가 하위 추가로 명시 연결)
    if (allChartKpiLabels.size > 0) {
      allTasks.forEach(t => {
        if (ids.has(t.id)) return
        const label = (t.kpi || t.impact || '').trim()
        if (!label || !allChartKpiLabels.has(label)) return
        ids.add(t.id)
        extras.push(t)
      })
    }
    return [...activeNonHidden, ...extras]
  }, [activeNonHidden, allTasks, allChartKpiLabels])

  const sortedTasks = useMemo(() => sortTasksByHierarchy(displayTasks), [displayTasks])

  // 이번 주 활성 task ID 셋 — KPI 노드 추출 시 history 부모(extras) 제외용
  const currentTaskIds = useMemo(
    () => new Set(activeNonHidden.map(t => t.id)),
    [activeNonHidden],
  )

  // chart/idMap/kpiMap 제거됨 — SVG 레이아웃은 FlowMermaidInteractive 안에서 직접 계산

  function blockIfSnapshot() {
    // 스냅샷 활성 상태에서도 편집 허용 — 원본 task 데이터만 변경되며 스냅샷 차트 모양은 그대로 유지됨
    // (이전엔 차단했으나 사용자 요청으로 클릭/편집 가능 + 원본은 그대로 형태 유지)
    return false
  }

  function handleAddRelation(taskId, kind, otherIdOrLabel) {
    if (!onUpdateTask) return
    if (blockIfSnapshot()) return
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    // KPI 추가 — kpi/impact 필드 설정
    if (kind === 'kpi') {
      if (!otherIdOrLabel) return
      const snap = snapshotPatch(taskId, ['kpi', 'impact'])
      if (snap) pushUndo('KPI 연결 변경 되돌리기', [snap])
      onUpdateTask(taskId, { kpi: otherIdOrLabel, impact: otherIdOrLabel })
      return
    }
    if (taskId === otherIdOrLabel) return
    const key = kind === 'parent' ? 'parentIds' : 'siblingIds'
    const exclude = kind === 'parent' ? 'siblingIds' : 'parentIds'
    const current = task[key] || []
    if (current.includes(otherIdOrLabel)) return

    // 병행 업무는 양방향 — 양쪽 task 모두 siblingIds에 서로 추가
    if (kind === 'sibling') {
      const otherTask = tasks.find(t => t.id === otherIdOrLabel)
      if (otherTask) {
        const otherSiblings = otherTask.siblingIds || []
        const otherParents = otherTask.parentIds || []
        const snaps = [
          snapshotPatch(taskId, [key, exclude]),
          snapshotPatch(otherIdOrLabel, ['siblingIds', 'parentIds']),
        ].filter(Boolean)
        if (snaps.length > 0) pushUndo('병행 업무 추가 되돌리기 (양방향)', snaps)
        const updates = [
          {
            taskId,
            patch: {
              [key]: [...current, otherIdOrLabel],
              [exclude]: (task[exclude] || []).filter(id => id !== otherIdOrLabel),
            },
          },
          {
            taskId: otherIdOrLabel,
            patch: {
              siblingIds: otherSiblings.includes(taskId) ? otherSiblings : [...otherSiblings, taskId],
              // 다른쪽이 우리를 parent로 가지고 있으면 그것도 제거 (parent + sibling 동시 X)
              parentIds: otherParents.filter(id => id !== taskId),
            },
          },
        ]
        if (onUpdateTasksBatch) {
          onUpdateTasksBatch(updates)
        } else {
          // fallback — 순차 적용
          for (const u of updates) onUpdateTask(u.taskId, u.patch)
        }
        return
      }
    }

    // 일반 (parent) — 단방향
    const snap = snapshotPatch(taskId, [key, exclude])
    if (snap) pushUndo(`${kind === 'parent' ? '이전 업무' : '병행 업무'} 추가 되돌리기`, [snap])
    onUpdateTask(taskId, {
      [key]: [...current, otherIdOrLabel],
      [exclude]: (task[exclude] || []).filter(id => id !== otherIdOrLabel),
    })
  }

  // 개별 관계 제거 — 이전 업무(parent) / 병행 업무(sibling) / KPI 한 건만 끊기
  function handleRemoveRelation(taskId, kind, otherIdOrLabel) {
    if (!onUpdateTask) return
    if (blockIfSnapshot()) return
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    if (kind === 'kpi') {
      const snap = snapshotPatch(taskId, ['kpi', 'impact'])
      if (snap) pushUndo('KPI 연결 끊기 되돌리기', [snap])
      onUpdateTask(taskId, { kpi: '', impact: '' })
      return
    }

    // 하위 업무 제거 — child의 parentIds에서 현재 task 제거 (단방향, 자식의 부모 link 끊기)
    if (kind === 'child') {
      const childTask = tasks.find(t => t.id === otherIdOrLabel)
      if (!childTask) return
      const childParents = childTask.parentIds || []
      if (!childParents.includes(taskId)) return
      const snap = snapshotPatch(otherIdOrLabel, ['parentIds'])
      if (snap) pushUndo('하위 업무 연결 끊기 되돌리기', [snap])
      onUpdateTask(otherIdOrLabel, {
        parentIds: childParents.filter(id => id !== taskId),
      })
      return
    }

    // 병행 업무 양방향 제거 — 비대칭 데이터도 안전하게 양쪽에서 제거
    if (kind === 'sibling') {
      const otherTask = tasks.find(t => t.id === otherIdOrLabel)
      const mySiblings = task.siblingIds || []
      const otherSiblings = otherTask ? (otherTask.siblingIds || []) : []
      if (!mySiblings.includes(otherIdOrLabel) && !otherSiblings.includes(taskId)) return
      const snaps = [
        snapshotPatch(taskId, ['siblingIds']),
        otherTask ? snapshotPatch(otherIdOrLabel, ['siblingIds']) : null,
      ].filter(Boolean)
      if (snaps.length > 0) pushUndo('병행 업무 제거 되돌리기 (양방향)', snaps)
      const updates = []
      if (mySiblings.includes(otherIdOrLabel)) {
        updates.push({ taskId, patch: { siblingIds: mySiblings.filter(id => id !== otherIdOrLabel) } })
      }
      if (otherTask && otherSiblings.includes(taskId)) {
        updates.push({ taskId: otherIdOrLabel, patch: { siblingIds: otherSiblings.filter(id => id !== taskId) } })
      }
      if (updates.length > 1 && onUpdateTasksBatch) {
        onUpdateTasksBatch(updates)
      } else {
        for (const u of updates) onUpdateTask(u.taskId, u.patch)
      }
      return
    }

    const key = kind === 'parent' ? 'parentIds' : 'siblingIds'
    const current = task[key] || []
    if (!current.includes(otherIdOrLabel)) return

    // 일반 (parent) — 단방향
    const snap = snapshotPatch(taskId, [key])
    if (snap) pushUndo(`${kind === 'parent' ? '이전 업무' : '병행 업무'} 제거 되돌리기`, [snap])
    onUpdateTask(taskId, {
      [key]: current.filter(id => id !== otherIdOrLabel),
    })
  }

  function handleHide(taskId) {
    if (!onUpdateTask) return
    if (blockIfSnapshot()) return
    const snap = snapshotPatch(taskId, ['hiddenInFlow'])
    if (snap) pushUndo('숨김 되돌리기', [snap])
    onUpdateTask(taskId, { hiddenInFlow: true })
  }

  function handleUnhide(taskId) {
    if (!onUpdateTask) return
    if (blockIfSnapshot()) return
    const snap = snapshotPatch(taskId, ['hiddenInFlow'])
    if (snap) pushUndo('숨김 해제 되돌리기', [snap])
    onUpdateTask(taskId, { hiddenInFlow: false })
  }

  function handleResetRelations(taskId) {
    if (!onUpdateTask) return
    if (blockIfSnapshot()) return
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    // 병행 업무는 양방향 — 이 task가 가진 sibling 각각의 siblingIds에서도 자기 자신 제거
    const oldSiblings = task.siblingIds || []
    const otherUpdates = oldSiblings
      .map(sid => {
        const other = tasks.find(t => t.id === sid)
        if (!other) return null
        return {
          taskId: sid,
          patch: { siblingIds: (other.siblingIds || []).filter(id => id !== taskId) },
        }
      })
      .filter(Boolean)

    const snap = snapshotPatch(taskId, ['hiddenInFlow', 'parentIds', 'siblingIds'])
    const otherSnaps = oldSiblings
      .map(sid => snapshotPatch(sid, ['siblingIds']))
      .filter(Boolean)
    const allSnaps = [snap, ...otherSnaps].filter(Boolean)
    if (allSnaps.length > 0) pushUndo('연결 초기화 되돌리기 (양방향)', allSnaps)

    const updates = [
      { taskId, patch: { hiddenInFlow: false, parentIds: [], siblingIds: [] } },
      ...otherUpdates,
    ]
    if (onUpdateTasksBatch && updates.length > 1) {
      onUpdateTasksBatch(updates)
    } else {
      for (const u of updates) onUpdateTask(u.taskId, u.patch)
    }
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
      window.alert('이 업무를 이전 업무/병행 업무로 가진 이번 주 업무가 없습니다.')
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
    const undoSnaps = affected.map(t => snapshotPatch(t.id, ['kpi', 'impact'])).filter(Boolean)
    if (undoSnaps.length > 0) pushUndo(`KPI "${kpiLabel}" 모두 끊기 되돌리기`, undoSnaps)
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

  // KPI에서 task 한 건만 분리 — 그 task의 kpi/impact 필드를 비움
  async function handleDisconnectTaskFromKpi(taskId) {
    if (!taskId) return
    if (blockIfSnapshot()) return
    const snap = snapshotPatch(taskId, ['kpi', 'impact'])
    if (snap) pushUndo('KPI 연결 끊기 되돌리기', [snap])
    if (onUpdateTask) {
      await onUpdateTask(taskId, { kpi: '', impact: '' })
    }
  }

  // KPI에 하위 task 추가 (해당 task의 kpi 필드를 이 KPI 라벨로 설정)
  // taskWeekKey가 있으면 history task로 간주 → 그 주차 doc 업데이트
  async function handleAddTaskToKpi(kpiLabel, taskId, taskWeekKey = null) {
    if (!kpiLabel || !taskId) return
    if (blockIfSnapshot()) return
    const inCurrentWeek = tasks.some(t => t.id === taskId)
    if (inCurrentWeek) {
      if (onUpdateTask) {
        await onUpdateTask(taskId, { kpi: kpiLabel, impact: kpiLabel })
      }
    } else {
      // history task — 해당 주차 doc 업데이트 (완료 status는 그대로 유지, 그래서 차트에서 초록색으로 표시됨)
      if (!taskWeekKey) {
        window.alert(`히스토리 업무의 주차 정보를 알 수 없어 자동 연결이 불가합니다.`)
        return
      }
      if (onUpdateHistoryTask) {
        await onUpdateHistoryTask(taskWeekKey, taskId, { kpi: kpiLabel, impact: kpiLabel })
      } else {
        window.alert('히스토리 업데이트 기능이 제공되지 않습니다. 새로고침 후 다시 시도하세요.')
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
    const undoSnaps = affected.map(t => snapshotPatch(t.id, ['kpi', 'impact'])).filter(Boolean)
    if (undoSnaps.length > 0) pushUndo(`KPI 변경 ${oldLabel} → ${newLabel} 되돌리기`, undoSnaps)
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
            className="ghost-action mini flow-undo-btn"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            title={undoStack.length > 0
              ? `되돌리기: ${undoStack[undoStack.length - 1].label} (${undoStack.length}개 누적)`
              : '되돌릴 변경 사항이 없습니다'}
          >
            <RotateCcw size={13} />
            되돌리기{undoStack.length > 0 ? ` (${undoStack.length})` : ''}
          </button>
          <button
            type="button"
            className={`secondary-action mini ${kpiQuickOpen ? 'active' : ''}`}
            onClick={() => setKpiQuickOpen(!kpiQuickOpen)}
            title="KPI 추가 (이번 주 업무의 최상단 레이어로 표시됨)"
          >
            <Plus size={13} />
            KPI
          </button>
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
            <option value="">
              {userSubteam ? `${getSubteamLabel(userSubteam)} 팀 KPI 선택…` : '내 부서 KPI 선택…'}
            </option>
            {(() => {
              // 본인 부서 KPI + 전사 공통만 노출, 이미 차트에 있는 것은 제외
              const usedLabels = new Set([
                ...tasks.map(t => (t.kpi || t.impact || '').trim()).filter(Boolean),
                ...Array.from(pinnedKpiLabels),
              ])
              const available = kpis.filter(k => {
                if (usedLabels.has(k.label)) return false
                const sub = k.subteam || ''
                // 본인 부서 KPI 또는 전사 공통(부서 미지정)만
                return sub === userSubteam || !sub || sub === 'all'
              })
              if (available.length === 0) {
                if (kpis.length === 0) {
                  return <option value="" disabled>등록된 KPI가 없습니다 — 홈에서 먼저 등록</option>
                }
                return <option value="" disabled>{userSubteam ? `${getSubteamLabel(userSubteam)} 팀 KPI가 모두 차트에 있거나 없음` : '내 부서 KPI 없음'}</option>
              }
              // 전사 공통과 내 부서 KPI 분리해서 그룹화
              const myTeam = available.filter(k => k.subteam === userSubteam && k.subteam)
              const allTeam = available.filter(k => !k.subteam || k.subteam === 'all')
              const blocks = []
              if (myTeam.length > 0) {
                blocks.push(
                  <optgroup key="mine" label={`내 부서 (${getSubteamLabel(userSubteam)})`}>
                    {myTeam.map(k => <option key={k.id} value={k.label}>{k.label}</option>)}
                  </optgroup>,
                )
              }
              if (allTeam.length > 0) {
                blocks.push(
                  <optgroup key="all" label="전사 공통">
                    {allTeam.map(k => <option key={k.id} value={k.label}>{k.label}</option>)}
                  </optgroup>,
                )
              }
              return blocks
            })()}
          </select>
          <small className="flow-kpi-quick-hint">
            {userSubteam
              ? `내 부서(${getSubteamLabel(userSubteam)}) KPI + 전사 공통만 표시 · 신규 KPI는 홈 KPI 바에서 만들어주세요`
              : '신규 KPI는 홈 KPI 바에서 만들어주세요'}
          </small>
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
            진행 중 업무가 없습니다. 이번 주 업무를 등록하면 여기에 흐름도가 표시되고, 노드를 클릭해 이전 업무/병행 업무/숨김을 설정할 수 있습니다.
          </p>
        ) : (
          <FlowMermaidInteractive
            tasks={tasks}
            history={history}
            displayTasks={sortedTasks}
            allTasks={allTasks}
            kpis={kpis}
            pinnedKpiLabels={pinnedKpiLabels}
            currentUid={user?.uid || ''}
            onAddRelation={handleAddRelation}
            onRemoveRelation={handleRemoveRelation}
            onHide={handleHide}
            onResetRelations={handleResetRelations}
            onDelete={onDeleteTask ? handleDelete : null}
            onDeleteKpi={(onUpdateTask || onUpdateTasksBatch) ? handleDeleteKpi : null}
            onChangeKpi={(onUpdateTask || onUpdateTasksBatch) ? handleChangeKpi : null}
            onAddTaskToKpi={(onUpdateTask || onUpdateHistoryTask) ? handleAddTaskToKpi : null}
            onDisconnectTaskFromKpi={onUpdateTask ? handleDisconnectTaskFromKpi : null}
            onUnpinKpi={handleUnpinKpi}
            onRemoveFromChart={(onUpdateTask || onUpdateTasksBatch) ? handleRemoveFromChart : null}
          />
        )
      )}

      {expanded && activeSnapshot && (
        <div className="flow-snapshot-banner">
          <span>
            📸 스냅샷 보는 중: <strong>{activeSnapshot.name}</strong>
            {' · '}
            {activeSnapshot.snapshotVersion >= 2
              ? '저장 당시 차트 모습 그대로 (원본 task 변경에 영향 없음). 노드 클릭/편집은 원본에 반영됨'
              : '구버전 스냅샷(숨김 정보만 저장)'}
          </span>
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

// === 자체 SVG 흐름도 layout 계산 ===
// rank: 0=KPI, 1=KPI 직속 task, 2+=하위. sibling은 같은 rank로 강제.
// 반환: { nodes, edges, width, height }
function computeFlowLayout(tasks, kpiLabels, pinnedSet) {
  const NODE_W = 160
  const NODE_H = 44
  const KPI_W = 180
  const KPI_H = 40
  const ROW_GAP = 80
  const COL_GAP = 24

  // 1. 노드 정의: KPI + tasks
  const allKpis = new Set()
  tasks.forEach(t => {
    const label = (t.kpi || t.impact || '').trim()
    if (label) allKpis.add(label)
  })
  if (pinnedSet) pinnedSet.forEach(l => allKpis.add(l))

  const nodes = []
  const nodesById = new Map()

  Array.from(allKpis).forEach(label => {
    const id = `__kpi__${label}`
    const node = { id, type: 'kpi', label, rank: 0, x: 0, y: 0, w: KPI_W, h: KPI_H }
    nodes.push(node); nodesById.set(id, node)
  })
  tasks.forEach(t => {
    const node = { id: t.id, type: 'task', task: t, label: t.title || '', rank: -1, x: 0, y: 0, w: NODE_W, h: NODE_H }
    nodes.push(node); nodesById.set(t.id, node)
  })

  const taskIds = new Set(tasks.map(t => t.id))

  // 2. rank 결정 — BFS
  // KPI rank=0. task rank = max(parent task rank) + 1, 부모 task 없으면 KPI 있으면 rank=1, 없으면 rank=1 (orphan)
  function computeRank(taskId, visiting = new Set()) {
    if (visiting.has(taskId)) return 1 // cycle 방지
    visiting.add(taskId)
    const t = tasks.find(x => x.id === taskId)
    if (!t) return 1
    const node = nodesById.get(taskId)
    if (node.rank >= 0) return node.rank
    const parentTaskIds = (t.parentIds || []).filter(pid => taskIds.has(pid))
    if (parentTaskIds.length > 0) {
      let maxParentRank = 0
      parentTaskIds.forEach(pid => {
        const r = computeRank(pid, new Set(visiting))
        if (r > maxParentRank) maxParentRank = r
      })
      node.rank = maxParentRank + 1
    } else {
      // 부모 task 없음 — KPI 있으면 rank 1, 없으면 rank 1 (orphan도 동일 layer)
      node.rank = 1
    }
    return node.rank
  }
  tasks.forEach(t => computeRank(t.id))

  // 3. Sibling 정렬 — A-B siblingPair → 같은 rank로 강제
  // 단순화: 한쪽이 더 높은 rank면 양쪽을 max로 맞춤. 반복하여 stable해질 때까지.
  let stable = false
  let iter = 0
  while (!stable && iter < 5) {
    stable = true
    iter += 1
    tasks.forEach(t => {
      const tNode = nodesById.get(t.id)
      ;(t.siblingIds || []).forEach(sid => {
        if (!taskIds.has(sid)) return
        const sNode = nodesById.get(sid)
        if (!sNode) return
        const maxR = Math.max(tNode.rank, sNode.rank)
        if (tNode.rank !== maxR) { tNode.rank = maxR; stable = false }
        if (sNode.rank !== maxR) { sNode.rank = maxR; stable = false }
      })
    })
  }

  // 4. rank별 그룹화 후 x 위치 결정
  const byRank = {}
  nodes.forEach(n => {
    if (n.rank < 0) n.rank = 1
    if (!byRank[n.rank]) byRank[n.rank] = []
    byRank[n.rank].push(n)
  })

  // 각 rank 안에서 정렬:
  //  - KPI는 알파벳 순으로 task보다 앞 (기존 정책)
  //  - task는 sibling 연결로 cluster 형성 → cluster 내부는 createdAt 순,
  //    cluster 간은 최소 createdAt 순 (인접한 sibling이 가운데 무관 노드를 통과하지 않게)
  Object.keys(byRank).forEach(r => {
    const rankNodes = byRank[r]
    const kpiNodes = rankNodes
      .filter(n => n.type === 'kpi')
      .sort((a, b) => a.label.localeCompare(b.label))
    const taskNodes = rankNodes.filter(n => n.type !== 'kpi')

    // sibling 인접 맵 (양방향 보강 — 비대칭 데이터 대응)
    const sameRankIds = new Set(taskNodes.map(n => n.id))
    const adj = new Map()
    taskNodes.forEach(n => adj.set(n.id, new Set()))
    taskNodes.forEach(n => {
      ;(n.task?.siblingIds || []).forEach(sid => {
        if (sameRankIds.has(sid)) {
          adj.get(n.id).add(sid)
          adj.get(sid)?.add(n.id)
        }
      })
    })

    // BFS로 cluster 형성
    const visited = new Set()
    const clusters = []
    taskNodes.forEach(seed => {
      if (visited.has(seed.id)) return
      const cluster = []
      const queue = [seed.id]
      while (queue.length > 0) {
        const id = queue.shift()
        if (visited.has(id)) continue
        visited.add(id)
        const node = taskNodes.find(x => x.id === id)
        if (node) cluster.push(node)
        adj.get(id)?.forEach(sid => {
          if (!visited.has(sid)) queue.push(sid)
        })
      }
      // cluster 내부 정렬: createdAt 오름차순
      cluster.sort((a, b) => {
        const ac = a.task?.createdAt || ''
        const bc = b.task?.createdAt || ''
        return ac.localeCompare(bc)
      })
      clusters.push(cluster)
    })

    // cluster 간 정렬: cluster의 가장 이른 createdAt 기준 (singleton도 동일)
    clusters.sort((c1, c2) => {
      const m1 = c1[0]?.task?.createdAt || ''
      const m2 = c2[0]?.task?.createdAt || ''
      return m1.localeCompare(m2)
    })

    byRank[r] = [...kpiNodes, ...clusters.flat()]
  })

  // x, y 부여
  const ranks = Object.keys(byRank).map(Number).sort((a, b) => a - b)
  let maxWidth = 0
  ranks.forEach(r => {
    const row = byRank[r]
    const totalW = row.reduce((sum, n) => sum + n.w, 0) + (row.length - 1) * COL_GAP
    if (totalW > maxWidth) maxWidth = totalW
  })

  const width = Math.max(maxWidth + 60, 600)
  const height = ranks.length * (NODE_H + ROW_GAP) + 60

  ranks.forEach((r, rIdx) => {
    const row = byRank[r]
    const totalW = row.reduce((sum, n) => sum + n.w, 0) + (row.length - 1) * COL_GAP
    let cursorX = (width - totalW) / 2
    row.forEach(n => {
      n.x = cursorX
      n.y = 30 + rIdx * (NODE_H + ROW_GAP)
      cursorX += n.w + COL_GAP
    })
  })

  // 5. edge 정의
  const edges = []
  tasks.forEach(t => {
    const child = nodesById.get(t.id)
    if (!child) return
    // parent task edges
    ;(t.parentIds || []).forEach(pid => {
      if (!taskIds.has(pid)) return
      const parent = nodesById.get(pid)
      if (parent) edges.push({ kind: 'parent', from: parent, to: child })
    })
    // KPI edge — 부모 task 없을 때만 KPI에서 연결
    const hasParentTask = (t.parentIds || []).some(pid => taskIds.has(pid))
    if (!hasParentTask) {
      const label = (t.kpi || t.impact || '').trim()
      if (label && allKpis.has(label)) {
        const kpiNode = nodesById.get(`__kpi__${label}`)
        if (kpiNode) edges.push({ kind: 'kpi', from: kpiNode, to: child })
      }
    }
    // sibling edges (한 번씩만)
    ;(t.siblingIds || []).forEach(sid => {
      if (!taskIds.has(sid)) return
      const sNode = nodesById.get(sid)
      if (!sNode) return
      // pair 중 id 작은 쪽이 from
      const [a, b] = [t.id, sid].sort()
      if (a !== t.id) return
      edges.push({ kind: 'sibling', from: nodesById.get(a), to: nodesById.get(b) })
    })
  })

  return { nodes, edges, width, height }
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

// === 자체 SVG 기반 흐름도 (Mermaid 대체) ===
// 장점: rank 100% 예측 가능, 라이브러리 의존 없음, 클릭 위치 정확
function FlowMermaidInteractive({
  tasks,
  history = [],
  displayTasks,
  allTasks,
  kpis,
  pinnedKpiLabels,
  currentUid = '',
  onAddRelation,
  onRemoveRelation,
  onHide,
  onResetRelations,
  onDelete,
  onDeleteKpi,
  onChangeKpi,
  onAddTaskToKpi,
  onDisconnectTaskFromKpi,
  onUnpinKpi,
  onRemoveFromChart,
}) {
  const wrapRef = useRef(null)
  const [menu, setMenu] = useState(null) // { kind: 'task'|'kpi', taskId/kpiLabel, x, y }

  // Layout 계산 — sortedTasks(displayTasks)와 pinnedKpiLabels 기반
  const layout = useMemo(
    () => computeFlowLayout(displayTasks, null, pinnedKpiLabels),
    [displayTasks, pinnedKpiLabels],
  )

  // 외부 클릭 시 메뉴 닫기
  useEffect(() => {
    if (!menu) return undefined
    function handleDocClick(event) {
      if (event.target.closest && event.target.closest('.flow-node-menu')) return
      if (event.target.closest && event.target.closest('.flow-svg-node')) return
      setMenu(null)
    }
    document.addEventListener('click', handleDocClick)
    return () => document.removeEventListener('click', handleDocClick)
  }, [menu])

  function handleNodeClick(event, node) {
    event.stopPropagation()
    // 클릭한 SVG 노드의 화면(viewport) 좌표 — position: fixed에 사용
    const target = event.currentTarget
    const rect = target.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.bottom + 8
    if (node.type === 'kpi') {
      setMenu({ kind: 'kpi', kpiLabel: node.label, x, y })
    } else if (node.type === 'task') {
      if (node.id === '__preview_new_task__') return
      setMenu({ kind: 'task', taskId: node.id, x, y })
    }
  }

  const activeMenuTask = (menu && menu.kind === 'task')
    ? (tasks.find(t => t.id === menu.taskId) || displayTasks.find(t => t.id === menu.taskId))
    : null
  const isMenuHistoryItem = (menu && menu.kind === 'task' && activeMenuTask)
    ? !tasks.some(t => t.id === menu.taskId)
    : false

  if (layout.nodes.length === 0) {
    return <p className="task-flow-empty">표시할 노드가 없습니다.</p>
  }

  return (
    <div className="task-flow-svg-wrap" ref={wrapRef}>
      <svg
        className="task-flow-svg"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width={layout.width}
        height={layout.height}
        preserveAspectRatio="xMidYMin meet"
        style={{ maxWidth: '100%', height: 'auto', display: 'block', margin: '0 auto' }}
      >
        <defs>
          <marker id="arrow-parent" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="#374151" />
          </marker>
          <marker id="arrow-kpi" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="#0d7a6e" />
          </marker>
        </defs>

        {/* Edges 먼저 (노드 뒤에 깔리도록) */}
        {layout.edges.map((e, idx) => {
          const fromCx = e.from.x + e.from.w / 2
          const fromBottom = e.from.y + e.from.h
          const toCx = e.to.x + e.to.w / 2
          const toTop = e.to.y
          if (e.kind === 'sibling') {
            // 동위 — 점선 가로선 (같은 y 가정)
            const y1 = e.from.y + e.from.h / 2
            const y2 = e.to.y + e.to.h / 2
            const x1 = e.from.x + e.from.w
            const x2 = e.to.x
            return (
              <path
                key={`e-${idx}`}
                d={`M ${x1} ${y1} L ${x2} ${y2}`}
                stroke="#9ca3af"
                strokeWidth="1.5"
                strokeDasharray="5 4"
                fill="none"
              />
            )
          }
          // parent / kpi: 위→아래 곡선
          const midY = (fromBottom + toTop) / 2
          const stroke = e.kind === 'kpi' ? '#0d7a6e' : '#374151'
          const sw = e.kind === 'kpi' ? 2.4 : 1.6
          const marker = e.kind === 'kpi' ? 'url(#arrow-kpi)' : 'url(#arrow-parent)'
          return (
            <path
              key={`e-${idx}`}
              d={`M ${fromCx} ${fromBottom} C ${fromCx} ${midY}, ${toCx} ${midY}, ${toCx} ${toTop - 2}`}
              stroke={stroke}
              strokeWidth={sw}
              fill="none"
              markerEnd={marker}
            />
          )
        })}

        {/* Nodes */}
        {layout.nodes.map(n => {
          if (n.type === 'kpi') {
            const cx = n.x + n.w / 2
            const cy = n.y + n.h / 2
            const safeLabel = n.label.length > 22 ? n.label.slice(0, 21) + '…' : n.label
            return (
              <g
                key={n.id}
                className="flow-svg-node flow-svg-kpi"
                onClick={ev => handleNodeClick(ev, n)}
                style={{ cursor: 'pointer' }}
              >
                <ellipse
                  cx={cx}
                  cy={cy}
                  rx={n.w / 2}
                  ry={n.h / 2}
                  fill="#0d7a6e"
                  stroke="#065f55"
                  strokeWidth="1"
                />
                <text
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="white"
                  fontSize="12"
                  fontWeight="700"
                  pointerEvents="none"
                >{safeLabel}</text>
              </g>
            )
          }
          // task node
          const isPreview = n.id === '__preview_new_task__'
          const status = n.task?.status || 'todo'
          const colors = {
            todo: { fill: '#9ca3af', stroke: '#6b7280', text: 'white' },
            doing: { fill: '#3b82f6', stroke: '#2563eb', text: 'white' },
            review: { fill: '#f59e0b', stroke: '#d97706', text: 'white' },
            blocked: { fill: '#ef4444', stroke: '#dc2626', text: 'white' },
            done: { fill: '#10b981', stroke: '#059669', text: 'white' },
            preview: { fill: '#fff7e6', stroke: '#d97706', text: '#b45309' },
          }
          const c = colors[isPreview ? 'preview' : status] || colors.todo
          const safeTitle = (n.label || '제목없음').length > 18
            ? (n.label || '제목없음').slice(0, 17) + '…'
            : (n.label || '제목없음')
          return (
            <g
              key={n.id}
              className="flow-svg-node flow-svg-task"
              onClick={ev => handleNodeClick(ev, n)}
              style={{ cursor: isPreview ? 'default' : 'pointer' }}
            >
              <rect
                x={n.x}
                y={n.y}
                width={n.w}
                height={n.h}
                rx="6"
                ry="6"
                fill={c.fill}
                stroke={c.stroke}
                strokeWidth="1"
                strokeDasharray={isPreview ? '5 3' : ''}
              />
              <text
                x={n.x + n.w / 2}
                y={n.y + n.h / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={c.text}
                fontSize="12.5"
                fontWeight={status === 'done' || status === 'doing' || status === 'blocked' || status === 'review' ? 700 : 500}
                pointerEvents="none"
              >{safeTitle}</text>
            </g>
          )
        })}
      </svg>

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
            kpis={kpis}
            currentUid={currentUid}
            x={menu.x}
            y={menu.y}
            onClose={() => setMenu(null)}
            onHide={() => { onHide(menu.taskId); setMenu(null) }}
            onReset={() => { onResetRelations(menu.taskId); setMenu(null) }}
            onAddRelation={(kind, otherId) => { onAddRelation(menu.taskId, kind, otherId); setMenu(null) }}
            onRemoveRelation={onRemoveRelation
              ? (kind, otherId) => onRemoveRelation(menu.taskId, kind, otherId)
              : null}
            onDelete={onDelete ? () => { onDelete(menu.taskId); setMenu(null) } : null}
          />
        )
      )}
      {menu && menu.kind === 'kpi' && (
        <KpiClickMenu
          kpiLabel={menu.kpiLabel}
          kpis={kpis}
          tasks={tasks}
          history={history}
          isPinned={pinnedKpiLabels?.has(menu.kpiLabel)}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onDelete={onDeleteKpi ? () => { onDeleteKpi(menu.kpiLabel); setMenu(null) } : null}
          onChangeKpi={onChangeKpi ? newLabel => { onChangeKpi(menu.kpiLabel, newLabel); setMenu(null) } : null}
          onAddTaskToKpi={onAddTaskToKpi ? (taskId, weekKey) => { onAddTaskToKpi(menu.kpiLabel, taskId, weekKey); setMenu(null) } : null}
          onDisconnectTask={onDisconnectTaskFromKpi}
          onUnpin={onUnpinKpi ? () => { onUnpinKpi(menu.kpiLabel); setMenu(null) } : null}
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
        완료업무 히스토리 항목 — 차트에 보이는 이유는 이번 주 업무의 이전/병행 업무로 연결되어 있기 때문
      </div>
      <div className="flow-node-menu-actions">
        {onRemoveFromChart && (
          <button
            type="button"
            className="ghost-action danger"
            onClick={onRemoveFromChart}
            title="이번 주 업무에서 이 항목을 이전/병행 업무로 가진 모든 연결을 끊음 (히스토리 데이터는 보존)"
          >
            <Trash2 size={13} /> 차트에서 제외
          </button>
        )}
      </div>
    </div>
  )
}

function KpiClickMenu({ kpiLabel, kpis = [], tasks, history = [], isPinned = false, x, y, onClose, onDelete, onChangeKpi, onAddTaskToKpi, onDisconnectTask, onUnpin }) {
  const [childSearch, setChildSearch] = useState('')
  const linkedTasks = tasks.filter(t => (t.kpi || t.impact) === kpiLabel)

  // 하위 추가 후보: 이번 주 활성 task + 1개월 이내 history task (이미 이 KPI에 연결된 건 제외)
  const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000
  const cutoffMs = Date.now() - ONE_MONTH_MS
  const allTasksMap = new Map()
  // 우선 이번 주 활성 task (done이 아닌)
  tasks.filter(t => t.status !== 'done').forEach(t => {
    if ((t.kpi || t.impact) === kpiLabel) return
    allTasksMap.set(t.id, { ...t, _source: 'current' })
  })
  // history (1개월 이내)
  history.flatMap(w => (w.items || []).map(item => ({ ...item, _weekKey: w.weekKey }))).forEach(t => {
    if (allTasksMap.has(t.id)) return
    if ((t.kpi || t.impact) === kpiLabel) return
    const ts = new Date(t.createdAt || t.updatedAt || 0).getTime()
    if (!Number.isFinite(ts) || ts < cutoffMs) return
    allTasksMap.set(t.id, { ...t, _source: 'history' })
  })
  const childCandidatesAll = Array.from(allTasksMap.values())
  const trimmedChildSearch = childSearch.trim().toLowerCase()
  const childCandidates = trimmedChildSearch
    ? childCandidatesAll.filter(t => (t.title || '').toLowerCase().includes(trimmedChildSearch))
    : childCandidatesAll
  // 클릭한 KPI 정보 찾기 (kpis 통합 컬렉션에서 매칭)
  const currentKpiDef = kpis.find(k => k.label === kpiLabel)
  const isPersonal = currentKpiDef?.scope === 'personal'
  const currentSubteam = currentKpiDef?.subteam || ''

  // KPI 변경 후보 — 같은 라벨 제외하고 모든 KPI(팀+개인) 표시
  // 팀↔개인 전환 가능 (사용자 요청)
  const sameSubteamCandidates = kpis.filter(k => k.label !== kpiLabel)
  // optgroup 분리용: 팀 KPI / 개인 KPI
  const teamKpiOptions = sameSubteamCandidates.filter(k => k.scope !== 'personal')
  const personalKpiOptions = sameSubteamCandidates.filter(k => k.scope === 'personal')

  const subteamLabel = currentKpiDef
    ? (isPersonal
        ? `개인 KPI · ${currentKpiDef.owner || '소유자'}`
        : (currentSubteam ? `부서: ${getSubteamLabel(currentSubteam)}` : '전사 공통'))
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
        <ul className="kpi-linked-task-list">
          {linkedTasks.map(t => (
            <li key={t.id} className="kpi-linked-task-row">
              {onDisconnectTask && (
                <button
                  type="button"
                  className="kpi-disconnect-btn"
                  onClick={() => onDisconnectTask(t.id)}
                  title={`"${t.title}"을(를) 이 KPI에서 분리`}
                  aria-label="KPI 연결 끊기"
                >
                  <MinusCircle size={15} />
                </button>
              )}
              <span className="kpi-linked-task-title" title={t.title}>{t.title}</span>
            </li>
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
                ? '변경 가능한 다른 KPI 없음'
                : `다른 KPI 선택 (팀 ${teamKpiOptions.length} · 개인 ${personalKpiOptions.length})`}
            </option>
            {teamKpiOptions.length > 0 && (
              <optgroup label="팀 KPI">
                {teamKpiOptions.map(k => {
                  const subLabel = k.subteam ? getSubteamLabel(k.subteam) : '전사 공통'
                  return (
                    <option key={k.id} value={k.label}>
                      {k.label} — {subLabel}
                    </option>
                  )
                })}
              </optgroup>
            )}
            {personalKpiOptions.length > 0 && (
              <optgroup label="개인 KPI">
                {personalKpiOptions.map(k => (
                  <option key={k.id} value={k.label}>
                    {k.label} — {k.owner || k.ownerName || '소유자'}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      )}

      {/* 하위 추가 — 이 KPI에 task 연결 */}
      {onAddTaskToKpi && (
        <div className="flow-node-menu-row stacked">
          <span className="flow-node-menu-label">하위 추가</span>
          <div className="flow-node-menu-parent-controls">
            <input
              type="search"
              className="flow-node-menu-search"
              placeholder={trimmedChildSearch ? '검색 중 (이번 주 + 1개월 히스토리)' : '검색 (이번 주 + 1개월 히스토리)'}
              value={childSearch}
              onChange={event => setChildSearch(event.target.value)}
            />
            <select
              disabled={childCandidates.length === 0}
              value=""
              onChange={event => {
                const v = event.target.value
                if (!v) return
                // value 형식: "current:taskId" 또는 "history:weekKey:taskId"
                const [src, ...rest] = v.split(':')
                if (src === 'current') {
                  onAddTaskToKpi(rest[0], null)
                } else if (src === 'history') {
                  const wk = rest[0]
                  const tid = rest.slice(1).join(':')
                  onAddTaskToKpi(tid, wk)
                }
              }}
            >
              <option value="">
                {childCandidates.length === 0
                  ? (trimmedChildSearch ? '검색 결과 없음' : '연결할 업무 없음')
                  : `업무 선택 (${childCandidates.length}건)`}
              </option>
              {(() => {
                const current = childCandidates.filter(c => c._source === 'current')
                const past = childCandidates.filter(c => c._source === 'history')
                const blocks = []
                if (current.length > 0) {
                  blocks.push(
                    <optgroup key="current" label="이번 주 진행 중 업무">
                      {current.slice(0, 30).map(t => (
                        <option key={t.id} value={`current:${t.id}`}>{t.title}</option>
                      ))}
                    </optgroup>,
                  )
                }
                if (past.length > 0) {
                  blocks.push(
                    <optgroup key="history" label="히스토리 (1개월 이내, 완료 표시)">
                      {past.slice(0, 30).map(t => (
                        <option key={t.id} value={`history:${t._weekKey}:${t.id}`}>
                          {t.title} {t._weekKey ? `· ${t._weekKey}` : ''}
                        </option>
                      ))}
                    </optgroup>,
                  )
                }
                return blocks
              })()}
            </select>
          </div>
        </div>
      )}

      <div className="flow-node-menu-actions">
        {isPinned && linkedTasks.length === 0 && onUnpin && (
          <button
            type="button"
            className="ghost-action"
            onClick={onUnpin}
            title="이 KPI를 차트에서만 제거 (KPI 정의는 보존)"
          >
            <X size={13} /> 차트에서 빼기
          </button>
        )}
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

function NodeClickMenu({ task, tasks, allTasks, kpis = [], currentUid = '', x, y, onClose, onHide, onReset, onAddRelation, onRemoveRelation, onDelete }) {
  const [parentSearch, setParentSearch] = useState('')
  const parentIds = task.parentIds || []
  const siblingIds = task.siblingIds || []
  const currentKpiLabel = (task.kpi || task.impact || '').trim()

  // 현재 연결된 task 객체 lookup
  const findTask = id => allTasks.find(t => t.id === id) || tasks.find(t => t.id === id)
  const linkedParents = parentIds.map(id => ({ id, task: findTask(id) })).filter(x => x.task)
  // 병행 업무는 양방향이지만 데이터가 비대칭일 수 있어 reverse lookup도 함께
  // (다른 task에서 나를 sibling으로 등록해놨으면 그것도 표시)
  const reverseSiblingIds = (allTasks || [])
    .filter(t => t.id !== task.id && (t.siblingIds || []).includes(task.id))
    .map(t => t.id)
  const allSiblingIdSet = new Set([...siblingIds, ...reverseSiblingIds])
  const linkedSiblings = Array.from(allSiblingIdSet)
    .map(id => ({ id, task: findTask(id) }))
    .filter(x => x.task)
  // 하위 업무 — 다른 task의 parentIds에 내 id가 들어있는 것들 (자식들)
  const linkedChildren = (allTasks || [])
    .filter(t => t.id !== task.id && (t.parentIds || []).includes(task.id))
    .map(t => ({ id: t.id, task: t }))

  const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000
  const cutoffMs = Date.now() - ONE_MONTH_MS

  // 이전 업무 후보:
  //  - 본인 등록 OR 공유받은 task만 (다른 팀원 공개 task는 제외)
  //  - 삭제된 task(deletedAt) 제외
  //  - 진행 중 = 이번 주 활성 task / 완료 = completedAt 1개월 이내만 포함
  //  - 검색어가 있어도 위 규칙(본인 + 미삭제 + 1개월) 유지
  function isAccessibleByMe(t) {
    if (!currentUid) return true // currentUid 없으면 필터링 비활성 (호환)
    // 본인 등록 (ownerUid 미정 = legacy 데이터도 본인 것으로 간주)
    if (!t.ownerUid || t.ownerUid === currentUid) return true
    // 공유 동시관리로 받음
    if ((t.coOwnerUids || []).includes(currentUid)) return true
    return false
  }
  // 이번 주 활성 task id 집합 (오늘 업무 = props.tasks)
  const currentWeekIds = new Set((tasks || []).map(t => t.id))
  function isRecent(t) {
    // 1) 오늘 업무 (이번 주 task pool에 있음) — 항상 포함
    if (currentWeekIds.has(t.id)) return true
    // 2) 완료된 업무 — completedAt 1개월 이내
    if (t.status === 'done') {
      const doneTs = new Date(t.completedAt || t.updatedAt || 0).getTime()
      return Number.isFinite(doneTs) && doneTs >= cutoffMs
    }
    // 3) 그 외 (히스토리에 남아있는 미완료 등) — createdAt/updatedAt 1개월 이내
    const ts = new Date(t.updatedAt || t.createdAt || 0).getTime()
    return Number.isFinite(ts) && ts >= cutoffMs
  }
  const allowedAsParent = allTasks.filter(t =>
    t.id !== task.id &&
    !t.deletedAt &&
    !parentIds.includes(t.id) &&
    !siblingIds.includes(t.id) &&
    isAccessibleByMe(t) &&
    isRecent(t),
  )
  const trimmedSearch = parentSearch.trim().toLowerCase()
  const parentCandidates = trimmedSearch
    ? allowedAsParent.filter(t => (t.title || '').toLowerCase().includes(trimmedSearch))
    : allowedAsParent

  // KPI 후보 (이전 업무 dropdown에 통합) — 현재 KPI 라벨과 다른 KPI들
  const kpiCandidates = (kpis || [])
    .filter(k => k.label && k.label !== currentKpiLabel)
    .filter(k => !trimmedSearch || k.label.toLowerCase().includes(trimmedSearch))

  // 병행 후보: 이번 주 진행 중만 — 양방향 sibling이라 reverse-linked도 제외
  // 본인 등록/공유 받은 것만 + 삭제된 것 제외
  const siblingCandidates = tasks.filter(t =>
    t.id !== task.id &&
    t.status !== 'done' &&
    !t.deletedAt &&
    !parentIds.includes(t.id) &&
    !allSiblingIdSet.has(t.id) &&
    isAccessibleByMe(t),
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
        상태 {STATUS_META[task.status]?.label || task.status}
      </div>

      {/* === 현재 연결 (이전 / 병행 / 하위) — 빈 섹션은 자동 숨김, [✕] 클릭으로 양방향 끊기 === */}
      {(linkedParents.length > 0 || linkedSiblings.length > 0 || linkedChildren.length > 0 || currentKpiLabel) && (
        <div className="flow-node-menu-linked">
          {(linkedParents.length > 0 || currentKpiLabel) && (
            <div className="flow-node-menu-linked-row">
              <span className="flow-node-menu-linked-label">
                <ArrowUp size={11} /> 이전
              </span>
              <div className="flow-node-menu-linked-chips">
                {currentKpiLabel && (
                  <span className="flow-node-menu-linked-chip kpi">
                    <span className="chip-icon">▣</span>
                    <span className="chip-title" title={currentKpiLabel}>KPI · {currentKpiLabel}</span>
                    {onRemoveRelation && (
                      <button type="button" className="chip-remove" onClick={() => onRemoveRelation('kpi', currentKpiLabel)} title="이 KPI 연결 끊기">
                        <X size={11} />
                      </button>
                    )}
                  </span>
                )}
                {linkedParents.map(({ id, task: t }) => (
                  <span key={id} className="flow-node-menu-linked-chip parent">
                    <span className="chip-icon">◆</span>
                    <span className="chip-title" title={t.title}>{t.title}</span>
                    {onRemoveRelation && (
                      <button type="button" className="chip-remove" onClick={() => onRemoveRelation('parent', id)} title="이 이전 업무 연결 끊기">
                        <X size={11} />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
          {linkedSiblings.length > 0 && (
            <div className="flow-node-menu-linked-row">
              <span className="flow-node-menu-linked-label">
                <ArrowRight size={11} /> 병행
              </span>
              <div className="flow-node-menu-linked-chips">
                {linkedSiblings.map(({ id, task: t }) => (
                  <span key={id} className="flow-node-menu-linked-chip sibling">
                    <span className="chip-icon">◆</span>
                    <span className="chip-title" title={t.title}>{t.title}</span>
                    {onRemoveRelation && (
                      <button type="button" className="chip-remove" onClick={() => onRemoveRelation('sibling', id)} title="이 병행 업무 연결 끊기 (양방향)">
                        <X size={11} />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
          {linkedChildren.length > 0 && (
            <div className="flow-node-menu-linked-row">
              <span className="flow-node-menu-linked-label">
                <ArrowDown size={11} /> 하위
              </span>
              <div className="flow-node-menu-linked-chips">
                {linkedChildren.map(({ id, task: t }) => (
                  <span key={id} className="flow-node-menu-linked-chip child">
                    <span className="chip-icon">◇</span>
                    <span className="chip-title" title={t.title}>{t.title}</span>
                    {onRemoveRelation && (
                      <button type="button" className="chip-remove" onClick={() => onRemoveRelation('child', id)} title="이 하위 업무 연결 끊기">
                        <X size={11} />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flow-node-menu-row stacked add-section parent">
        <span className="flow-node-menu-label">
          <ArrowUp size={13} /> 이전 업무 추가
        </span>
        <div className="flow-node-menu-parent-controls">
          <input
            type="search"
            className="flow-node-menu-search"
            placeholder={trimmedSearch ? '검색 중 (내 KPI + 내 업무 1개월)' : '검색 (내 KPI + 내 업무 1개월)'}
            value={parentSearch}
            onChange={event => setParentSearch(event.target.value)}
          />
          <select
            disabled={sortedParents.length === 0 && kpiCandidates.length === 0}
            value=""
            onChange={event => {
              const v = event.target.value
              if (!v) return
              // value 형식: "kpi:KpiLabel" 또는 "task:taskId"
              const [kind, ...rest] = v.split(':')
              const id = rest.join(':')
              if (kind === 'kpi') onAddRelation('kpi', id)
              else if (kind === 'task') onAddRelation('parent', id)
            }}
          >
            <option value="">
              {(sortedParents.length === 0 && kpiCandidates.length === 0)
                ? (trimmedSearch ? '검색 결과 없음' : '추가 가능한 KPI/업무 없음')
                : `KPI ${kpiCandidates.length} · 업무 ${sortedParents.length}건`}
            </option>
            {kpiCandidates.length > 0 && (
              <optgroup label="▣ KPI">
                {kpiCandidates.map(k => (
                  <option key={`kpi-${k.id || k.label}`} value={`kpi:${k.label}`}>{k.label}</option>
                ))}
              </optgroup>
            )}
            {sortedParents.length > 0 && (
              <optgroup label="◆ 내 업무 (이번 주 + 완료 1개월)">
                {sortedParents.slice(0, 50).map(({ task: t, depth }) => (
                  <option key={`task-${t.id}`} value={`task:${t.id}`}>{indent(t.title, depth)}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      </div>

      <div className="flow-node-menu-row stacked add-section sibling">
        <span className="flow-node-menu-label">
          <ArrowRight size={13} /> 병행 업무 추가
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
          title="이 업무의 이전·병행 업무 연결과 숨김 상태를 모두 해제"
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

// buildChart / sanitizeId / extractIdFromMermaid 제거 — Mermaid 의존 종료

