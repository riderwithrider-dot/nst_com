import { useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  Flag,
  Home,
  Lightbulb,
  ListChecks,
  LogOut,
  MessageSquareText,
  Plus,
  RefreshCcw,
  Send,
  ShieldAlert,
  Trash2,
  Users,
} from 'lucide-react'
import { auth, googleProvider, isFirebaseConfigured } from './lib/firebase'
import {
  addIdeaNote,
  addActionItemComment,
  addSharedTaskComment,
  deleteIdeaNote,
  ensureTeamAndMember,
  getTaskHistory,
  saveWeekTasks,
  seedInitialData,
  shareWeekToTeam,
  subscribeActionItems,
  subscribeIdeaNotes,
  subscribeKpis,
  subscribeMemberProfile,
  subscribeTeamFeed,
  subscribeWeekTasks,
  updateActionItemStatus,
  updateSharedTaskFields,
  updateKpiValue,
  updateMemberSubteam,
} from './lib/db'
import { DEFAULT_TEAM_ID, CATEGORY_META, CHANNEL_STRATEGIES, PRIORITY_META, STATUS_META, SUBTEAMS, getSubteamLabel, isManagerUser } from './lib/constants'
import { daysUntil, formatDate, generateId, getWeekKey, weekKeyToLabel } from './lib/date'
import { requestGemini } from './lib/ai'

const VIEWS = [
  { id: 'home', label: '팀장 홈', icon: Home, managerOnly: true },
  { id: 'personal', label: '내 업무', icon: ListChecks },
  { id: 'team', label: '팀 보드', icon: Users },
  { id: 'report', label: '보고 초안', icon: ClipboardList, managerOnly: true },
]

export default function App() {
  const [user, setUser] = useState(null)
  const [booting, setBooting] = useState(true)
  const [bootError, setBootError] = useState('')

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setBooting(false)
      return
    }

    return onAuthStateChanged(auth, async currentUser => {
      setBootError('')
      if (!currentUser) {
        setUser(null)
        setBooting(false)
        return
      }

      try {
        await ensureTeamAndMember(DEFAULT_TEAM_ID, currentUser)
        await seedInitialData(DEFAULT_TEAM_ID)
        setUser(currentUser)
      } catch (error) {
        setBootError(error.message)
      } finally {
        setBooting(false)
      }
    })
  }, [])

  if (!isFirebaseConfigured) {
    return <SetupMissing />
  }

  if (booting) {
    return <FullScreenState title="대시보드 준비 중" message="팀 데이터와 주간 기준을 불러오고 있습니다." />
  }

  if (!user) {
    return <LoginScreen error={bootError} />
  }

  return <Dashboard user={user} bootError={bootError} />
}

function SetupMissing() {
  return (
    <FullScreenState
      title="Firebase 설정이 필요합니다"
      message=".env.local에 Firebase 환경변수를 입력한 뒤 다시 실행하세요."
    />
  )
}

function LoginScreen({ error }) {
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setLoading(true)
    try {
      await signInWithPopup(auth, googleProvider)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="brand-mark">N</div>
        <h1>NST BIO 커머스팀 주간업무</h1>
        <p>개인 실행, 팀 공유, 진행 프로젝트, AI 보고 초안을 한 곳에서 관리합니다.</p>
        {error && <div className="alert error">{error}</div>}
        <button className="primary-action" onClick={handleLogin} disabled={loading}>
          <ShieldAlert size={18} />
          {loading ? '로그인 중' : 'Google로 시작'}
        </button>
      </section>
    </main>
  )
}

function TeamSelectionGate({ user, onSelect }) {
  const [selected, setSelected] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (!selected) {
      setError('소속팀을 선택해주세요.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSelect(selected)
    } catch (err) {
      setError(err.message || '소속팀 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="login-shell">
      <section className="login-panel team-select-panel">
        <div className="brand-mark">N</div>
        <h1>소속팀 선택</h1>
        <p>{user.displayName || user.email}님, 마케팅본부 내 소속팀을 한 번 선택해주세요.</p>
        <form onSubmit={handleSubmit} className="subteam-choice-form">
          <div className="subteam-choice-grid">
            {SUBTEAMS.map(team => (
              <label
                key={team.id}
                className={`subteam-choice ${selected === team.id ? 'selected' : ''}`}
              >
                <input
                  type="radio"
                  name="subteam"
                  value={team.id}
                  checked={selected === team.id}
                  onChange={() => {
                    setSelected(team.id)
                    setError('')
                  }}
                />
                <Users size={18} />
                <strong>{team.label}</strong>
                <span>{selected === team.id ? '선택됨' : '선택'}</span>
              </label>
            ))}
          </div>
          {error && <div className="alert error slim">{error}</div>}
          <button className="primary-action wide" type="submit" disabled={saving}>
            {saving ? '저장 중' : '소속팀 확정'}
          </button>
        </form>
        <small>확정 후에는 관리자 외에는 변경할 수 없습니다.</small>
      </section>
    </main>
  )
}

function Dashboard({ user, bootError }) {
  const canManage = isManagerUser(user)
  const availableViews = VIEWS.filter(view => !view.managerOnly || canManage)
  const [activeView, setActiveView] = useState(canManage ? 'home' : 'personal')
  const [memberProfile, setMemberProfile] = useState(null)
  const canEditSubteam = memberProfile?.role === 'manager'
  const [profileLoading, setProfileLoading] = useState(true)
  const [teamFeed, setTeamFeed] = useState([])
  const [actionItems, setActionItems] = useState([])
  const [kpis, setKpis] = useState([])
  const [dataError, setDataError] = useState('')
  const weekKey = getWeekKey()
  const weekLabel = weekKeyToLabel(weekKey)

  useEffect(() => {
    setProfileLoading(true)
    return subscribeMemberProfile(DEFAULT_TEAM_ID, user.uid, profile => {
      setMemberProfile(profile)
      setProfileLoading(false)
    })
  }, [user.uid])

  useEffect(() => {
    if (!availableViews.some(view => view.id === activeView)) {
      setActiveView('personal')
    }
  }, [activeView, availableViews])

  useEffect(() => {
    setDataError('')
    try {
      const unsubscribers = [
        subscribeTeamFeed(DEFAULT_TEAM_ID, weekKey, setTeamFeed),
        subscribeActionItems(DEFAULT_TEAM_ID, setActionItems),
        subscribeKpis(DEFAULT_TEAM_ID, setKpis),
      ]
      return () => unsubscribers.forEach(unsubscribe => unsubscribe())
    } catch (error) {
      setDataError(error.message)
    }
  }, [weekKey])

  async function handleLogout() {
    await signOut(auth)
  }

  async function handleSubteamChange(subteam) {
    await updateMemberSubteam(DEFAULT_TEAM_ID, user.uid, subteam)
  }

  if (profileLoading) {
    return <FullScreenState title="소속팀 확인 중" message="마케팅본부 팀 정보를 불러오고 있습니다." />
  }

  if (!memberProfile?.subteam) {
    return <TeamSelectionGate user={user} onSelect={handleSubteamChange} />
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark small">N</div>
          <div>
            <strong>NST BIO</strong>
            <span>Commerce PM</span>
          </div>
        </div>

        <nav className="side-nav">
          {availableViews.map(view => {
            const Icon = view.icon
            return (
              <button
                key={view.id}
                className={activeView === view.id ? 'active' : ''}
                onClick={() => setActiveView(view.id)}
              >
                <Icon size={17} />
                {view.label}
              </button>
            )
          })}
        </nav>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{weekLabel}</p>
            <h1>{availableViews.find(view => view.id === activeView)?.label}</h1>
          </div>
          <div className="user-tools">
            {user.photoURL ? <img src={user.photoURL} alt="" /> : <div className="avatar">{user.displayName?.[0] || 'N'}</div>}
            <span>{user.displayName || user.email}</span>
            <Badge tone={canManage ? 'green' : 'gray'}>{canManage ? '팀장' : '팀원'}</Badge>
            {canEditSubteam ? (
              <select className="subteam-select compact" value={memberProfile.subteam} onChange={event => handleSubteamChange(event.target.value)}>
                {SUBTEAMS.map(team => <option key={team.id} value={team.id}>{team.label}</option>)}
              </select>
            ) : (
              <Badge tone="blue">{getSubteamLabel(memberProfile.subteam)}</Badge>
            )}
            <button className="icon-button" onClick={handleLogout} title="로그아웃">
              <LogOut size={17} />
            </button>
          </div>
        </header>

        {(bootError || dataError) && <div className="alert error">{bootError || dataError}</div>}

        {canManage && activeView === 'home' && (
          <TeamHome
            weekLabel={weekLabel}
            teamFeed={teamFeed}
            actionItems={actionItems}
            kpis={kpis}
          />
        )}
        {activeView === 'personal' && (
          <PersonalBoard user={user} memberProfile={memberProfile} weekKey={weekKey} weekLabel={weekLabel} />
        )}
        {activeView === 'team' && (
          <TeamBoard
            user={user}
            weekKey={weekKey}
            weekLabel={weekLabel}
            teamFeed={teamFeed}
            actionItems={actionItems}
            kpis={kpis}
            canManage={canManage}
          />
        )}
        {canManage && activeView === 'report' && (
          <ReportBoard
            weekLabel={weekLabel}
            teamFeed={teamFeed}
            actionItems={actionItems}
            kpis={kpis}
          />
        )}
      </div>
    </div>
  )
}

function TeamHome({ weekLabel, teamFeed, actionItems, kpis }) {
  const [subteamFilter, setSubteamFilter] = useState('all')
  const [selectedTaskKey, setSelectedTaskKey] = useState(null)
  const filteredTeamFeed = subteamFilter === 'all'
    ? teamFeed
    : teamFeed.filter(member => member.subteam === subteamFilter)
  const sharedTasks = filteredTeamFeed.flatMap(member => (member.items || []).map(task => ({
    ...task,
    memberUid: member.uid,
    memberName: member.displayName,
    memberPhotoURL: member.photoURL,
    subteam: member.subteam,
    subteamLabel: member.subteamLabel || getSubteamLabel(member.subteam),
  })))
  const doneTasks = sharedTasks.filter(task => task.status === 'done')
  const activeSharedTasks = sharedTasks.filter(task => task.status !== 'done')
  const blockedTasks = activeSharedTasks.filter(task => task.status === 'blocked')
  const dueSignalTasks = activeSharedTasks
    .map(task => ({ ...task, dueRemain: daysUntil(task.dueDate) }))
    .filter(task => task.status === 'blocked' || (task.dueRemain !== null && task.dueRemain <= 7))
    .sort((a, b) => {
      if (a.status === 'blocked' && b.status !== 'blocked') return -1
      if (a.status !== 'blocked' && b.status === 'blocked') return 1
      return (a.dueRemain ?? 999) - (b.dueRemain ?? 999)
    })
  const lateTasks = dueSignalTasks.filter(task => task.dueRemain !== null && task.dueRemain < 0)
  const dueSoonTasks = dueSignalTasks.filter(task => task.dueRemain !== null && task.dueRemain >= 0 && task.dueRemain <= 7)
  const actionDone = actionItems.filter(item => item.status === 'done' || item.done).length
  const actionPct = actionItems.length ? Math.round((actionDone / actionItems.length) * 100) : 0
  const focusItems = activeSharedTasks
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || dueSortValue(a.dueDate) - dueSortValue(b.dueDate))
    .slice(0, 5)
  const selectedTask = focusItems.find(task => taskKey(task) === selectedTaskKey) || focusItems[0] || null

  useEffect(() => {
    if (focusItems[0] && !focusItems.some(task => taskKey(task) === selectedTaskKey)) {
      setSelectedTaskKey(taskKey(focusItems[0]))
    }
  }, [selectedTaskKey, focusItems])

  return (
    <main className="view-stack">
      <section className="metric-grid">
        <MetricCard icon={Users} label="공유 팀원" value={`${filteredTeamFeed.length}명`} helper={subteamFilter === 'all' ? weekLabel : getSubteamLabel(subteamFilter)} tone="blue" />
        <MetricCard icon={CheckCircle2} label="공유 업무 완료율" value={`${percent(doneTasks.length, sharedTasks.length)}%`} helper={`${doneTasks.length}/${sharedTasks.length}건`} tone="green" />
        <MetricCard icon={AlertTriangle} label="개입 필요" value={`${blockedTasks.length + lateTasks.length + dueSoonTasks.length}건`} helper={`막힘 ${blockedTasks.length} · 지연 ${lateTasks.length} · 임박 ${dueSoonTasks.length}`} tone="red" />
        <MetricCard icon={Flag} label="진행 프로젝트 완료율" value={`${actionPct}%`} helper={`${actionDone}/${actionItems.length}개`} tone="teal" />
      </section>

      <SubteamFilter value={subteamFilter} onChange={setSubteamFilter} />

      <section className="content-grid two">
        <Panel title="이번 주 집중 큐" icon={Clock}>
          <div className="item-list">
            {focusItems.map(item => (
              <FocusTaskRow
                key={`${item.memberUid}-${item.id}`}
                task={item}
                active={taskKey(selectedTask) === taskKey(item)}
                onClick={() => setSelectedTaskKey(taskKey(item))}
              />
            ))}
            {focusItems.length === 0 && <EmptyText text="팀원이 공유한 진행 업무가 없습니다." />}
          </div>
          {selectedTask && <TeamTaskDetail task={selectedTask} />}
        </Panel>

        <Panel title="마감·병목 신호" icon={Activity}>
          <div className="item-list">
            {dueSignalTasks.slice(0, 6).map(task => (
              <TaskSignal key={`${task.memberUid}-${task.id}`} task={task} />
            ))}
            {dueSignalTasks.length === 0 && <EmptyText text="7일 이내 마감 또는 막힘 업무가 없습니다." />}
          </div>
        </Panel>
      </section>

      <KpiSection kpis={kpis} editable />
    </main>
  )
}

function FocusTaskRow({ task, active, onClick }) {
  const due = daysUntil(task.dueDate)
  return (
    <button className={`focus-task-row ${active ? 'active' : ''}`} onClick={onClick}>
      <div>
        <strong>{task.title}</strong>
        <span>{task.subteamLabel || getSubteamLabel(task.subteam)} · {task.memberName || task.ownerName || '담당자 미지정'}</span>
      </div>
      <div className="badge-row">
        {task.isFocus && <Badge tone="teal">지정 우선순위</Badge>}
        <Badge tone={STATUS_META[task.status]?.tone}>{STATUS_META[task.status]?.label || task.status}</Badge>
        <Badge tone={PRIORITY_META[task.priority]?.tone}>{PRIORITY_META[task.priority]?.label || task.priority}</Badge>
        <Badge tone={due !== null && due <= 3 ? 'red' : 'gray'}>{formatDue(task.dueDate)}</Badge>
        <Badge tone={(task.comments || []).length > 0 ? 'blue' : 'gray'}>코멘트 {(task.comments || []).length}</Badge>
      </div>
    </button>
  )
}

function TeamTaskDetail({ task, user, onAddComment }) {
  const [commentDraft, setCommentDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (!commentDraft.trim() || !onAddComment) return
    setSaving(true)
    setError('')
    try {
      await onAddComment(commentDraft)
      setCommentDraft('')
    } catch (err) {
      setError(err.message || '코멘트 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="team-task-detail">
      <div className="team-task-head">
        {task.memberPhotoURL ? <img src={task.memberPhotoURL} alt="" /> : <div className="avatar">{task.memberName?.[0] || 'N'}</div>}
        <div>
          <strong>{task.title}</strong>
          <span>{task.subteamLabel || getSubteamLabel(task.subteam)} · {task.memberName || task.ownerName || '담당자 미지정'} · {task.detail || '상세 내용 없음'}</span>
        </div>
      </div>
      {onAddComment && (
        <form className="comment-form" onSubmit={handleSubmit}>
          <input
            value={commentDraft}
            onChange={event => setCommentDraft(event.target.value)}
            placeholder={`${user?.displayName || '작성자'}님 코멘트 입력`}
          />
          <button className="secondary-action" type="submit" disabled={saving}>
            <Plus size={15} />
            {saving ? '저장 중' : '등록'}
          </button>
        </form>
      )}
      {error && <div className="alert error slim">{error}</div>}
      <div className="comment-list">
        {(task.comments || []).map(comment => (
          <article className="comment-item" key={comment.id}>
            <div>
              <strong>{comment.authorName || '작성자'}</strong>
              <span>{formatCommentTime(comment.createdAt)}</span>
            </div>
            <p>{comment.text}</p>
          </article>
        ))}
        {(task.comments || []).length === 0 && <EmptyText text="이 업무에 공유된 코멘트가 없습니다." />}
      </div>
    </section>
  )
}

function ActionItemDetail({ item, user, onAddComment }) {
  const [commentDraft, setCommentDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (!commentDraft.trim()) return
    setSaving(true)
    setError('')
    try {
      await onAddComment(commentDraft)
      setCommentDraft('')
    } catch (err) {
      setError(err.message || '코멘트 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="team-task-detail action-detail">
      <div className="team-task-head">
        <div className="avatar">{normalizeAssignee(item.assignee)?.[0] || 'N'}</div>
        <div>
          <strong>{item.title}</strong>
          <span>{normalizeAssignee(item.assignee)} · {item.detail || '상세 내용 없음'}</span>
        </div>
      </div>
      <form className="comment-form" onSubmit={handleSubmit}>
        <input
          value={commentDraft}
          onChange={event => setCommentDraft(event.target.value)}
          placeholder={`${user?.displayName || '작성자'}님 코멘트 입력`}
        />
        <button className="secondary-action" type="submit" disabled={saving}>
          <Plus size={15} />
          {saving ? '저장 중' : '등록'}
        </button>
      </form>
      {error && <div className="alert error slim">{error}</div>}
      <div className="comment-list">
        {(item.comments || []).map(comment => (
          <article className="comment-item" key={comment.id}>
            <div>
              <strong>{comment.authorName || '작성자'}</strong>
              <span>{formatCommentTime(comment.createdAt)}</span>
            </div>
            <p>{comment.text}</p>
          </article>
        ))}
        {(item.comments || []).length === 0 && <EmptyText text="이 프로젝트에 남긴 코멘트가 없습니다." />}
      </div>
    </section>
  )
}

function CommentInboxRow({ comment, active, onClick }) {
  const source = comment.task || comment.item
  const isAction = comment.sourceType === 'action'
  return (
    <button className={`comment-inbox-row ${active ? 'active' : ''}`} onClick={onClick}>
      <div className="comment-inbox-main">
        <strong>{comment.text}</strong>
        <span>{comment.authorName || '작성자'} · {formatCommentTime(comment.createdAt)}</span>
      </div>
      <div className="badge-row">
        <Badge tone="blue">{isAction ? '진행 프로젝트' : '팀 업무'}</Badge>
        <Badge tone="gray">{source.title}</Badge>
        <Badge tone="gray">{source.subteamLabel || getSubteamLabel(source.subteam || assigneeToSubteam(source.assignee))}</Badge>
        <Badge tone={STATUS_META[source.status]?.tone}>{STATUS_META[source.status]?.label || source.status}</Badge>
      </div>
    </button>
  )
}

function SubteamFilter({ value, onChange }) {
  return (
    <div className="subteam-filter">
      <button className={value === 'all' ? 'active' : ''} onClick={() => onChange('all')}>전체</button>
      {SUBTEAMS.map(team => (
        <button key={team.id} className={value === team.id ? 'active' : ''} onClick={() => onChange(team.id)}>
          {team.label}
        </button>
      ))}
    </div>
  )
}

function PersonalBoard({ user, memberProfile, weekKey, weekLabel }) {
  const [tasks, setTasks] = useState([])
  const [history, setHistory] = useState([])
  const [draft, setDraft] = useState({
    title: '',
    detail: '',
    priority: 'normal',
    status: 'todo',
    dueDate: '',
    impact: '',
    visibility: 'team',
    isFocus: false,
  })
  const [saving, setSaving] = useState(false)
  const [taskSaving, setTaskSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [taskError, setTaskError] = useState('')
  const [openTaskId, setOpenTaskId] = useState(null)

  useEffect(() => {
    return subscribeWeekTasks(DEFAULT_TEAM_ID, user.uid, weekKey, setTasks)
  }, [user.uid, weekKey])

  useEffect(() => {
    refreshHistory()
  }, [user.uid])

  async function refreshHistory() {
    const items = await getTaskHistory(DEFAULT_TEAM_ID, user.uid)
    setHistory(items)
  }

  async function persist(nextTasks, { syncTeam = true } = {}) {
    setTasks(nextTasks)
    await saveWeekTasks(DEFAULT_TEAM_ID, user.uid, weekKey, nextTasks)
    if (syncTeam) {
      await shareWeekToTeam(DEFAULT_TEAM_ID, user.uid, weekKey, user, memberProfile, nextTasks)
    }
  }

  async function handleAddTask(event) {
    event.preventDefault()
    setTaskError('')
    setMessage('')
    if (!draft.title.trim()) {
      setTaskError('업무명을 입력한 뒤 추가를 눌러주세요.')
      return
    }
    const now = new Date().toISOString()
    const nextTasks = [
      ...tasks,
      {
        id: generateId('task'),
        ...draft,
        title: draft.title.trim(),
        detail: draft.detail.trim(),
        impact: draft.impact.trim(),
        ownerUid: user.uid,
        ownerName: user.displayName || user.email,
        createdAt: now,
        updatedAt: now,
      },
    ]

    setTaskSaving(true)
    try {
      const isTeamTask = draft.visibility !== 'private'
      await persist(nextTasks)
      setDraft({ title: '', detail: '', priority: 'normal', status: 'todo', dueDate: '', impact: '', visibility: 'team', isFocus: false })
      setMessage(isTeamTask ? '이번 주 업무에 추가되고 팀 보드에 공유되었습니다.' : '개인 보관 업무로 저장되었습니다.')
      await refreshHistory()
    } catch (error) {
      setTaskError(error.message || '업무 저장에 실패했습니다.')
    } finally {
      setTaskSaving(false)
    }
  }

  async function updateTask(taskId, patch) {
    const now = new Date().toISOString()
    const next = tasks.map(task => {
      if (task.id !== taskId) return task
      const nextStatus = patch.status || task.status
      return {
        ...task,
        ...patch,
        completedAt: nextStatus === 'done' ? (task.completedAt || now) : null,
        updatedAt: now,
      }
    })
    try {
      await persist(next)
    } catch (error) {
      setTaskError(error.message || '업무 상태 저장에 실패했습니다.')
    }
  }

  async function completeTask(taskId) {
    const task = tasks.find(item => item.id === taskId)
    if (!task) return
    const ok = window.confirm(`"${task.title}" 업무를 완료 처리할까요?\n완료하면 이번 주 업무 목록에서 내려가고 완료 업무 히스토리에 표시됩니다.`)
    if (!ok) return
    await updateTask(taskId, { status: 'done' })
    setOpenTaskId(null)
    setMessage('완료 처리되어 완료 업무 히스토리로 이동했습니다.')
  }

  async function addTaskComment(taskId, text) {
    const trimmed = text.trim()
    if (!trimmed) return
    const now = new Date().toISOString()
    const next = tasks.map(task => {
      if (task.id !== taskId) return task
      return {
        ...task,
        comments: [
          ...(task.comments || []),
          {
            id: generateId('comment'),
            text: trimmed,
            authorUid: user.uid,
            authorName: user.displayName || user.email,
            createdAt: now,
          },
        ],
        updatedAt: now,
      }
    })

    try {
      await persist(next)
    } catch (error) {
      setTaskError(error.message || '코멘트 저장에 실패했습니다.')
    }
  }

  async function addTaskProgress(taskId, text) {
    const trimmed = text.trim()
    if (!trimmed) return
    const now = new Date().toISOString()
    const next = tasks.map(task => {
      if (task.id !== taskId) return task
      return {
        ...task,
        progressLogs: [
          ...(task.progressLogs || []),
          {
            id: generateId('progress'),
            text: trimmed,
            dateKey: getTodayKey(),
            authorUid: user.uid,
            authorName: user.displayName || user.email,
            createdAt: now,
          },
        ],
        updatedAt: now,
      }
    })

    try {
      await persist(next)
    } catch (error) {
      setTaskError(error.message || '오늘 진행내용 저장에 실패했습니다.')
    }
  }

  async function deleteTaskComment(taskId, commentId) {
    const next = tasks.map(task => {
      if (task.id !== taskId) return task
      return {
        ...task,
        comments: (task.comments || []).filter(comment => comment.id !== commentId),
        updatedAt: new Date().toISOString(),
      }
    })

    try {
      await persist(next)
    } catch (error) {
      setTaskError(error.message || '코멘트 삭제에 실패했습니다.')
    }
  }

  async function removeTask(taskId) {
    try {
      await persist(tasks.filter(task => task.id !== taskId))
    } catch (error) {
      setTaskError(error.message || '업무 삭제에 실패했습니다.')
    }
  }

  async function handleShare() {
    setSaving(true)
    setMessage('')
    try {
      await shareWeekToTeam(DEFAULT_TEAM_ID, user.uid, weekKey, user, memberProfile, tasks)
      setMessage('팀 보드에 공유되었습니다.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  const activeTasks = tasks.filter(task => task.status !== 'done')
  const completedTasks = tasks.filter(task => task.status === 'done')
  const currentRate = percent(completedTasks.length, tasks.length)
  const todayHighlights = getTodayProgressLogs(tasks)

  return (
    <main className="content-grid personal-layout">
      <section className="view-stack">
        <section className="metric-grid compact">
          <MetricCard icon={ListChecks} label="이번 주 업무" value={`${tasks.length}건`} helper={`완료율 ${currentRate}%`} tone="blue" />
          <MetricCard icon={CheckCircle2} label="완료" value={`${completedTasks.length}건`} helper="AI 분석 기준" tone="green" />
          <MetricCard icon={AlertTriangle} label="막힘" value={`${tasks.filter(task => task.status === 'blocked').length}건`} helper="팀장 공유 필요" tone="red" />
        </section>

        <Panel title="이번 주 업무" icon={ListChecks} action={
          <button className="secondary-action" onClick={handleShare} disabled={saving}>
            <Send size={15} />
            {saving ? '공유 중' : '팀에 공유'}
          </button>
        }>
          <form className="task-form" onSubmit={handleAddTask}>
            <input
              value={draft.title}
              onChange={event => setDraft({ ...draft, title: event.target.value })}
              placeholder="업무명"
            />
            <input
              value={draft.impact}
              onChange={event => setDraft({ ...draft, impact: event.target.value })}
              placeholder="연결 KPI 또는 기대효과"
            />
            <textarea
              value={draft.detail}
              onChange={event => setDraft({ ...draft, detail: event.target.value })}
              placeholder="진행 내용, 산출물, 막힌 지점"
            />
            <div className="form-row">
              <select value={draft.priority} onChange={event => setDraft({ ...draft, priority: event.target.value })}>
                {Object.entries(PRIORITY_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
              </select>
              <select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value })}>
                {Object.entries(STATUS_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
              </select>
              <input type="date" value={draft.dueDate} onChange={event => setDraft({ ...draft, dueDate: event.target.value })} />
              <select value={draft.visibility} onChange={event => setDraft({ ...draft, visibility: event.target.value })}>
                <option value="team">팀 공유</option>
                <option value="private">개인 보관</option>
              </select>
              <label className="check-toggle">
                <input
                  type="checkbox"
                  checked={draft.isFocus}
                  onChange={event => setDraft({ ...draft, isFocus: event.target.checked })}
                />
                우선순위 업무
              </label>
              <button className="primary-action" type="submit" disabled={taskSaving}>
                <Plus size={16} />
                {taskSaving ? '저장 중' : '추가'}
              </button>
            </div>
          </form>

          {taskError && <div className="alert error slim">{taskError}</div>}
          {message && <div className="alert slim">{message}</div>}

          <div className="task-list">
            {activeTasks.map(task => (
              <TaskEditor
                key={task.id}
                task={task}
                onChange={patch => updateTask(task.id, patch)}
                onComplete={() => completeTask(task.id)}
                onDelete={() => removeTask(task.id)}
                expanded={openTaskId === task.id}
                onToggleExpand={() => setOpenTaskId(openTaskId === task.id ? null : task.id)}
                onAddComment={text => addTaskComment(task.id, text)}
                onAddProgress={text => addTaskProgress(task.id, text)}
                onDeleteComment={commentId => deleteTaskComment(task.id, commentId)}
              />
            ))}
            {activeTasks.length === 0 && <EmptyText text="진행 중인 이번 주 업무가 없습니다." />}
          </div>
        </Panel>

        <Panel title="오늘의 주요업무" icon={Clock}>
          <TodayHighlights logs={todayHighlights} />
        </Panel>

        <Panel title="완료 업무 히스토리" icon={RefreshCcw}>
          <HistoryList history={history} currentWeekKey={weekKey} currentCompletedTasks={completedTasks} />
        </Panel>
      </section>

      <AINote user={user} weekKey={weekKey} weekLabel={weekLabel} completedTasks={completedTasks} />
    </main>
  )
}

function AINote({ user, weekKey, weekLabel, completedTasks }) {
  const [notes, setNotes] = useState([])
  const [manualNote, setManualNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    return subscribeIdeaNotes(DEFAULT_TEAM_ID, user.uid, setNotes)
  }, [user.uid])

  async function handleAnalyze() {
    if (completedTasks.length === 0) return
    setLoading(true)
    setError('')
    try {
      const result = await requestGemini('personal', {
        userName: user.displayName || user.email,
        weekLabel,
        completedTasks,
      })
      await addIdeaNote(DEFAULT_TEAM_ID, user.uid, {
        id: generateId('note'),
        type: 'ai',
        weekKey,
        weekLabel,
        content: result,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleManualNote(event) {
    event.preventDefault()
    if (!manualNote.trim()) return
    await addIdeaNote(DEFAULT_TEAM_ID, user.uid, {
      id: generateId('note'),
      type: 'manual',
      weekKey,
      weekLabel,
      content: manualNote.trim(),
    })
    setManualNote('')
  }

  return (
    <Panel title="AI 아이디어 노트" icon={Bot}>
      <div className="ai-box">
        <div>
          <strong>완료 {completedTasks.length}건 분석</strong>
          <span>Gemini 1.5 Flash</span>
        </div>
        <button className="primary-action" onClick={handleAnalyze} disabled={loading || completedTasks.length === 0}>
          <Lightbulb size={16} />
          {loading ? '분석 중' : '다음 주 제안'}
        </button>
      </div>
      {error && <div className="alert error slim">{error}</div>}

      <form className="note-form" onSubmit={handleManualNote}>
        <input value={manualNote} onChange={event => setManualNote(event.target.value)} placeholder="수동 메모" />
        <button className="secondary-action" type="submit">
          <Plus size={15} />
          추가
        </button>
      </form>

      <div className="note-list">
        {notes.map(note => (
          <article className="note-item" key={note.id}>
            <div className="note-head">
              <Badge tone={note.type === 'ai' ? 'blue' : 'gray'}>{note.type === 'ai' ? 'AI' : '메모'}</Badge>
              <span>{note.weekLabel}</span>
              <button className="icon-button subtle" onClick={() => deleteIdeaNote(DEFAULT_TEAM_ID, user.uid, note.id)} title="삭제">
                <Trash2 size={14} />
              </button>
            </div>
            {note.type === 'ai' ? <AiResult result={note.content} /> : <p>{note.content}</p>}
          </article>
        ))}
        {notes.length === 0 && <EmptyText text="저장된 노트가 없습니다." />}
      </div>
    </Panel>
  )
}

function TodayHighlights({ logs }) {
  if (logs.length === 0) {
    return <EmptyText text="오늘 입력된 주요업무가 없습니다. 각 업무를 눌러 오늘 진행내용을 입력해보세요." />
  }

  return (
    <div className="today-highlight-list">
      {logs.map(log => (
        <article className="today-highlight-item" key={`${log.taskId}-${log.id}`}>
          <div>
            <Badge tone="teal">{log.taskTitle}</Badge>
            {log.impact && <Badge tone="green">{log.impact}</Badge>}
            <span>{formatCommentTime(log.createdAt)}</span>
          </div>
          <p>{log.text}</p>
        </article>
      ))}
    </div>
  )
}

function TeamBoard({ user, teamFeed, actionItems, kpis, canManage }) {
  const [category, setCategory] = useState('all')
  const [status, setStatus] = useState('all')
  const [subteamFilter, setSubteamFilter] = useState('all')
  const [inboxMode, setInboxMode] = useState('comments')
  const [selectedActionId, setSelectedActionId] = useState(null)
  const filteredActionItems = actionItems.filter(item => {
    const categoryMatch = category === 'all' || item.category === category
    const statusMatch = status === 'all' || (item.status || (item.done ? 'done' : 'todo')) === status
    const itemSubteam = item.subteam || assigneeToSubteam(item.assignee)
    const subteamMatch = subteamFilter === 'all' || itemSubteam === subteamFilter
    return categoryMatch && statusMatch && subteamMatch
  }).map(item => ({ ...item, sourceType: 'action', actionKey: `action-${item.id}` }))
  const filteredTeamFeed = subteamFilter === 'all'
    ? teamFeed
    : teamFeed.filter(member => member.subteam === subteamFilter)
  const sharedTasks = filteredTeamFeed.flatMap(member => (member.items || []).map(task => ({
    ...task,
    memberUid: member.uid,
    memberName: member.displayName,
    memberPhotoURL: member.photoURL,
    subteam: member.subteam,
    subteamLabel: member.subteamLabel || getSubteamLabel(member.subteam),
  })))
  const filteredSharedActionItems = sharedTasks
    .filter(task => {
      const categoryMatch = category === 'all' || category === 'team'
      const statusMatch = status === 'all' || task.status === status
      return categoryMatch && statusMatch
    })
    .map(task => ({
      ...task,
      sourceType: 'shared',
      actionKey: `shared-${task.memberUid}-${task.id}`,
      category: 'team',
      assignee: task.subteamLabel || getSubteamLabel(task.subteam),
    }))
  const actionPlanItems = [...filteredActionItems, ...filteredSharedActionItems]
  const activeSharedTasks = sharedTasks
    .filter(task => task.status !== 'done')
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || dueSortValue(a.dueDate) - dueSortValue(b.dueDate))
  const priorityTasks = activeSharedTasks
    .filter(task => task.isFocus || task.status === 'blocked' || isDueSoon(task) || task.priority === 'high')
    .sort((a, b) => taskFocusRank(a) - taskFocusRank(b))
  const recentComments = [
    ...sharedTasks.flatMap(task => (task.comments || []).map(comment => ({ ...comment, task, sourceType: 'shared' }))),
    ...filteredActionItems.flatMap(item => (item.comments || []).map(comment => ({
      ...comment,
      item: {
        ...item,
        subteam: item.subteam || assigneeToSubteam(item.assignee),
        subteamLabel: getSubteamLabel(item.subteam || assigneeToSubteam(item.assignee)),
      },
      sourceType: 'action',
    }))),
  ]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 12)
  useEffect(() => {
    if (selectedActionId && !actionPlanItems.some(item => item.actionKey === selectedActionId)) {
      setSelectedActionId(null)
    }
  }, [selectedActionId, actionPlanItems])

  async function handleAddSharedComment(task, text) {
    const now = new Date().toISOString()
    await addSharedTaskComment(DEFAULT_TEAM_ID, weekKey, task.memberUid, task.id, {
      id: generateId('comment'),
      text: text.trim(),
      authorUid: user.uid,
      authorName: user.displayName || user.email,
      createdAt: now,
    })
  }

  async function handleAddActionComment(item, text) {
    if (item.sourceType === 'shared') {
      await handleAddSharedComment(item, text)
      return
    }
    const now = new Date().toISOString()
    await addActionItemComment(DEFAULT_TEAM_ID, item.id, {
      id: generateId('comment'),
      text: text.trim(),
      authorUid: user.uid,
      authorName: user.displayName || user.email,
      createdAt: now,
    })
  }

  async function handleActionStatusChange(item, nextStatus) {
    if (item.sourceType === 'shared') {
      await updateSharedTaskFields(DEFAULT_TEAM_ID, weekKey, item.memberUid, item.id, { status: nextStatus })
      return
    }
    await updateActionItemStatus(DEFAULT_TEAM_ID, item.id, nextStatus)
  }

  function focusActionItem(itemId) {
    const actionKey = String(itemId).startsWith('action-') || String(itemId).startsWith('shared-') ? itemId : `action-${itemId}`
    setSelectedActionId(actionKey)
    window.setTimeout(() => {
      document.getElementById(`action-item-${actionKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 80)
  }

  function focusSharedProject(task) {
    focusActionItem(`shared-${task.memberUid}-${task.id}`)
  }

  const selectedAction = actionPlanItems.find(item => item.actionKey === selectedActionId) || null

  return (
    <main className="view-stack">
      <KpiSection kpis={kpis} editable={canManage} />
      <SubteamFilter value={subteamFilter} onChange={setSubteamFilter} />

      <section className="content-grid two">
        <Panel title="진행 프로젝트" icon={Flag}>
          <div className="filter-row">
            {['all', ...Object.keys(CATEGORY_META)].map(key => (
              <button key={key} className={category === key ? 'active' : ''} onClick={() => setCategory(key)}>
                {key === 'all' ? '전체' : CATEGORY_META[key].label}
              </button>
            ))}
          </div>
          <div className="filter-row">
            {['all', ...Object.keys(STATUS_META)].map(key => (
              <button key={key} className={status === key ? 'active' : ''} onClick={() => setStatus(key)}>
                {key === 'all' ? '상태 전체' : STATUS_META[key].label}
              </button>
            ))}
          </div>
          <div className="item-list">
            {actionPlanItems.map(item => (
              <div className="action-with-detail" id={`action-item-${item.actionKey}`} key={item.actionKey}>
                <ActionRow
                  item={item}
                  active={selectedAction?.actionKey === item.actionKey}
                  onClick={() => setSelectedActionId(selectedAction?.actionKey === item.actionKey ? null : item.actionKey)}
                  onStatusChange={(item.sourceType === 'shared' || canManage) ? next => handleActionStatusChange(item, next) : null}
                />
                {selectedAction?.actionKey === item.actionKey && (
                  <ActionItemDetail
                    item={selectedAction}
                    user={user}
                    onAddComment={text => handleAddActionComment(selectedAction, text)}
                  />
                )}
              </div>
            ))}
            {actionPlanItems.length === 0 && <EmptyText text="조건에 맞는 진행 프로젝트가 없습니다." />}
          </div>
        </Panel>

        <Panel title="팀 업무 인박스" icon={Users}>
          <div className="inbox-tabs">
            <button className={inboxMode === 'comments' ? 'active' : ''} onClick={() => setInboxMode('comments')}>
              최근 코멘트
            </button>
            <button className={inboxMode === 'priority' ? 'active' : ''} onClick={() => setInboxMode('priority')}>
              우선순위 업무
            </button>
          </div>
          <div className="item-list">
            {inboxMode === 'comments' && recentComments.map(comment => (
              <CommentInboxRow
                key={`${comment.sourceType}-${comment.task ? taskKey(comment.task) : comment.item.id}-${comment.id}`}
                comment={comment}
                active={comment.sourceType === 'shared'
                  ? selectedActionId === `shared-${comment.task.memberUid}-${comment.task.id}`
                  : selectedActionId === comment.item.actionKey}
                onClick={() => {
                  if (comment.sourceType === 'shared') {
                    focusSharedProject(comment.task)
                    return
                  }
                  focusActionItem(comment.item.actionKey || comment.item.id)
                }}
              />
            ))}
            {inboxMode === 'comments' && recentComments.length === 0 && <EmptyText text="최근 팀 코멘트가 없습니다." />}

            {inboxMode === 'priority' && priorityTasks.map(task => (
              <FocusTaskRow
                key={taskKey(task)}
                task={task}
                active={selectedActionId === `shared-${task.memberUid}-${task.id}`}
                onClick={() => focusSharedProject(task)}
              />
            ))}
            {inboxMode === 'priority' && priorityTasks.length === 0 && <EmptyText text="해당 팀의 공유 진행 업무가 없습니다." />}
          </div>
        </Panel>
      </section>

      <Panel title="팀원별 공유 현황" icon={Users}>
        <div className="member-list member-grid">
          {filteredTeamFeed.map(member => <MemberCard key={member.uid} member={member} isMe={member.uid === user.uid} />)}
          {filteredTeamFeed.length === 0 && <EmptyText text="아직 공유된 업무가 없습니다." />}
        </div>
      </Panel>

      <Panel title="채널 전략 요약" icon={BarChart3}>
        <div className="channel-grid">
          {CHANNEL_STRATEGIES.map(item => (
            <article className="channel-item" key={item.channel}>
              <strong>{item.channel}</strong>
              <Badge tone="blue">{item.role}</Badge>
              <p>{item.focus}</p>
              <span>{item.rule}</span>
              <div className="channel-actions">
                {(item.actions || []).map(action => <small key={action}>{action}</small>)}
              </div>
              <div className="channel-metrics">
                {(item.metrics || []).map(metric => <Badge key={metric} tone="gray">{metric}</Badge>)}
              </div>
            </article>
          ))}
        </div>
      </Panel>
    </main>
  )
}

function ReportBoard({ weekLabel, teamFeed, actionItems, kpis }) {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleGenerate() {
    setLoading(true)
    setError('')
    try {
      const result = await requestGemini('teamReport', { weekLabel, teamFeed, actionItems, kpis })
      setReport(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const reportText = report ? [
    report.headline,
    '',
    '[완료/진전]',
    ...(report.completed || []).map(item => `- ${item}`),
    '',
    '[리스크]',
    ...(report.risks || []).map(item => `- ${item}`),
    '',
    '[다음 액션]',
    ...(report.nextActions || []).map(item => `- ${item}`),
    '',
    '[보고문]',
    report.executiveBrief,
  ].join('\n') : ''

  return (
    <main className="content-grid report-layout">
      <Panel title="AI 보고 초안 생성" icon={Bot}>
        <div className="report-source">
          <MetricCard icon={Users} label="팀 공유" value={`${teamFeed.length}명`} helper="이번 주 기준" tone="blue" />
          <MetricCard icon={Flag} label="진행 프로젝트" value={`${actionItems.length}개`} helper="프로젝트 기준" tone="teal" />
          <MetricCard icon={BarChart3} label="KPI" value={`${kpis.length}개`} helper="운영 지표" tone="green" />
        </div>
        <button className="primary-action wide" onClick={handleGenerate} disabled={loading}>
          <Bot size={16} />
          {loading ? '생성 중' : 'Gemini 1.5 Flash로 보고 초안 생성'}
        </button>
        {error && <div className="alert error slim">{error}</div>}
      </Panel>

      <Panel title="보고 초안" icon={ClipboardList} action={
        <button className="secondary-action" onClick={() => reportText && navigator.clipboard?.writeText(reportText)} disabled={!report}>
          <Check size={15} />
          복사
        </button>
      }>
        {!report ? (
          <EmptyText text="생성된 보고 초안이 없습니다." />
        ) : (
          <article className="report-output">
            <h2>{report.headline}</h2>
            <ReportList title="완료/진전" items={report.completed} />
            <ReportList title="리스크" items={report.risks} />
            <ReportList title="다음 액션" items={report.nextActions} />
            <div className="executive-brief">{report.executiveBrief}</div>
          </article>
        )}
      </Panel>
    </main>
  )
}

function TaskEditor({ task, onChange, onComplete, onDelete, expanded, onToggleExpand, onAddComment, onAddProgress, onDeleteComment }) {
  const [commentDraft, setCommentDraft] = useState('')
  const [progressDraft, setProgressDraft] = useState('')
  const [draftStatus, setDraftStatus] = useState(task.status)
  const [draftPriority, setDraftPriority] = useState(task.priority)
  const [draftIsFocus, setDraftIsFocus] = useState(Boolean(task.isFocus))
  const due = daysUntil(task.dueDate)
  const todayLogs = (task.progressLogs || []).filter(log => log.dateKey === getTodayKey())

  useEffect(() => {
    setDraftStatus(task.status)
    setDraftPriority(task.priority)
    setDraftIsFocus(Boolean(task.isFocus))
  }, [task.status, task.priority, task.isFocus])

  async function handleAddComment(event) {
    event.preventDefault()
    if (!commentDraft.trim()) return
    await onAddComment(commentDraft)
    setCommentDraft('')
  }

  async function handleAddProgress(event) {
    event.preventDefault()
    if (!progressDraft.trim()) return
    await onAddProgress(progressDraft)
    setProgressDraft('')
  }

  async function handleConfirmStatus() {
    if (draftStatus === 'done') {
      await onComplete()
      return
    }
    await onChange({ status: draftStatus, priority: draftPriority, isFocus: draftIsFocus })
  }

  return (
    <article className={`task-editor ${task.status === 'done' ? 'done' : ''} ${expanded ? 'expanded' : ''}`}>
      <div className="task-row" onClick={onToggleExpand} role="button" tabIndex={0} onKeyDown={event => event.key === 'Enter' && onToggleExpand()}>
        <div className="task-main">
        <span className={`status-dot ${STATUS_META[task.status]?.tone || 'gray'}`} />
        <div>
          <strong>{task.title}</strong>
          {task.detail && <p>{task.detail}</p>}
          <div className="badge-row">
            <Badge tone={STATUS_META[task.status]?.tone}>{STATUS_META[task.status]?.label || task.status}</Badge>
            <Badge tone={PRIORITY_META[task.priority]?.tone}>{PRIORITY_META[task.priority]?.label || task.priority}</Badge>
            {task.isFocus && <Badge tone="teal">우선순위</Badge>}
            <Badge tone={due !== null && due < 0 && task.status !== 'done' ? 'red' : 'gray'}>{formatDue(task.dueDate)}</Badge>
            {task.impact && <Badge tone="green">{task.impact}</Badge>}
            {(task.progressLogs || []).length > 0 && <Badge tone="teal">진행 {(task.progressLogs || []).length}</Badge>}
            <Badge tone={(task.comments || []).length > 0 ? 'blue' : 'gray'}>
              코멘트 {(task.comments || []).length}
            </Badge>
          </div>
        </div>
      </div>
        <div className="task-controls" onClick={event => event.stopPropagation()}>
        <select value={draftStatus} onChange={event => setDraftStatus(event.target.value)}>
          {Object.entries(STATUS_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
        </select>
        <select value={draftPriority} onChange={event => setDraftPriority(event.target.value)}>
          {Object.entries(PRIORITY_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
        </select>
        <label className="check-toggle compact">
          <input
            type="checkbox"
            checked={draftIsFocus}
            onChange={event => setDraftIsFocus(event.target.checked)}
          />
          우선순위
        </label>
        <button className="secondary-action" onClick={handleConfirmStatus}>
          <Check size={15} />
          확인
        </button>
        <button className="icon-button subtle" onClick={onDelete} title="삭제">
          <Trash2 size={15} />
        </button>
        </div>
      </div>
      {expanded && (
        <div className="comment-panel">
          <div className="comment-title">
            <Clock size={16} />
            <strong>{task.title} 오늘 진행내용</strong>
          </div>
          <form className="comment-form" onSubmit={handleAddProgress}>
            <input
              value={progressDraft}
              onChange={event => setProgressDraft(event.target.value)}
              placeholder="오늘 이 업무에서 진행한 내용, 산출물, 결정사항을 입력하세요"
            />
            <button className="secondary-action" type="submit">
              <Plus size={15} />
              등록
            </button>
          </form>
          <div className="comment-list progress-list">
            {todayLogs.map(log => (
              <article className="comment-item progress-item" key={log.id}>
                <div>
                  <strong>{log.authorName || '작성자'}</strong>
                  <span>{formatCommentTime(log.createdAt)}</span>
                </div>
                <p>{log.text}</p>
              </article>
            ))}
            {todayLogs.length === 0 && <EmptyText text="오늘 입력한 진행내용이 없습니다." />}
          </div>

          <div className="comment-title">
            <MessageSquareText size={16} />
            <strong>{task.title} 코멘트</strong>
          </div>
          <form className="comment-form" onSubmit={handleAddComment}>
            <input
              value={commentDraft}
              onChange={event => setCommentDraft(event.target.value)}
              placeholder="이 업무에 대한 코멘트를 입력하세요"
            />
            <button className="secondary-action" type="submit">
              <Plus size={15} />
              등록
            </button>
          </form>
          <div className="comment-list">
            {(task.comments || []).map(comment => (
              <article className="comment-item" key={comment.id}>
                <div>
                  <strong>{comment.authorName || '작성자'}</strong>
                  <span>{formatCommentTime(comment.createdAt)}</span>
                </div>
                <p>{comment.text}</p>
                <button className="icon-button subtle" onClick={() => onDeleteComment(comment.id)} title="코멘트 삭제">
                  <Trash2 size={14} />
                </button>
              </article>
            ))}
            {(task.comments || []).length === 0 && <EmptyText text="아직 코멘트가 없습니다." />}
          </div>
        </div>
      )}
    </article>
  )
}

function ActionRow({ item, onStatusChange, compact = false, active = false, onClick }) {
  const currentStatus = item.status || (item.done ? 'done' : 'todo')
  const [draftStatus, setDraftStatus] = useState(currentStatus)
  const assigneeLabel = item.subteam ? getSubteamLabel(item.subteam) : normalizeAssignee(item.assignee)

  useEffect(() => {
    setDraftStatus(currentStatus)
  }, [currentStatus])

  function handleConfirm() {
    if (!onStatusChange || draftStatus === currentStatus) return
    const ok = window.confirm(`"${item.title}" 상태를 "${STATUS_META[draftStatus]?.label}"로 변경할까요?`)
    if (!ok) return
    onStatusChange(draftStatus)
  }

  return (
    <article className={`action-row ${compact ? 'compact' : ''} ${active ? 'active' : ''}`} onClick={onClick}>
      <div>
        <div className="row-title">
          <strong>{item.title}</strong>
          <Badge tone={CATEGORY_META[item.category]?.tone}>{CATEGORY_META[item.category]?.label}</Badge>
        </div>
        {!compact && <p>{item.detail}</p>}
        <div className="badge-row">
          <Badge tone={STATUS_META[currentStatus]?.tone}>{STATUS_META[currentStatus]?.label}</Badge>
          <Badge tone={PRIORITY_META[item.priority]?.tone}>{PRIORITY_META[item.priority]?.label}</Badge>
          <Badge tone="gray">{assigneeLabel}</Badge>
          <Badge tone={daysUntil(item.dueDate) < 0 && currentStatus !== 'done' ? 'red' : 'gray'}>{formatDue(item.dueDate)}</Badge>
          <Badge tone={(item.comments || []).length > 0 ? 'blue' : 'gray'}>코멘트 {(item.comments || []).length}</Badge>
        </div>
      </div>
      {onStatusChange && (
        <div className="status-confirm" onClick={event => event.stopPropagation()}>
          <select value={draftStatus} onChange={event => setDraftStatus(event.target.value)}>
            {Object.entries(STATUS_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
          </select>
          <button className="secondary-action" onClick={handleConfirm} disabled={draftStatus === currentStatus}>
            <Check size={15} />
            확인
          </button>
        </div>
      )}
    </article>
  )
}

function MemberCard({ member, isMe }) {
  const items = member.items || []
  const done = items.filter(item => item.status === 'done').length
  return (
    <article className={`member-card ${isMe ? 'mine' : ''}`}>
      <div className="member-head">
        {member.photoURL ? <img src={member.photoURL} alt="" /> : <div className="avatar">{member.displayName?.[0] || 'N'}</div>}
        <div>
          <strong>{member.displayName}</strong>
          <span>{member.subteamLabel || getSubteamLabel(member.subteam)} · {done}/{items.length} 완료</span>
        </div>
      </div>
      <div className="progress-track"><span style={{ width: `${percent(done, items.length)}%` }} /></div>
      <div className="mini-task-list">
        {items.slice(0, 5).map(item => (
          <div key={item.id}>
            <Badge tone={STATUS_META[item.status]?.tone}>{STATUS_META[item.status]?.label}</Badge>
            <span>{item.title}</span>
          </div>
        ))}
      </div>
    </article>
  )
}

function KpiSection({ kpis, editable = false }) {
  return (
    <Panel title="KPI 바" icon={BarChart3}>
      <div className="kpi-grid">
        {kpis.map(kpi => <KpiCard key={kpi.id} kpi={kpi} editable={editable} />)}
        {kpis.length === 0 && <EmptyText text="등록된 KPI가 없습니다." />}
      </div>
    </Panel>
  )
}

function KpiCard({ kpi, editable }) {
  const pct = Math.min(percent(Number(kpi.current), Number(kpi.target)), 100)
  const [value, setValue] = useState(kpi.current)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setValue(kpi.current)
  }, [kpi.current])

  async function commitValue() {
    if (!editable || String(value) === String(kpi.current)) return
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      await updateKpiValue(DEFAULT_TEAM_ID, kpi.id, value)
      setSaved(true)
    } catch (err) {
      setError(err.message || 'KPI 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className={`kpi-card ${kpi.color || 'teal'}`}>
      <span>{kpi.label}</span>
      <strong>{Number(kpi.current).toLocaleString()}{kpi.unit}</strong>
      <div className="progress-track"><span style={{ width: `${pct}%` }} /></div>
      <div className="kpi-foot">
        <small>목표 {Number(kpi.target).toLocaleString()}{kpi.unit}</small>
        {editable && (
          <div className="kpi-edit">
            <input
              value={value}
              onChange={event => {
                setValue(event.target.value)
                setSaved(false)
                setError('')
              }}
              onKeyDown={event => event.key === 'Enter' && commitValue()}
              aria-label={`${kpi.label} 현재값`}
            />
            <button className="secondary-action mini" onClick={commitValue} disabled={saving || String(value) === String(kpi.current)}>
              {saving ? '저장 중' : '저장'}
            </button>
          </div>
        )}
      </div>
      {editable && saved && <small className="save-state">저장됨</small>}
      {editable && error && <small className="save-state error">{error}</small>}
    </article>
  )
}

function HistoryList({ history, currentWeekKey, currentCompletedTasks = [] }) {
  const currentRow = currentCompletedTasks.length > 0
    ? [{ weekKey: currentWeekKey, doneItems: currentCompletedTasks }]
    : []
  const pastRows = history
    .filter(week => week.weekKey !== currentWeekKey)
    .map(week => ({
      ...week,
      doneItems: (week.items || []).filter(item => item.status === 'done'),
    }))
    .filter(week => week.doneItems.length > 0)
  const rows = [...currentRow, ...pastRows]

  if (rows.length === 0) return <EmptyText text="이전 완료 이력이 없습니다." />

  return (
    <div className="history-list">
      {rows.map(week => (
        <details key={week.weekKey}>
          <summary>{weekKeyToLabel(week.weekKey)} <span>{week.doneItems.length}건</span></summary>
          <div className="history-table">
            {week.doneItems.map(item => (
              <article key={item.id} className="history-item">
                <strong>{item.title}</strong>
                <span>시작 {formatHistoryDate(item.createdAt)}</span>
                <span>완료 {formatHistoryDate(item.completedAt || item.updatedAt)}</span>
              </article>
            ))}
          </div>
        </details>
      ))}
    </div>
  )
}

function AiResult({ result }) {
  return (
    <div className="ai-result">
      <p>{result.summary}</p>
      {(result.suggestions || []).map((item, index) => <div key={item}>{index + 1}. {item}</div>)}
      {result.insight && <strong>{result.insight}</strong>}
    </div>
  )
}

function ReportList({ title, items = [] }) {
  return (
    <div className="report-list">
      <strong>{title}</strong>
      {items.map(item => <p key={item}>{item}</p>)}
    </div>
  )
}

function TaskSignal({ task }) {
  return (
    <article className="signal-row">
      <AlertTriangle size={16} />
      <div>
        <strong>{task.title}</strong>
        <span>{task.ownerName || '담당자 미지정'} · {formatDue(task.dueDate)}</span>
      </div>
    </article>
  )
}

function Panel({ title, icon: Icon, action, children }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <Icon size={17} />
          <h2>{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function MetricCard({ icon: Icon, label, value, helper, tone }) {
  return (
    <article className={`metric-card ${tone}`}>
      <Icon size={18} />
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
    </article>
  )
}

function Badge({ tone = 'gray', children }) {
  return <span className={`badge ${tone}`}>{children}</span>
}

function EmptyText({ text }) {
  return <div className="empty-text">{text}</div>
}

function FullScreenState({ title, message }) {
  return (
    <main className="full-state">
      <div className="brand-mark">N</div>
      <h1>{title}</h1>
      <p>{message}</p>
    </main>
  )
}

function percent(value, total) {
  return total > 0 ? Math.round((value / total) * 100) : 0
}

function priorityRank(priority) {
  return { high: 0, normal: 1, low: 2 }[priority] ?? 9
}

function dueSortValue(value) {
  const remain = daysUntil(value)
  return remain === null ? 999 : remain
}

function taskRiskRank(task) {
  const remain = daysUntil(task.dueDate)
  if (task.status === 'blocked') return -100
  if (remain !== null && remain < 0) return -50 + remain
  if (remain !== null && remain <= 3) return 0 + remain
  if (task.priority === 'high') return 20 + (remain ?? 20)
  return 100 + (remain ?? 100)
}

function isDueSoon(task) {
  const remain = daysUntil(task.dueDate)
  return remain !== null && remain <= 3
}

function taskFocusRank(task) {
  if (task.isFocus) return -1000 + taskRiskRank(task)
  return taskRiskRank(task)
}

function taskKey(task) {
  if (!task) return ''
  return `${task.memberUid || task.ownerUid || 'member'}-${task.id}`
}

function getTodayKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getTodayProgressLogs(tasks) {
  const todayKey = getTodayKey()
  return tasks
    .flatMap(task => (task.progressLogs || [])
      .filter(log => log.dateKey === todayKey)
      .map(log => ({
        ...log,
        taskId: task.id,
        taskTitle: task.title,
        impact: task.impact,
      })))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
}

function normalizeAssignee(value) {
  const label = String(value || '')
  if (label.includes('리테일')) return '리테일'
  if (label.includes('커머스')) return '커머스'
  if (label.includes('데이터') || label.includes('전략') || label.includes('마케팅') || label.includes('본부장')) return '전략파트너'
  return label || '팀 미지정'
}

function assigneeToSubteam(value) {
  const label = String(value || '')
  if (label.includes('리테일')) return 'retail'
  if (label.includes('커머스')) return 'commerce'
  if (label.includes('데이터') || label.includes('전략') || label.includes('마케팅') || label.includes('본부장')) return 'strategy_partner'
  return ''
}

function formatDue(value) {
  const remain = daysUntil(value)
  if (remain === null) return '마감 미정'
  if (remain < 0) return `${formatDate(value)} 지연`
  if (remain === 0) return '오늘 마감'
  return `${formatDate(value)} · D-${remain}`
}

function formatCommentTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function formatHistoryDate(value) {
  if (!value) return '미정'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '미정'
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}
