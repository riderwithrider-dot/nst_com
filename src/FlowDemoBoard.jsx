// 임시 데모 페이지: 업무 흐름 시각화 옵션 비교
// 결정 후 실제 적용 + 이 파일은 삭제 또는 정식 컴포넌트로 변경

import { useEffect, useRef, useState } from 'react'

const SAMPLE_TASKS = [
  { id: 'A', title: '채널 손익 Tool 1차', status: 'done', subteam: '전략파트너', parentIds: [] },
  { id: 'B', title: '채널 손익 2차 분석', status: 'doing', subteam: '전략파트너', parentIds: ['A'] },
  { id: 'C', title: '손익 보고 포맷 정리', status: 'todo', subteam: '전략파트너', parentIds: ['A'] },
  { id: 'D', title: '마진 자동화 PoC', status: 'review', subteam: '커머스', parentIds: ['B', 'C'] },
  { id: 'E', title: '레몬즙 Forecast', status: 'doing', subteam: '커머스', parentIds: [] },
  { id: 'F', title: 'Forecast 정확도 모델', status: 'doing', subteam: '커머스', parentIds: ['E'] },
  { id: 'G', title: 'KPI 자동 산출', status: 'blocked', subteam: '전략파트너', parentIds: ['D', 'F'] },
]

const STATUS_COLORS = {
  todo: '#9ca3af',
  doing: '#3b82f6',
  review: '#f59e0b',
  blocked: '#ef4444',
  done: '#10b981',
}

const STATUS_LABELS = {
  todo: '대기',
  doing: '진행',
  review: '검토',
  blocked: '보류',
  done: '완료',
}

export default function FlowDemoBoard() {
  return (
    <main className="view-stack">
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>🧪 업무 흐름 시각화 — 3가지 옵션 비교</h2>
          </div>
        </div>
        <p className="flow-demo-intro">
          같은 샘플 데이터(7개 task, 모태 2개, 분기/합치기 포함)를 3가지 방식으로 표시합니다.
          각 방식 보고 어느 게 가장 직관적인지 알려주세요.
        </p>

        <div className="flow-demo-section">
          <h3>A. 들여쓰기 트리 (텍스트 기반)</h3>
          <p className="flow-demo-desc">
            가장 가벼움. 모태부터 단계별 들여쓰기. 문서/이메일 복사 쉬움.
            <br />단점: 합치기(N:1)는 표현 불가 (D, G가 두 모태인데 한 번씩만 표시).
          </p>
          <div className="flow-tree-box">
            {SAMPLE_TASKS.filter(t => t.parentIds.length === 0).map(root =>
              <TreeNode key={root.id} task={root} all={SAMPLE_TASKS} depth={0} />
            )}
          </div>
        </div>

        <div className="flow-demo-section">
          <h3>B. 카드 트리 (가로 분기)</h3>
          <p className="flow-demo-desc">
            박스 카드와 분기선. 시각적 임팩트 좋음.
            <br />단점: 합치기는 별도 표시 (D, G가 두 부모를 갖는 걸 점선으로).
          </p>
          <CardTree tasks={SAMPLE_TASKS} />
        </div>

        <div className="flow-demo-section">
          <h3>C. SVG 그래프 (자체 구현, 추천)</h3>
          <p className="flow-demo-desc">
            SVG로 직접 그린 노드+엣지. <strong>1:N, N:1, 다이아몬드 패턴 모두 표현</strong>.
            <br />가벼움 (라이브러리 없음), 색/스타일 완전 제어, 클릭 이벤트 자유.
          </p>
          <SvgGraph tasks={SAMPLE_TASKS} />
        </div>

        <div className="flow-demo-section">
          <h3>D. Mermaid 다이어그램 (표준 라이브러리)</h3>
          <p className="flow-demo-desc">
            업계 표준 (GitHub, Notion에서 그대로 보임). 자동 레이아웃 + 곡선 화살표.
            <br />첫 로드 5~10초 (CDN). 정식 적용 시 <code>npm install mermaid</code> 권장.
          </p>
          <MermaidView chart={buildMermaidChart(SAMPLE_TASKS)} />
        </div>

        <div className="flow-demo-section flow-demo-highlight">
          <h3>E. 자체 SVG + 박스 위/오른쪽 [+] 버튼 (인터랙티브)</h3>
          <p className="flow-demo-desc">
            박스 위쪽 [↑+]로 상위(모태) 추가, 오른쪽 [→+]로 병행 추가. 좌표를 우리가 알기에 정확한 위치에 부착됨.
            <br />아래에서 직접 추가/제거 해보세요 (이 데모 안에서만 동작).
          </p>
          <InteractiveSvgDemo />
        </div>

        <div className="flow-demo-section flow-demo-highlight">
          <h3>F. Mermaid + 노드 클릭 메뉴</h3>
          <p className="flow-demo-desc">
            노드 클릭 시 작은 메뉴 (↑ 상위 추가 / → 병행 추가 / 👁 숨김). 보이는 [+]는 없지만 박스 자체가 핸들.
            <br />아래에서 노드를 직접 클릭해보세요.
          </p>
          <InteractiveMermaidDemo />
        </div>

        <div className="flow-demo-decision">
          <strong>결정해주세요:</strong>
          <ul>
            <li>"<b>E로 가자</b>" — SVG + 박스 [+] 버튼 (가장 직관적, 자동 레이아웃 직접 짜야 함)</li>
            <li>"<b>F로 가자</b>" — Mermaid + 클릭 메뉴 (자동 레이아웃 그대로 활용)</li>
            <li>"<b>C/D 그대로</b>" — 보기 전용 유지 (편집은 별도 패널)</li>
            <li>"<b>다른 의견</b>" — 알려주세요</li>
          </ul>
        </div>
      </section>
    </main>
  )
}

function buildMermaidChart(tasks) {
  const lines = ['graph TD']
  const idSet = new Set(tasks.map(t => t.id))

  tasks.forEach(t => {
    (t.parentIds || []).forEach(pid => {
      if (idSet.has(pid)) lines.push(`  ${pid} --> ${t.id}`)
    })
  })

  // 병행(sibling) 점선
  const sibPairs = new Set()
  tasks.forEach(t => {
    (t.siblingIds || []).forEach(sid => {
      if (!idSet.has(sid)) return
      const key = [t.id, sid].sort().join('|')
      if (sibPairs.has(key)) return
      sibPairs.add(key)
      lines.push(`  ${t.id} -.- ${sid}`)
    })
  })

  tasks.forEach(t => {
    const safeTitle = t.title.replace(/"/g, "'")
    lines.push(`  ${t.id}["${safeTitle}"]:::${t.status}`)
  })

  lines.push('  classDef done fill:#10b981,stroke:#059669,color:white,font-weight:bold')
  lines.push('  classDef doing fill:#3b82f6,stroke:#2563eb,color:white,font-weight:bold')
  lines.push('  classDef todo fill:#9ca3af,stroke:#6b7280,color:white')
  lines.push('  classDef review fill:#f59e0b,stroke:#d97706,color:white,font-weight:bold')
  lines.push('  classDef blocked fill:#ef4444,stroke:#dc2626,color:white,font-weight:bold')

  return lines.join('\n')
}

function MermaidView({ chart }) {
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setSvg('')

    const url = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs'
    import(/* @vite-ignore */ url)
      .then(module => {
        if (cancelled) return null
        const mermaid = module.default
        mermaid.initialize({
          startOnLoad: false,
          theme: 'default',
          flowchart: { curve: 'basis', useMaxWidth: false, padding: 14 },
          themeVariables: { fontFamily: 'inherit', fontSize: '13px' },
        })
        const id = 'mmd-' + Math.random().toString(36).slice(2)
        return mermaid.render(id, chart)
      })
      .then(result => {
        if (cancelled || !result) return
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

  if (error) return <pre style={{ color: '#dc2626', fontSize: 12, padding: 12 }}>Mermaid 오류: {error}</pre>
  if (loading) return <p style={{ color: '#6b7280', padding: 12 }}>⏳ Mermaid 로딩 중... (첫 로드 5~10초, 한번 받으면 이후 빠름)</p>
  return <div className="flow-mermaid-wrap" dangerouslySetInnerHTML={{ __html: svg }} />
}

function TreeNode({ task, all, depth }) {
  const children = all.filter(t => t.parentIds.includes(task.id))
  const indent = depth * 24
  const prefix = depth === 0 ? '📌' : '└─'
  return (
    <div>
      <div className="flow-tree-row" style={{ paddingLeft: indent }}>
        <span className="flow-tree-prefix">{prefix}</span>
        <span
          className="flow-tree-dot"
          style={{ background: STATUS_COLORS[task.status] }}
        />
        <strong>{task.title}</strong>
        <span className="flow-tree-meta">
          {task.subteam} · {STATUS_LABELS[task.status]}
        </span>
        {task.parentIds.length > 1 && (
          <span className="flow-tree-merge">⋈ 합쳐짐 ({task.parentIds.length}개 모태)</span>
        )}
      </div>
      {children.map(child => (
        <TreeNode key={child.id} task={child} all={all} depth={depth + 1} />
      ))}
    </div>
  )
}

function CardTree({ tasks }) {
  const roots = tasks.filter(t => t.parentIds.length === 0)
  const rendered = new Set()

  function renderCard(task, fromMerge = false) {
    if (rendered.has(task.id)) {
      return (
        <div className="flow-card-merged" key={task.id + '-ref'}>
          <span>↑ {task.title} (위에서 이미 표시됨)</span>
        </div>
      )
    }
    rendered.add(task.id)
    const children = tasks.filter(t => t.parentIds.includes(task.id))
    const isMerge = task.parentIds.length > 1
    return (
      <div className="flow-card-branch" key={task.id}>
        <div
          className={`flow-card-box ${isMerge ? 'merged' : ''}`}
          style={{ borderLeftColor: STATUS_COLORS[task.status] }}
        >
          {isMerge && <span className="flow-card-merge-tag">⋈ {task.parentIds.length}개 모태 합침</span>}
          <strong>{task.title}</strong>
          <span>{task.subteam}</span>
          <span style={{ color: STATUS_COLORS[task.status], fontWeight: 600 }}>
            {STATUS_LABELS[task.status]}
          </span>
        </div>
        {children.length > 0 && (
          <div className="flow-card-children">
            {children.map(child => renderCard(child))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flow-card-roots">
      {roots.map(root => renderCard(root))}
    </div>
  )
}

function SvgGraph({ tasks }) {
  const NODE_W = 170
  const NODE_H = 64
  const H_GAP = 30
  const V_GAP = 40
  const PAD = 20

  // 깊이 계산
  const depths = {}
  function calcDepth(id, visited = new Set()) {
    if (visited.has(id)) return depths[id] || 0
    visited.add(id)
    const t = tasks.find(x => x.id === id)
    if (!t || t.parentIds.length === 0) {
      depths[id] = 0
      return 0
    }
    const max = Math.max(...t.parentIds.map(p => calcDepth(p, visited)))
    depths[id] = max + 1
    return depths[id]
  }
  tasks.forEach(t => calcDepth(t.id))

  // 깊이별 그룹
  const byDepth = {}
  tasks.forEach(t => {
    const d = depths[t.id]
    if (!byDepth[d]) byDepth[d] = []
    byDepth[d].push(t)
  })

  // 위치 계산
  const positions = {}
  Object.keys(byDepth).map(Number).sort((a, b) => a - b).forEach(d => {
    byDepth[d].forEach((task, idx) => {
      positions[task.id] = {
        x: idx * (NODE_W + H_GAP) + PAD,
        y: d * (NODE_H + V_GAP) + PAD,
      }
    })
  })

  const maxDepth = Math.max(...Object.values(depths))
  const maxAtAnyDepth = Math.max(...Object.values(byDepth).map(arr => arr.length))
  const W = maxAtAnyDepth * (NODE_W + H_GAP) + PAD * 2
  const H = (maxDepth + 1) * (NODE_H + V_GAP) + PAD * 2

  return (
    <div className="flow-svg-wrap">
      <svg width={W} height={H} style={{ minWidth: W }}>
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#9ca3af" />
          </marker>
        </defs>

        {tasks.flatMap(task =>
          task.parentIds.map(pid => {
            const from = positions[pid]
            const to = positions[task.id]
            if (!from || !to) return null
            const x1 = from.x + NODE_W / 2
            const y1 = from.y + NODE_H
            const x2 = to.x + NODE_W / 2
            const y2 = to.y
            const midY = (y1 + y2) / 2
            return (
              <path
                key={`${pid}-${task.id}`}
                d={`M ${x1} ${y1} C ${x1} ${midY} ${x2} ${midY} ${x2} ${y2}`}
                stroke="#9ca3af"
                strokeWidth={1.5}
                fill="none"
                markerEnd="url(#arr)"
              />
            )
          })
        )}

        {tasks.map(task => {
          const pos = positions[task.id]
          if (!pos) return null
          const isMerge = task.parentIds.length > 1
          const title = task.title.length > 22 ? task.title.slice(0, 21) + '…' : task.title
          return (
            <g key={task.id} transform={`translate(${pos.x}, ${pos.y})`}>
              <rect
                width={NODE_W} height={NODE_H}
                rx={8}
                fill={isMerge ? '#fef3c7' : 'white'}
                stroke={STATUS_COLORS[task.status]}
                strokeWidth={2.5}
              />
              <text x={10} y={20} fontSize={12} fontWeight={700} fill="#1f2937">
                {title}
              </text>
              <text x={10} y={38} fontSize={10} fill="#6b7280">
                {task.subteam}
              </text>
              <text x={10} y={54} fontSize={10} fill={STATUS_COLORS[task.status]} fontWeight={700}>
                {STATUS_LABELS[task.status]}
                {isMerge && <tspan> · ⋈ 합침</tspan>}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ============== 옵션 E: 인터랙티브 SVG + 박스 위/오른쪽 [+] 버튼 ==============
function InteractiveSvgDemo() {
  const [tasks, setTasks] = useState(SAMPLE_TASKS)
  const [picker, setPicker] = useState(null) // { taskId, type, anchorX, anchorY }

  const NODE_W = 170, NODE_H = 64, H_GAP = 40, V_GAP = 60, PAD = 28

  const depths = {}
  function calcDepth(id, visited = new Set()) {
    if (visited.has(id)) return depths[id] || 0
    visited.add(id)
    const t = tasks.find(x => x.id === id)
    if (!t || t.parentIds.length === 0) { depths[id] = 0; return 0 }
    const max = Math.max(...t.parentIds.map(p => calcDepth(p, visited)))
    depths[id] = max + 1
    return depths[id]
  }
  tasks.forEach(t => calcDepth(t.id))

  const byDepth = {}
  tasks.forEach(t => {
    const d = depths[t.id]
    if (!byDepth[d]) byDepth[d] = []
    byDepth[d].push(t)
  })

  const positions = {}
  Object.keys(byDepth).map(Number).sort((a, b) => a - b).forEach(d => {
    byDepth[d].forEach((task, idx) => {
      positions[task.id] = {
        x: idx * (NODE_W + H_GAP) + PAD,
        y: d * (NODE_H + V_GAP) + PAD,
      }
    })
  })

  const maxDepth = Math.max(0, ...Object.values(depths))
  const maxAtAnyDepth = Math.max(1, ...Object.values(byDepth).map(arr => arr.length))
  const W = maxAtAnyDepth * (NODE_W + H_GAP) + PAD * 2
  const H = (maxDepth + 1) * (NODE_H + V_GAP) + PAD * 2

  function addParent(taskId, parentId) {
    setTasks(ts => ts.map(t => {
      if (t.id !== taskId) return t
      const cur = t.parentIds || []
      if (cur.includes(parentId)) return t
      return { ...t, parentIds: [...cur, parentId] }
    }))
    setPicker(null)
  }
  function removeParent(taskId, parentId) {
    setTasks(ts => ts.map(t =>
      t.id === taskId ? { ...t, parentIds: (t.parentIds || []).filter(p => p !== parentId) } : t
    ))
  }
  function addSiblingAsParent(taskId, otherId) {
    // 병행 = 양쪽 다 같은 부모를 갖도록 처리하지 않고, 단순히 데모로 sibling 표기 추가
    setTasks(ts => ts.map(t => {
      if (t.id !== taskId) return t
      const sibs = t.siblingIds || []
      if (sibs.includes(otherId)) return t
      return { ...t, siblingIds: [...sibs, otherId] }
    }))
    setPicker(null)
  }

  function getPickerOptions() {
    if (!picker) return []
    const t = tasks.find(x => x.id === picker.taskId)
    if (!t) return []
    if (picker.type === 'parent') {
      return tasks.filter(x =>
        x.id !== picker.taskId &&
        !(t.parentIds || []).includes(x.id) &&
        !wouldCreateCycle(x.id, picker.taskId)
      )
    }
    return tasks.filter(x =>
      x.id !== picker.taskId &&
      !(t.siblingIds || []).includes(x.id)
    )
  }

  function wouldCreateCycle(parentCandidateId, childId) {
    // childId의 자손에 parentCandidateId가 있으면 cycle
    const stack = [childId]
    const seen = new Set()
    while (stack.length) {
      const cur = stack.pop()
      if (seen.has(cur)) continue
      seen.add(cur)
      if (cur === parentCandidateId) return true
      tasks.filter(t => (t.parentIds || []).includes(cur)).forEach(c => stack.push(c.id))
    }
    return false
  }

  return (
    <div className="svg-demo-wrap" style={{ position: 'relative', overflow: 'auto', maxWidth: '100%' }}>
      <svg width={W} height={H} style={{ minWidth: W, display: 'block' }}>
        <defs>
          <marker id="arr-e" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#9ca3af" />
          </marker>
        </defs>
        {tasks.flatMap(task =>
          (task.parentIds || []).map(pid => {
            const from = positions[pid]
            const to = positions[task.id]
            if (!from || !to) return null
            const x1 = from.x + NODE_W / 2
            const y1 = from.y + NODE_H
            const x2 = to.x + NODE_W / 2
            const y2 = to.y
            const midY = (y1 + y2) / 2
            return (
              <g key={`${pid}-${task.id}`}>
                <path
                  d={`M ${x1} ${y1} C ${x1} ${midY} ${x2} ${midY} ${x2} ${y2}`}
                  stroke="#9ca3af" strokeWidth={1.5} fill="none" markerEnd="url(#arr-e)"
                />
                <circle
                  cx={(x1 + x2) / 2} cy={midY} r={9}
                  fill="white" stroke="#ef4444" strokeWidth={1.5}
                  style={{ cursor: 'pointer' }}
                  onClick={() => removeParent(task.id, pid)}
                >
                  <title>이 연결 끊기</title>
                </circle>
                <text x={(x1 + x2) / 2} y={midY + 3} fontSize={11} textAnchor="middle" fill="#ef4444"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}>×</text>
              </g>
            )
          })
        )}
        {tasks.map(task => {
          const pos = positions[task.id]
          if (!pos) return null
          return (
            <g key={task.id} transform={`translate(${pos.x}, ${pos.y})`}>
              <rect width={NODE_W} height={NODE_H} rx={8}
                    fill="white" stroke={STATUS_COLORS[task.status]} strokeWidth={2.5} />
              <text x={10} y={22} fontSize={12} fontWeight={700} fill="#1f2937">
                {task.title.length > 22 ? task.title.slice(0, 21) + '…' : task.title}
              </text>
              <text x={10} y={40} fontSize={10} fill="#6b7280">{task.subteam}</text>
              <text x={10} y={56} fontSize={10} fill={STATUS_COLORS[task.status]} fontWeight={700}>
                {STATUS_LABELS[task.status]}
              </text>
            </g>
          )
        })}
      </svg>

      {/* 박스 위/오른쪽 [+] 버튼 오버레이 */}
      {tasks.map(task => {
        const pos = positions[task.id]
        if (!pos) return null
        return (
          <div key={`btn-${task.id}`}>
            <button
              type="button"
              className="svg-demo-handle top"
              style={{ left: pos.x + NODE_W / 2 - 13, top: pos.y - 14 }}
              onClick={() => setPicker({ taskId: task.id, type: 'parent', anchorX: pos.x + NODE_W / 2 + 18, anchorY: pos.y - 14 })}
              title="상위(모태) 추가"
            >↑+</button>
            <button
              type="button"
              className="svg-demo-handle right"
              style={{ left: pos.x + NODE_W + 4, top: pos.y + NODE_H / 2 - 13 }}
              onClick={() => setPicker({ taskId: task.id, type: 'sibling', anchorX: pos.x + NODE_W + 32, anchorY: pos.y + NODE_H / 2 - 13 })}
              title="병행 추가"
            >→+</button>
          </div>
        )
      })}

      {/* picker 팝업 */}
      {picker && (
        <div
          className="svg-demo-picker"
          style={{ left: picker.anchorX, top: picker.anchorY }}
        >
          <div className="svg-demo-picker-head">
            <strong>{picker.type === 'parent' ? '↑ 상위 추가' : '→ 병행 추가'}</strong>
            <button type="button" onClick={() => setPicker(null)}>×</button>
          </div>
          <div className="svg-demo-picker-list">
            {getPickerOptions().length === 0 && (
              <div className="svg-demo-picker-empty">선택할 업무 없음</div>
            )}
            {getPickerOptions().map(t => (
              <button
                key={t.id} type="button"
                className="svg-demo-picker-item"
                onClick={() =>
                  picker.type === 'parent'
                    ? addParent(picker.taskId, t.id)
                    : addSiblingAsParent(picker.taskId, t.id)
                }
              >
                {t.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============== 옵션 F: Mermaid + 노드 클릭 메뉴 ==============
function InteractiveMermaidDemo() {
  const [tasks, setTasks] = useState(SAMPLE_TASKS)
  const [hidden, setHidden] = useState(new Set())
  const [menu, setMenu] = useState(null) // { taskId, x, y, mode }
  const wrapRef = useRef(null)
  const [svg, setSvg] = useState('')
  const [loading, setLoading] = useState(true)

  const visibleTasks = tasks.filter(t => !hidden.has(t.id))
  const chart = buildMermaidChart(visibleTasks)

  // 최신 tasks를 ref로 보존 (click 핸들러가 stale closure를 안 갖게)
  const tasksRef = useRef(tasks)
  useEffect(() => { tasksRef.current = tasks }, [tasks])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setSvg('')
    const url = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs'
    import(/* @vite-ignore */ url)
      .then(module => {
        if (cancelled) return null
        const mermaid = module.default
        mermaid.initialize({
          startOnLoad: false, theme: 'default',
          flowchart: { curve: 'basis', useMaxWidth: false, padding: 14 },
          themeVariables: { fontFamily: 'inherit', fontSize: '13px' },
        })
        const id = 'mmdF-' + Math.random().toString(36).slice(2)
        return mermaid.render(id, chart)
      })
      .then(result => {
        if (cancelled || !result) return
        setSvg(result.svg)
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [chart])

  // 렌더 후 wrap에 위임 클릭 핸들러 부착
  useEffect(() => {
    if (!wrapRef.current || !svg) return
    const wrap = wrapRef.current
    wrap.querySelectorAll('g.node').forEach(n => { n.style.cursor = 'pointer' })

    const handler = event => {
      const currentTasks = tasksRef.current
      const node = event.target.closest && event.target.closest('g.node')
      if (!node || !wrap.contains(node)) return
      let taskId = null
      const idAttr = node.id || ''
      const variants = [
        /flowchart-([A-Za-z0-9_]+)-\d+$/,
        /flowchart-([A-Za-z0-9_]+)/,
        /-([A-Za-z0-9_]+)-\d+$/,
      ]
      for (const re of variants) {
        const m = idAttr.match(re)
        if (m && currentTasks.find(t => t.id === m[1])) { taskId = m[1]; break }
      }
      if (!taskId) {
        const text = (node.textContent || '').trim()
        if (text) {
          const task = currentTasks.find(t => t.title && (text === t.title || text.includes(t.title)))
          if (task) taskId = task.id
        }
      }
      if (!taskId) return
      event.stopPropagation()
      const rect = wrap.getBoundingClientRect()
      setMenu({
        taskId,
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        mode: 'main',
      })
    }
    wrap.addEventListener('click', handler)
    return () => wrap.removeEventListener('click', handler)
  }, [svg])

  function addParent(taskId, parentId) {
    setTasks(ts => ts.map(t => {
      if (t.id !== taskId) return t
      const cur = t.parentIds || []
      if (cur.includes(parentId)) return t
      return { ...t, parentIds: [...cur, parentId] }
    }))
    setMenu(null)
  }
  function addSibling(taskId, sibId) {
    setTasks(ts => ts.map(t => {
      if (t.id !== taskId) return t
      const cur = t.siblingIds || []
      if (cur.includes(sibId)) return t
      return { ...t, siblingIds: [...cur, sibId] }
    }))
    setMenu(null)
  }
  function toggleHide(taskId) {
    setHidden(h => {
      const next = new Set(h)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
    setMenu(null)
  }

  function pickerOptions(taskId, type) {
    const t = tasks.find(x => x.id === taskId)
    if (!t) return []
    if (type === 'parent') {
      return tasks.filter(x =>
        x.id !== taskId && !(t.parentIds || []).includes(x.id)
      )
    }
    return tasks.filter(x =>
      x.id !== taskId && !(t.siblingIds || []).includes(x.id)
    )
  }

  return (
    <div ref={wrapRef} className="mermaid-demo-wrap" style={{ position: 'relative', minHeight: 200 }}>
      {loading && <p style={{ color: '#6b7280', padding: 12 }}>⏳ Mermaid 로딩 중...</p>}
      {!loading && (
        <div className="flow-mermaid-wrap" dangerouslySetInnerHTML={{ __html: svg }} />
      )}
      {hidden.size > 0 && (
        <div className="mermaid-demo-hint">
          숨김 {hidden.size}개:
          {[...hidden].map(id => {
            const t = tasks.find(x => x.id === id)
            return t ? (
              <button key={id} type="button" className="mermaid-demo-restore" onClick={() => toggleHide(id)}>
                {t.title} 복원
              </button>
            ) : null
          })}
        </div>
      )}

      {menu && (
        <div className="mermaid-demo-backdrop" onClick={() => setMenu(null)} />
      )}
      {menu && (
        <div
          className="mermaid-demo-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={e => e.stopPropagation()}
        >
          {menu.mode === 'main' && (
            <>
              <div className="mermaid-demo-menu-title">
                {tasks.find(t => t.id === menu.taskId)?.title}
              </div>
              <button type="button" onClick={() => setMenu({ ...menu, mode: 'parent' })}>↑ 상위 추가</button>
              <button type="button" onClick={() => setMenu({ ...menu, mode: 'sibling' })}>→ 병행 추가</button>
              <button type="button" onClick={() => toggleHide(menu.taskId)}>👁 숨김</button>
            </>
          )}
          {menu.mode === 'parent' && (
            <>
              <div className="mermaid-demo-menu-title">↑ 상위 추가</div>
              {pickerOptions(menu.taskId, 'parent').map(t => (
                <button key={t.id} type="button" onClick={() => addParent(menu.taskId, t.id)}>{t.title}</button>
              ))}
            </>
          )}
          {menu.mode === 'sibling' && (
            <>
              <div className="mermaid-demo-menu-title">→ 병행 추가</div>
              {pickerOptions(menu.taskId, 'sibling').map(t => (
                <button key={t.id} type="button" onClick={() => addSibling(menu.taskId, t.id)}>{t.title}</button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
