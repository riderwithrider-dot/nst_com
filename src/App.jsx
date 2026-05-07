import { createContext, Fragment, useContext, useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock,
  Flag,
  Home,
  Lightbulb,
  ListChecks,
  LogOut,
  MessageSquareText,
  Pencil,
  Plus,
  RefreshCcw,
  Send,
  Settings,
  ShieldAlert,
  Star,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { auth, googleProvider, isFirebaseConfigured } from './lib/firebase'
import {
  addAiUsageRecord,
  addIdeaNote,
  createPersonalKpi,
  deletePersonalKpi,
  subscribePersonalKpis,
  addActionItemComment,
  addActionItemCommentReply,
  addChangeRequest,
  addSharedTaskComment,
  addSharedTaskCommentReply,
  createActionItem,
  createKpi,
  deleteStorageFiles,
  deleteAiUsageRecord,
  deleteActionItemComment,
  deleteIdeaNote,
  deleteKpi,
  deleteSharedTaskComment,
  ensureTeamAndMember,
  getTaskHistory,
  saveWeekTasks,
  ensureRecurringTasksForWeek,
  updateTaskInWeek,
  saveDailyReport,
  seedInitialData,
  shareWeekToTeam,
  mirrorTaskToOwners,
  syncTaskPatchAcrossOwners,
  deleteTaskAcrossOwners,
  unshareTaskFromOwner,
  softDeleteActionItem,
  restoreActionItem,
  hardDeleteActionItem,
  subscribeAuditLogs,
  subscribeAiUsageRecords,
  subscribeActionItems,
  subscribeChangeRequests,
  subscribeIdeaNotes,
  subscribeKpis,
  subscribeDailyReport,
  subscribeDailyReports,
  subscribeMemberProfile,
  subscribeMembers,
  subscribeTeamFeed,
  subscribeWeekTasks,
  subscribeWeeklyRetros,
  saveWeeklyRetro,
  deleteWeeklyRetro,
  updateActionItemStatus,
  updateActionItemFields,
  updateSharedTaskFields,
  updateKpiValue,
  updateMemberProfile,
  updateMemberSubteam,
  uploadChangeRequestImages,
  uploadProgressImages,
} from './lib/db'
import {
  DEFAULT_POST_PERMISSIONS,
  DEFAULT_TEAM_ID,
  CATEGORY_META,
  CHANNEL_STRATEGIES,
  JOB_TITLES,
  MEMBER_ROLES,
  POST_PERMISSION_META,
  PRIORITY_META,
  STATUS_META,
  SUBTEAMS,
  getSubteamLabel,
  isManagerUser,
} from './lib/constants'
import { daysUntil, formatDate, generateId, getPrevWeekKey, getRecurrencePrevKey, getWeekKey, weekKeyToLabel } from './lib/date'
import { searchMatch } from './lib/search'
import { requestGemini } from './lib/ai'
import TaskFlowPanel from './TaskFlowPanel'

const MembersContext = createContext([])
export { MembersContext }

const VIEWS = [
  { id: 'home', label: '홈', icon: Home, managerOnly: true },
  { id: 'personal', label: '내 업무', icon: ListChecks },
  { id: 'team', label: '팀 보드', icon: Users },
  { id: 'report', label: '보고 초안', icon: ClipboardList, managerOnly: true },
  { id: 'requests', label: '수정요청사항', icon: MessageSquareText },
  { id: 'admin', label: '구성원 관리', icon: Settings, managerOnly: true },
  { id: 'kpi', label: 'KPI 관리', icon: BarChart3, managerOnly: true },
]

const MAX_PROGRESS_IMAGES = 3
const MAX_REQUEST_IMAGES = 5
const AI_USD_TO_KRW = 1400
const AI_MONTHLY_COST_KRW = 1120000
const DEFAULT_HOURLY_RATE_KRW = 40000

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
  const [memberProfile, setMemberProfile] = useState(null)
  const canManage = isManagerUser(user) || memberProfile?.role === 'manager'
  const availableViews = VIEWS.filter(view => !view.managerOnly || canManage)
  const [activeView, setActiveView] = useState(canManage ? 'home' : 'personal')
  const canEditSubteam = memberProfile?.role === 'manager'
  const [profileLoading, setProfileLoading] = useState(true)
  const [teamFeed, setTeamFeed] = useState([])
  const [actionItems, setActionItems] = useState([])
  const [kpis, setKpis] = useState([])
  const [members, setMembers] = useState([])
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
        subscribeMembers(DEFAULT_TEAM_ID, setMembers),
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
    <MembersContext.Provider value={members}>
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
            <span>{getProfileName(user, memberProfile)}</span>
            <Badge tone={canManage ? 'green' : 'gray'}>{memberProfile?.title || (canManage ? '팀장' : '팀원')}</Badge>
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
            user={user}
            weekKey={weekKey}
            weekLabel={weekLabel}
            teamFeed={teamFeed}
            actionItems={actionItems}
            kpis={kpis}
            canManage={canManage}
            memberProfile={memberProfile}
          />
        )}
        {activeView === 'personal' && (
          <PersonalBoard user={user} memberProfile={memberProfile} weekKey={weekKey} weekLabel={weekLabel} kpis={kpis} />
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
        {activeView === 'requests' && (
          <ChangeRequestBoard user={user} memberProfile={memberProfile} />
        )}
        {canManage && activeView === 'admin' && (
          <AdminBoard currentUser={user} />
        )}
        {canManage && activeView === 'kpi' && (
          <KpiManagementBoard
            kpis={kpis}
            teamFeed={teamFeed}
            actionItems={actionItems}
            memberProfile={memberProfile}
            user={user}
          />
        )}
      </div>
    </div>
    </MembersContext.Provider>
  )
}

// KPI 관리 별도 페이지 — 홈에 있던 KpiSection을 분리
function KpiManagementBoard({ kpis, teamFeed = [], actionItems = [], memberProfile, user }) {
  const allMembers = useContext(MembersContext)
  const userSubteam = memberProfile?.subteam || ''
  const [perMemberKpis, setPerMemberKpis] = useState({})

  useEffect(() => {
    if (!allMembers || allMembers.length === 0) return undefined
    const unsubs = allMembers.map(m =>
      subscribePersonalKpis(DEFAULT_TEAM_ID, m.uid, items => {
        setPerMemberKpis(prev => ({
          ...prev,
          [m.uid]: items.map(k => ({ ...k, _memberUid: m.uid })),
        }))
      }),
    )
    return () => { unsubs.forEach(fn => fn && fn()) }
  }, [allMembers])

  const allPersonalKpis = useMemo(
    () => Object.values(perMemberKpis).flat(),
    [perMemberKpis],
  )

  return (
    <main className="view-stack">
      <KpiSection
        kpis={kpis}
        editable
        teamFeed={teamFeed}
        actionItems={actionItems}
        personalKpis={allPersonalKpis}
        userSubteam={userSubteam}
      />
    </main>
  )
}

function AdminBoard({ currentUser }) {
  const [members, setMembers] = useState([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => subscribeMembers(DEFAULT_TEAM_ID, setMembers), [])

  async function handleUpdate(uid, patch) {
    setError('')
    setMessage('')
    try {
      await updateMemberProfile(DEFAULT_TEAM_ID, uid, patch)
      setMessage('구성원 정보가 저장되었습니다.')
    } catch (err) {
      setError(err.message || '구성원 정보 저장에 실패했습니다.')
    }
  }

  return (
    <main className="view-stack">
      <Panel title="구성원 권한 관리" icon={Settings}>
        <p className="section-help">관리자는 로그인 계정별 표시 이름, 소속팀, 직책, 역할, 게시글 권한을 조정할 수 있습니다.</p>
        {error && <div className="alert error slim">{error}</div>}
        {message && <div className="alert slim">{message}</div>}
        <div className="admin-member-list">
          {members.map(member => (
            <MemberAdminCard
              key={member.uid}
              member={member}
              isCurrentUser={member.uid === currentUser.uid}
              onUpdate={patch => handleUpdate(member.uid, patch)}
            />
          ))}
          {members.length === 0 && <EmptyText text="아직 로그인한 구성원이 없습니다." />}
        </div>
      </Panel>

      {/* 감사 로그 — 누적 기록 (삭제/복원/영구삭제 등) */}
      <AuditLogPanel />
    </main>
  )
}

// 감사 로그 패널 — 관리자 페이지에서 누적 활동 기록 조회
function AuditLogPanel() {
  const [logs, setLogs] = useState([])
  const [filterAction, setFilterAction] = useState('all')
  const [filterActor, setFilterActor] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    return subscribeAuditLogs(DEFAULT_TEAM_ID, setLogs, 500)
  }, [])

  const actorList = useMemo(() => {
    const set = new Map()
    logs.forEach(l => {
      if (l.actorUid && l.actorName) set.set(l.actorUid, l.actorName)
    })
    return Array.from(set.entries()).map(([uid, name]) => ({ uid, name }))
  }, [logs])

  const trimmed = searchTerm.trim().toLowerCase()
  const filtered = logs.filter(l => {
    if (filterAction !== 'all' && l.action !== filterAction) return false
    if (filterActor !== 'all' && l.actorUid !== filterActor) return false
    if (trimmed) {
      const haystack = `${l.targetTitle || ''} ${l.actorName || ''} ${l.action || ''}`.toLowerCase()
      if (!haystack.includes(trimmed)) return false
    }
    return true
  })

  const counts = {
    all: logs.length,
    soft_delete: logs.filter(l => l.action === 'soft_delete').length,
    restore: logs.filter(l => l.action === 'restore').length,
    hard_delete: logs.filter(l => l.action === 'hard_delete').length,
  }

  function actionLabel(action) {
    if (action === 'soft_delete') return '🗑 휴지통 이동'
    if (action === 'restore') return '↩ 복원'
    if (action === 'hard_delete') return '⚠ 영구 삭제'
    return action
  }
  function actionTone(action) {
    if (action === 'soft_delete') return 'warn'
    if (action === 'restore') return 'info'
    if (action === 'hard_delete') return 'danger'
    return 'gray'
  }
  function targetLabel(target) {
    if (target === 'actionItem') return '진행 프로젝트'
    if (target === 'task') return '개인 업무'
    return target
  }
  function fmtTime(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    if (Number.isNaN(d.getTime())) return ts
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const mi = String(d.getMinutes()).padStart(2, '0')
    return `${yyyy}.${mm}.${dd} ${hh}:${mi}`
  }

  return (
    <Panel
      title={`📋 활동 기록 (Audit Log) · 총 ${logs.length}건`}
      icon={ClipboardList}
      action={
        <span style={{ fontSize: 11, color: '#6b7280' }}>
          최근 500건 누적 보관 · 관리자 전용
        </span>
      }
    >
      <div className="audit-filter-row">
        <input
          type="search"
          className="audit-search"
          placeholder="🔍 검색 (제목 / 작성자 / 액션)"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
        <select value={filterAction} onChange={e => setFilterAction(e.target.value)}>
          <option value="all">전체 액션 ({counts.all})</option>
          <option value="soft_delete">휴지통 이동 ({counts.soft_delete})</option>
          <option value="restore">복원 ({counts.restore})</option>
          <option value="hard_delete">영구 삭제 ({counts.hard_delete})</option>
        </select>
        {actorList.length > 0 && (
          <select value={filterActor} onChange={e => setFilterActor(e.target.value)}>
            <option value="all">전체 사용자</option>
            {actorList.map(a => (
              <option key={a.uid} value={a.uid}>{a.name}</option>
            ))}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyText text={logs.length === 0 ? "아직 기록된 활동이 없습니다." : "필터 조건에 맞는 기록이 없습니다."} />
      ) : (
        <div className="audit-log-list">
          {filtered.map(log => (
            <article key={log.id} className={`audit-log-item action-${log.action}`}>
              <span className="audit-time">{fmtTime(log.timestamp)}</span>
              <span className={`audit-action tone-${actionTone(log.action)}`}>
                {actionLabel(log.action)}
              </span>
              <span className="audit-target">
                <Badge tone="gray">{targetLabel(log.target)}</Badge>
              </span>
              <span className="audit-title" title={log.targetTitle}>
                {log.targetTitle || '(제목 없음)'}
              </span>
              <span className="audit-actor">
                by <strong>{log.actorName || '?'}</strong>
              </span>
            </article>
          ))}
        </div>
      )}
    </Panel>
  )
}

function ChangeRequestBoard({ user, memberProfile }) {
  const [requests, setRequests] = useState([])
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [detail, setDetail] = useState('')
  const [expected, setExpected] = useState('')
  const [images, setImages] = useState([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const authorName = getProfileName(user, memberProfile)

  useEffect(() => subscribeChangeRequests(DEFAULT_TEAM_ID, setRequests), [])

  const prompt = buildChangeRequestPrompt({
    title,
    location,
    detail,
    expected,
    authorName,
    imageCount: images.length,
  })

  function addImageFiles(files) {
    const imageFiles = Array.from(files || []).filter(file => file.type.startsWith('image/'))
    setImages(prev => [...prev, ...imageFiles].slice(0, MAX_REQUEST_IMAGES))
  }

  function handlePaste(event) {
    const files = Array.from(event.clipboardData?.files || [])
    if (files.some(file => file.type.startsWith('image/'))) {
      event.preventDefault()
      addImageFiles(files)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const form = event.currentTarget
    if (!title.trim() || !detail.trim()) {
      setError('제목과 수정요청 내용을 입력해주세요.')
      return
    }

    setSaving(true)
    setError('')
    setMessage('')
    try {
      const requestId = generateId()
      const compressedImages = await Promise.all(images.map(compressProgressImage))
      const uploadedImages = compressedImages.length > 0
        ? await withTimeout(
            uploadChangeRequestImages(DEFAULT_TEAM_ID, user.uid, requestId, compressedImages),
            30000,
            '캡처 이미지 업로드가 30초 이상 지연되었습니다. Firebase Storage를 확인해주세요.'
          )
        : []
      const finalPrompt = buildChangeRequestPrompt({
        title,
        location,
        detail,
        expected,
        authorName,
        imageCount: uploadedImages.length,
        imageNames: uploadedImages.map(image => image.name),
      })

      await addChangeRequest(DEFAULT_TEAM_ID, {
        id: requestId,
        title: title.trim(),
        location: location.trim(),
        detail: detail.trim(),
        expected: expected.trim(),
        prompt: finalPrompt,
        images: uploadedImages,
        authorUid: user.uid,
        authorName,
        authorEmail: user.email || '',
        subteam: memberProfile?.subteam || '',
        subteamLabel: memberProfile?.subteamLabel || getSubteamLabel(memberProfile?.subteam),
        status: 'requested',
        createdAt: new Date().toISOString(),
      })

      setTitle('')
      setLocation('')
      setDetail('')
      setExpected('')
      setImages([])
      setMessage('수정요청이 저장되었습니다. 생성된 프롬프트를 복사해 바로 전달할 수 있습니다.')
      form?.reset()
    } catch (err) {
      setError(err.message || '수정요청 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="content-grid request-layout">
      <Panel title="수정요청 작성" icon={MessageSquareText}>
        <p className="section-help">화면 캡처를 붙여넣거나 이미지로 첨부하고, 원하는 수정 방향을 적으면 Codex에게 바로 전달할 프롬프트가 자동 생성됩니다.</p>
        {error && <div className="alert error slim">{error}</div>}
        {message && <div className="alert slim">{message}</div>}
        <form className="request-form" onSubmit={handleSubmit} onPaste={handlePaste}>
          <input value={title} onChange={event => setTitle(event.target.value)} placeholder="요청 제목 예: 보고 초안 메일 형식 개선" />
          <input value={location} onChange={event => setLocation(event.target.value)} placeholder="화면 위치 예: 보고 초안 > 오늘 자동 업무보고" />
          <textarea value={detail} onChange={event => setDetail(event.target.value)} placeholder="수정해야 하는 내용을 적거나, 여기에 캡처 이미지를 Ctrl+V로 붙여넣으세요." rows={5} />
          <textarea value={expected} onChange={event => setExpected(event.target.value)} placeholder="원하는 결과 예: 오른쪽에 본부장님 메일 초안이 나오고 복사 버튼이 있었으면 좋겠음" rows={3} />
          <div className="request-actions">
            <label className="file-action">
              캡처 이미지
              <input type="file" accept="image/*" multiple onChange={event => addImageFiles(event.target.files)} />
            </label>
            <button className="primary-action" type="submit" disabled={saving}>
              <Plus size={16} />
              {saving ? '저장 중' : '수정요청 저장'}
            </button>
          </div>
          {images.length > 0 && (
            <div className="image-preview-strip">
              {images.map(file => <span key={`${file.name}-${file.size}`}>{file.name}</span>)}
            </div>
          )}
        </form>
      </Panel>

      <Panel title="자동 생성 프롬프트" icon={ClipboardList} action={
        <button className="secondary-action" onClick={() => navigator.clipboard?.writeText(prompt)} disabled={!title.trim() && !detail.trim()}>
          <Check size={15} />
          복사
        </button>
      }>
        <pre className="prompt-preview">{prompt}</pre>
      </Panel>

      <Panel title="저장된 수정요청" icon={ListChecks}>
        <div className="request-list">
          {requests.map(request => (
            <article className="request-card" key={request.id}>
              <div className="note-head">
                <Badge tone="teal">{request.status === 'requested' ? '요청됨' : request.status}</Badge>
                <span>{request.authorName || '작성자'} · {formatCommentTime(request.createdAt)}</span>
              </div>
              <h3>{request.title}</h3>
              {request.location && <p className="muted-text">{request.location}</p>}
              <p>{request.detail}</p>
              {request.expected && <div className="executive-brief">{request.expected}</div>}
              {request.images?.length > 0 && <ImageStrip images={request.images} />}
              <div className="request-card-actions">
                <button className="secondary-action" onClick={() => navigator.clipboard?.writeText(request.prompt || '')}>
                  <Check size={15} />
                  프롬프트 복사
                </button>
              </div>
              <pre className="prompt-preview compact">{request.prompt}</pre>
            </article>
          ))}
          {requests.length === 0 && <EmptyText text="아직 저장된 수정요청이 없습니다." />}
        </div>
      </Panel>
    </main>
  )
}

function AiUsageBoard({ user, memberProfile, weekKey }) {
  const [records, setRecords] = useState([])
  const [weekTasks, setWeekTasks] = useState([])
  const [teamFilter, setTeamFilter] = useState('all')
  const [monthFilter, setMonthFilter] = useState('all')
  const [selectedProjectKey, setSelectedProjectKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [logText, setLogText] = useState('')
  const [logFileName, setLogFileName] = useState('')
  const [draft, setDraft] = useState({
    monthKey: getMonthKey(),
    subteam: memberProfile?.subteam || 'commerce',
    taskId: '',
    projectName: '',
    improvementTitle: '',
    tags: '',
    approvalStatus: '작성됨',
    aiTool: 'ChatGPT / Gemini / Claude',
    useCase: '',
    output: '',
    impact: '',
    baselineMinutes: '',
    aiMinutes: '',
    monthlyCount: '1',
    hourlyRateUsd: String(DEFAULT_HOURLY_RATE_KRW),
    costAvoidedUsd: '',
    revenueImpactUsd: '',
    nextStep: '',
  })
  const canManage = memberProfile?.role === 'manager' || isManagerUser(user)

  useEffect(() => subscribeAiUsageRecords(DEFAULT_TEAM_ID, setRecords), [])
  useEffect(() => subscribeWeekTasks(DEFAULT_TEAM_ID, user.uid, weekKey, setWeekTasks), [user.uid, weekKey])

  const availableMonths = Array.from(new Set(records.map(record => getRecordMonthKey(record)).filter(Boolean))).sort().reverse()
  const visibleRecords = records.filter(record => {
    const matchesTeam = teamFilter === 'all' || record.subteam === teamFilter
    const matchesMonth = monthFilter === 'all' || getRecordMonthKey(record) === monthFilter
    return matchesTeam && matchesMonth
  })
  const selectedTask = weekTasks.find(task => task.id === draft.taskId)
  const projectSummaries = buildAiProjectSummaries(visibleRecords)
  const activeProjectKey = selectedProjectKey && projectSummaries.some(project => project.key === selectedProjectKey)
    ? selectedProjectKey
    : projectSummaries[0]?.key || ''
  const activeProject = projectSummaries.find(project => project.key === activeProjectKey)
  const calculatedTimeSavedHours = Math.max(0, ((toNumber(draft.baselineMinutes) - toNumber(draft.aiMinutes)) * Math.max(1, toNumber(draft.monthlyCount))) / 60)
  const calculatedLaborValueKrw = calculatedTimeSavedHours * toNumber(draft.hourlyRateUsd)
  const calculatedValueKrw = Math.round(calculatedLaborValueKrw + toNumber(draft.costAvoidedUsd) + toNumber(draft.revenueImpactUsd))
  const totalTimeSaved = sumNumbers(visibleRecords.map(record => record.timeSavedHours))
  const totalValueKrw = sumNumbers(visibleRecords.map(getRecordValueKrw))
  const monthlyAiCostKrw = AI_MONTHLY_COST_KRW
  const roiRate = monthlyAiCostKrw > 0 ? Math.round((totalValueKrw / monthlyAiCostKrw) * 100) : 0
  const teamSummaries = SUBTEAMS.map(team => {
    const teamRecords = records.filter(record => record.subteam === team.id)
    return {
      ...team,
      count: teamRecords.length,
      hours: sumNumbers(teamRecords.map(record => record.timeSavedHours)),
      value: sumNumbers(teamRecords.map(getRecordValueKrw)),
    }
  })

  function updateDraft(field, value) {
    setDraft(prev => ({ ...prev, [field]: value }))
  }

  function applyLogToDraft(text = logText, fileName = logFileName) {
    const parsed = parseAiUsageLog(text, weekTasks)
    if (!parsed.hasContent) {
      setError('가져올 AI 업무 로그 내용이 없습니다. MD/TXT 파일을 첨부하거나 로그 내용을 붙여넣어주세요.')
      return
    }

    setDraft(prev => ({
      ...prev,
      monthKey: parsed.monthKey || prev.monthKey || getMonthKey(),
      subteam: prev.subteam || memberProfile?.subteam || 'commerce',
      taskId: parsed.taskId || prev.taskId,
      projectName: parsed.projectName || prev.projectName,
      improvementTitle: parsed.improvementTitle || prev.improvementTitle,
      tags: parsed.tags || prev.tags,
      approvalStatus: parsed.approvalStatus || prev.approvalStatus || '작성됨',
      aiTool: parsed.aiTool || prev.aiTool,
      useCase: parsed.useCase || prev.useCase,
      output: parsed.output || prev.output,
      impact: parsed.impact || prev.impact,
      baselineMinutes: parsed.baselineMinutes || prev.baselineMinutes,
      aiMinutes: parsed.aiMinutes || prev.aiMinutes,
      monthlyCount: parsed.monthlyCount || prev.monthlyCount || '1',
      hourlyRateUsd: parsed.hourlyRateUsd || prev.hourlyRateUsd || String(DEFAULT_HOURLY_RATE_KRW),
      costAvoidedUsd: parsed.costAvoidedUsd || prev.costAvoidedUsd,
      revenueImpactUsd: parsed.revenueImpactUsd || prev.revenueImpactUsd,
      nextStep: parsed.nextStep || prev.nextStep,
    }))
    setError('')
    setMessage(`${fileName ? `${fileName} ` : ''}로그를 분석해 AI 활용 기록 초안을 자동으로 채웠습니다.`)
  }

  async function handleLogFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const isTextFile = /\.(md|markdown|txt)$/i.test(file.name) || file.type.startsWith('text/')
    if (!isTextFile) {
      setError('AI 업무 로그는 MD 또는 TXT 파일로 첨부해주세요.')
      return
    }
    const text = await file.text()
    setLogText(text)
    setLogFileName(file.name)
    applyLogToDraft(text, file.name)
  }

  function copyLogTemplate() {
    const template = buildAiUsageLogTemplate(selectedTask)
    navigator.clipboard?.writeText(template)
    setMessage('AI 업무 로그 MD 템플릿을 복사했습니다. 사용한 AI 대화나 작업 로그에 붙여넣어 기록하면 됩니다.')
  }

  function copyAiPromptGuide() {
    navigator.clipboard?.writeText(buildAiUsagePromptGuide())
    setMessage('월별·부서별·프로젝트별·태그 기반 AI 활용 로그 프롬프트를 복사했습니다.')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const form = event.currentTarget
    const projectName = (draft.projectName || selectedTask?.title || '').trim()
    if (!projectName || !draft.useCase.trim()) {
      setError('대 프로젝트명과 AI 활용 내용을 입력해주세요. 내 업무에서 프로젝트를 선택하거나 직접 입력할 수 있습니다.')
      return
    }

    setSaving(true)
    setError('')
    setMessage('')
    try {
      const timeSavedHours = calculatedTimeSavedHours
      const costAvoidedKrw = toNumber(draft.costAvoidedUsd)
      const revenueImpactKrw = toNumber(draft.revenueImpactUsd)
      const hourlyRateKrw = toNumber(draft.hourlyRateUsd)
      const estimatedValueKrw = calculatedValueKrw
      await addAiUsageRecord(DEFAULT_TEAM_ID, {
        id: generateId(),
        monthKey: draft.monthKey || getMonthKey(),
        subteam: draft.subteam,
        subteamLabel: getSubteamLabel(draft.subteam),
        taskId: selectedTask?.id || '',
        taskTitle: selectedTask?.title || projectName,
        taskStatus: selectedTask?.status || '',
        taskPriority: selectedTask?.priority || '',
        taskImpact: selectedTask?.impact || '',
        projectName,
        improvementTitle: (draft.improvementTitle || draft.output || draft.useCase).trim(),
        tags: normalizeTags(draft.tags),
        approvalStatus: draft.approvalStatus || '작성됨',
        aiTool: draft.aiTool.trim(),
        useCase: draft.useCase.trim(),
        output: draft.output.trim(),
        impact: draft.impact.trim(),
        timeSavedHours,
        baselineMinutes: toNumber(draft.baselineMinutes),
        aiMinutes: toNumber(draft.aiMinutes),
        monthlyCount: Math.max(1, toNumber(draft.monthlyCount)),
        hourlyRateUsd: hourlyRateKrw,
        laborValueUsd: Math.round(calculatedLaborValueKrw),
        costAvoidedUsd: costAvoidedKrw,
        revenueImpactUsd: revenueImpactKrw,
        estimatedValueUsd: estimatedValueKrw,
        hourlyRateKrw,
        laborValueKrw: Math.round(calculatedLaborValueKrw),
        costAvoidedKrw,
        revenueImpactKrw,
        estimatedValueKrw,
        currency: 'KRW',
        calculationBasis: `(${toNumber(draft.baselineMinutes)}분 - ${toNumber(draft.aiMinutes)}분) × 월 ${Math.max(1, toNumber(draft.monthlyCount))}회 ÷ 60 × ${formatKrw(hourlyRateKrw)}/h + 외주/리서치 ${formatKrw(costAvoidedKrw)} + 기회가치 ${formatKrw(revenueImpactKrw)}`,
        nextStep: draft.nextStep.trim(),
        sourceLog: logText.trim(),
        sourceLogFileName: logFileName,
        autoFilledFromLog: Boolean(logText.trim()),
        authorUid: user.uid,
        authorName: getProfileName(user, memberProfile),
        authorEmail: user.email || '',
        createdAt: new Date().toISOString(),
      })
      setDraft({
        monthKey: getMonthKey(),
        subteam: memberProfile?.subteam || 'commerce',
        taskId: '',
        projectName: '',
        improvementTitle: '',
        tags: '',
        approvalStatus: '작성됨',
        aiTool: 'ChatGPT / Gemini / Claude',
        useCase: '',
        output: '',
        impact: '',
        baselineMinutes: '',
        aiMinutes: '',
        monthlyCount: '1',
        hourlyRateUsd: String(DEFAULT_HOURLY_RATE_KRW),
        costAvoidedUsd: '',
        revenueImpactUsd: '',
        nextStep: '',
      })
      setLogText('')
      setLogFileName('')
      setMessage('AI 활용 기록이 저장되었습니다. CSO 보고용 가치 데이터에 반영됩니다.')
      form?.reset()
    } catch (err) {
      setError(err.message || 'AI 활용 기록 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(record) {
    if (!canManage && record.authorUid !== user.uid) {
      setError('작성자 또는 관리자만 삭제할 수 있습니다.')
      return
    }
    await deleteAiUsageRecord(DEFAULT_TEAM_ID, record.id)
  }

  const csoSummary = [
    `AI 활용 기록 ${visibleRecords.length}건`,
    `누적 절감시간 ${formatNumber(totalTimeSaved)}시간`,
    `추정 가치 ${formatKrw(totalValueKrw)}`,
    `월 AI 비용 ${formatKrw(monthlyAiCostKrw)} 대비 회수율 ${roiRate}%`,
  ].join(' · ')

  return (
    <main className="content-grid ai-usage-layout">
      <section className="view-stack">
        <Panel title="AI 활용 가치 대시보드" icon={Bot}>
          <div className="metric-grid compact">
            <MetricCard icon={Bot} label="AI 활용 기록" value={`${visibleRecords.length}건`} helper={teamFilter === 'all' ? '전체 팀' : getSubteamLabel(teamFilter)} tone="blue" />
            <MetricCard icon={Clock} label="절감 시간" value={`${formatNumber(totalTimeSaved)}h`} helper="업무시간 환산" tone="teal" />
            <MetricCard icon={BarChart3} label="추정 가치" value={formatKrw(totalValueKrw)} helper={`월 ${formatKrw(monthlyAiCostKrw)} 대비 ${roiRate}%`} tone="green" />
          </div>
          <div className="filter-row">
            <select value={monthFilter} onChange={event => setMonthFilter(event.target.value)}>
              <option value="all">전체 월</option>
              {availableMonths.map(month => <option key={month} value={month}>{month}</option>)}
            </select>
            <button className={teamFilter === 'all' ? 'active' : ''} onClick={() => setTeamFilter('all')}>전체</button>
            {SUBTEAMS.map(team => (
              <button key={team.id} className={teamFilter === team.id ? 'active' : ''} onClick={() => setTeamFilter(team.id)}>
                {team.label}
              </button>
            ))}
          </div>
          <div className="executive-brief">{csoSummary}</div>
        </Panel>

        <Panel title="AI 활용 기록 작성" icon={ClipboardList}>
          {error && <div className="alert error slim">{error}</div>}
          {message && <div className="alert slim">{message}</div>}
          <form className="ai-usage-form" onSubmit={handleSubmit}>
            <div className="form-row">
              <input type="month" value={draft.monthKey} onChange={event => updateDraft('monthKey', event.target.value)} />
              <select value={draft.subteam} onChange={event => updateDraft('subteam', event.target.value)}>
                {SUBTEAMS.map(team => <option key={team.id} value={team.id}>{team.label}</option>)}
              </select>
              <select value={draft.taskId} onChange={event => updateDraft('taskId', event.target.value)}>
                <option value="">내 업무에서 프로젝트 선택</option>
                {weekTasks.map(task => (
                  <option key={task.id} value={task.id}>
                    {task.title} · {STATUS_META[task.status]?.label || task.status || '상태 미입력'}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <input value={draft.projectName} onChange={event => updateDraft('projectName', event.target.value)} placeholder="대 프로젝트 예: 홈쇼핑런칭, AI Agent 업무 자동화" />
              <input value={draft.improvementTitle} onChange={event => updateDraft('improvementTitle', event.target.value)} placeholder="개선과제 예: 제안 메일 초안 자동화" />
              <select value={draft.approvalStatus} onChange={event => updateDraft('approvalStatus', event.target.value)}>
                <option value="작성됨">작성됨</option>
                <option value="검토중">검토중</option>
                <option value="승인완료">승인완료</option>
              </select>
            </div>
            <input value={draft.tags} onChange={event => updateDraft('tags', event.target.value)} placeholder="태그 예: #문서작성 #보고 #자동화 #시간절감" />
            {weekTasks.length === 0 && <div className="alert slim">먼저 내 업무 탭에서 AI 활용을 기록할 업무를 추가해주세요.</div>}
            <div className="ai-log-import">
              <div>
                <strong>AI 업무 로그로 자동 채우기</strong>
                <p>업무마다 숫자를 다시 계산하지 않도록, AI 작업 로그 MD/TXT를 첨부하거나 붙여넣으면 활용 방식·산출물·절감시간을 보수적으로 추정합니다.</p>
              </div>
              <textarea
                value={logText}
                onChange={event => setLogText(event.target.value)}
                placeholder={[
                  '# AI 업무 로그',
                  '- 기준월: 2026-05',
                  '- 부서: 커머스',
                  '- 대 프로젝트: 현대홈쇼핑 신상품런칭',
                  '- 개선과제: 제안 메일 초안 자동화',
                  '- 태그: #문서작성 #보고 #영업지원',
                  '- 사용 AI: ChatGPT',
                  '- 활용 내용: 방송 제안서 초안 작성',
                  '- 산출물: 제안 메일 초안, 상품 비교표',
                  '- 기존 소요시간: 120분',
                  '- AI 후 소요시간: 35분',
                  '- 외주/리서치 대체비: 0원',
                  '- 매출/기회가치: 0원',
                  '- 다음 액션: MD 피드백 반영',
                ].join('\n')}
                rows={6}
              />
              <div className="request-actions">
                <button type="button" className="secondary-action" onClick={copyAiPromptGuide}>
                  AI 프롬프트 복사하기
                </button>
                <label className="file-action">
                  로그 MD/TXT 첨부
                  <input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" onChange={handleLogFileChange} />
                </label>
                <button type="button" className="secondary-action" onClick={() => applyLogToDraft()}>
                  로그 분석해서 자동 채우기
                </button>
                <button type="button" className="secondary-action" onClick={copyLogTemplate}>
                  로그 템플릿 복사
                </button>
              </div>
              {logFileName && <span className="muted-text">첨부 로그: {logFileName}</span>}
            </div>
            <input value={draft.aiTool} onChange={event => updateDraft('aiTool', event.target.value)} placeholder="사용 AI/툴 예: ChatGPT, Gemini, Claude, Perplexity" />
            <textarea value={draft.useCase} onChange={event => updateDraft('useCase', event.target.value)} placeholder="AI를 어떻게 활용했나요? 예: 홈쇼핑 제안서 초안 작성, 상품 비교표 정리, 고객 VOC 요약" rows={3} />
            <textarea value={draft.output} onChange={event => updateDraft('output', event.target.value)} placeholder="만든 산출물/결과물 예: 제안서 1차안, 보고 메일 초안, 시장조사 표" rows={3} />
            <textarea value={draft.impact} onChange={event => updateDraft('impact', event.target.value)} placeholder="업무 가치 예: 의사결정 빨라짐, 외주비 절감, 보고 품질 개선, 매출 기회 발굴" rows={3} />
            <div className="ai-value-guide">
              <strong>가치 산정 방식</strong>
              <span>절감시간 = (기존 소요시간 - AI 활용 후 소요시간) × 월 반복횟수</span>
              <span>추정가치 = 절감시간 × 시간당 기준가 + 외주/리서치 대체비 + 매출/기회가치</span>
            </div>
            <div className="form-row">
              <input type="number" min="0" step="5" value={draft.baselineMinutes} onChange={event => updateDraft('baselineMinutes', event.target.value)} placeholder="기존 소요시간(분)" />
              <input type="number" min="0" step="5" value={draft.aiMinutes} onChange={event => updateDraft('aiMinutes', event.target.value)} placeholder="AI 후 소요시간(분)" />
              <input type="number" min="1" step="1" value={draft.monthlyCount} onChange={event => updateDraft('monthlyCount', event.target.value)} placeholder="월 반복횟수" />
            </div>
            <div className="form-row">
              <input type="number" min="0" step="1000" value={draft.hourlyRateUsd} onChange={event => updateDraft('hourlyRateUsd', event.target.value)} placeholder="시간당 기준가(원)" />
              <input type="number" min="0" step="10000" value={draft.costAvoidedUsd} onChange={event => updateDraft('costAvoidedUsd', event.target.value)} placeholder="외주/리서치 대체비(원)" />
              <input type="number" min="0" step="10000" value={draft.revenueImpactUsd} onChange={event => updateDraft('revenueImpactUsd', event.target.value)} placeholder="매출/기회가치(원)" />
            </div>
            <div className="ai-value-result">
              <strong>자동 계산</strong>
              <span>절감시간 {formatNumber(calculatedTimeSavedHours)}h</span>
              <span>시간가치 {formatKrw(calculatedLaborValueKrw)}</span>
              <span>총 추정가치 {formatKrw(calculatedValueKrw)}</span>
            </div>
            <input value={draft.nextStep} onChange={event => updateDraft('nextStep', event.target.value)} placeholder="다음 액션 / 추가 활용 계획" />
            <button className="primary-action wide" type="submit" disabled={saving}>
              <Plus size={16} />
              {saving ? '저장 중' : 'AI 활용 기록 저장'}
            </button>
          </form>
        </Panel>
      </section>

      <section className="view-stack">
        <Panel title="팀별 AI 활용 현황" icon={Users}>
          <div className="ai-team-summary">
            {teamSummaries.map(team => (
              <article className="ai-team-card" key={team.id}>
                <strong>{team.label}</strong>
                <span>{team.count}건 · {formatNumber(team.hours)}h 절감 · {formatKrw(team.value)}</span>
              </article>
            ))}
          </div>
        </Panel>

        <Panel title="프로젝트별 AI 활용 기록" icon={ListChecks}>
          <div className="ai-project-list">
            {projectSummaries.map(project => (
              <button
                key={project.key}
                type="button"
                className={`ai-project-row ${activeProjectKey === project.key ? 'active' : ''}`}
                onClick={() => setSelectedProjectKey(project.key)}
              >
                <span>
                  <Badge tone="teal">{project.subteamLabel}</Badge>
                  <strong>{project.projectName}</strong>
                </span>
                <small>{project.count}건 · {formatNumber(project.hours)}h · {formatKrw(project.value)}</small>
              </button>
            ))}
            {projectSummaries.length === 0 && <EmptyText text="아직 AI 활용 기록이 없습니다. AI로 진행한 업무와 만들어낸 가치를 기록해보세요." />}
          </div>

          {activeProject && (
            <div className="ai-project-detail">
              <div className="project-detail-head">
                <div>
                  <span className="muted-text">{activeProject.months.join(', ')}</span>
                  <h3>{activeProject.projectName}</h3>
                </div>
                <div className="ledger-grid">
                  <span>로그 {activeProject.count}건</span>
                  <span>절감 {formatNumber(activeProject.hours)}h</span>
                  <span>추정가치 {formatKrw(activeProject.value)}</span>
                </div>
              </div>

              <div className="tag-row">
                {activeProject.tags.map(tag => <span key={tag}>{tag}</span>)}
              </div>

              <div className="improvement-list">
                {activeProject.improvements.map(item => <span key={item}>{item}</span>)}
              </div>

              <div className="ai-usage-list compact">
                {activeProject.records.map(record => (
                  <details className="ai-usage-card compact" key={record.id}>
                    <summary>
                      <span>
                        <strong>{record.improvementTitle || record.taskTitle}</strong>
                        <small>{record.authorName || '작성자'} · {formatCommentTime(record.createdAt)} · {record.aiTool || '미입력'}</small>
                      </span>
                      <Badge tone="gray">{record.approvalStatus || '작성됨'}</Badge>
                    </summary>
                    <p><strong>활용</strong> {record.useCase}</p>
                    {record.output && <p><strong>산출물</strong> {record.output}</p>}
                    {record.impact && <p><strong>가치</strong> {record.impact}</p>}
                    <div className="ledger-grid">
                      <span>절감 {formatNumber(record.timeSavedHours)}h</span>
                      <span>외주/리서치 {formatKrw(getRecordCostAvoidedKrw(record))}</span>
                      <span>추정가치 {formatKrw(getRecordValueKrw(record))}</span>
                    </div>
                    {record.autoFilledFromLog && (
                      <div className="log-source-chip">로그 기반 자동 기입{record.sourceLogFileName ? ` · ${record.sourceLogFileName}` : ''}</div>
                    )}
                    {record.calculationBasis && <p><strong>산정근거</strong> {record.calculationBasis}</p>}
                    {record.nextStep && <div className="executive-brief">{record.nextStep}</div>}
                    {(canManage || record.authorUid === user.uid) && (
                      <button className="icon-button" onClick={() => handleDelete(record)} title="삭제">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </details>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </section>
    </main>
  )
}

function MemberAdminCard({ member, isCurrentUser, onUpdate }) {
  const [draft, setDraft] = useState(() => ({
    displayName: member.displayName || '',
    subteam: member.subteam || 'commerce',
    title: member.title || '팀원',
    role: member.role || 'member',
    permissions: getMemberPermissions(member),
  }))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft({
      displayName: member.displayName || '',
      subteam: member.subteam || 'commerce',
      title: member.title || '팀원',
      role: member.role || 'member',
      permissions: getMemberPermissions(member),
    })
  }, [member.uid, member.displayName, member.subteam, member.title, member.role])

  async function handleSave(event) {
    event.preventDefault()
    setSaving(true)
    try {
      await onUpdate({
        displayName: draft.displayName.trim() || member.email || '이름 없음',
        subteam: draft.subteam,
        title: draft.title,
        role: draft.role,
        permissions: draft.permissions,
      })
    } finally {
      setSaving(false)
    }
  }

  function togglePermission(key) {
    setDraft({
      ...draft,
      permissions: {
        ...draft.permissions,
        [key]: !draft.permissions[key],
      },
    })
  }

  return (
    <form className="admin-member-card" onSubmit={handleSave}>
      <div className="admin-member-head">
        {member.photoURL ? <img src={member.photoURL} alt="" /> : <div className="avatar">{draft.displayName?.[0] || 'N'}</div>}
        <div>
          <strong>{member.email || '이메일 없음'}</strong>
          <span>{isCurrentUser ? '현재 로그인 계정' : member.uid}</span>
        </div>
      </div>
      <div className="admin-member-fields">
        <label>
          닉네임
          <input value={draft.displayName} onChange={event => setDraft({ ...draft, displayName: event.target.value })} />
        </label>
        <label>
          부서
          <select value={draft.subteam} onChange={event => setDraft({ ...draft, subteam: event.target.value })}>
            {SUBTEAMS.map(team => <option key={team.id} value={team.id}>{team.label}</option>)}
          </select>
        </label>
        <label>
          직책
          <select value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })}>
            {JOB_TITLES.map(title => <option key={title} value={title}>{title}</option>)}
          </select>
        </label>
        <label>
          역할
          <select value={draft.role} onChange={event => setDraft({ ...draft, role: event.target.value })}>
            {MEMBER_ROLES.map(role => <option key={role.id} value={role.id}>{role.label}</option>)}
          </select>
        </label>
      </div>
      <div className="permission-grid">
        {POST_PERMISSION_META.map(permission => (
          <label className="check-toggle" key={permission.key}>
            <input
              type="checkbox"
              checked={Boolean(draft.permissions[permission.key])}
              onChange={() => togglePermission(permission.key)}
            />
            {permission.label}
          </label>
        ))}
      </div>
      <button className="secondary-action" type="submit" disabled={saving}>
        <Check size={15} />
        {saving ? '저장 중' : '저장'}
      </button>
    </form>
  )
}

function TeamHome({ user, weekKey, weekLabel, teamFeed, actionItems, kpis, canManage, memberProfile }) {
  const userSubteam = memberProfile?.subteam || ''
  const allMembers = useContext(MembersContext)
  const [subteamFilter, setSubteamFilter] = useState('all')
  const [selectedTaskKey, setSelectedTaskKey] = useState(null)
  const [perMemberKpis, setPerMemberKpis] = useState({}) // { uid: [kpi, kpi, ...] }

  // 각 팀원별 개인 KPI 개별 구독 (collectionGroup 인덱스 불필요)
  useEffect(() => {
    if (!allMembers || allMembers.length === 0) return undefined
    const unsubs = allMembers.map(m =>
      subscribePersonalKpis(DEFAULT_TEAM_ID, m.uid, items => {
        setPerMemberKpis(prev => ({
          ...prev,
          [m.uid]: items.map(k => ({ ...k, _memberUid: m.uid })),
        }))
      }),
    )
    return () => { unsubs.forEach(fn => fn && fn()) }
  }, [allMembers])

  // 모든 팀원 KPI를 단일 배열로 평탄화
  const allPersonalKpis = useMemo(() => {
    return Object.values(perMemberKpis).flat()
  }, [perMemberKpis])
  const filteredTeamFeed = subteamFilter === 'all'
    ? teamFeed
    : teamFeed.filter(member => member.subteam === subteamFilter)
  const sharedTasks = filteredTeamFeed.flatMap(member => (member.items || []).map(task => {
    const isMine = member.uid === user.uid
    const fallbackName = user?.displayName || user?.email || '이름 없음'
    return {
      ...task,
      memberUid: member.uid,
      memberName: member.displayName || (isMine ? fallbackName : '이름 없음'),
      memberPhotoURL: member.photoURL || (isMine ? (user.photoURL || '') : ''),
      subteam: member.subteam,
      subteamLabel: member.subteamLabel || getSubteamLabel(member.subteam),
    }
  }))
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

  async function handleDeleteSharedComment(task, commentId) {
    await deleteSharedTaskComment(DEFAULT_TEAM_ID, weekKey, task.memberUid, task.id, commentId)
  }

  async function handleReplySharedComment(task, commentId, text) {
    await addSharedTaskCommentReply(DEFAULT_TEAM_ID, weekKey, task.memberUid, task.id, commentId, {
      id: generateId('reply'),
      text: text.trim(),
      authorUid: user.uid,
      authorName: user.displayName || user.email,
      createdAt: new Date().toISOString(),
    })
  }

  async function handleAddSharedComment(task, text) {
    if (!text || !text.trim()) return
    await addSharedTaskComment(DEFAULT_TEAM_ID, weekKey, task.memberUid, task.id, {
      id: generateId('comment'),
      text: text.trim(),
      authorUid: user.uid,
      authorName: user.displayName || user.email,
      createdAt: new Date().toISOString(),
    })
  }

  // 검토 요청 task 결재(승인) — 관리자/팀장/본부장만 노출되며, status를 'done'으로 변경 + 결재 도장 메타 기록
  async function handleApproveReview(task) {
    if (!task?.memberUid || !task?.id) return
    await updateSharedTaskFields(DEFAULT_TEAM_ID, weekKey, task.memberUid, task.id, {
      status: 'done',
      approvedAt: new Date().toISOString(),
      approvedByUid: user.uid,
      approvedByName: user.displayName || user.email || '관리자',
      approvedByTitle: memberProfile?.title || '',
    })
  }

  return (
    <main className="view-stack">
      <SubteamFilter value={subteamFilter} onChange={setSubteamFilter} />

      <WeeklyRetroPanel
        user={user}
        weekKey={weekKey}
        weekLabel={weekLabel}
        teamFeed={teamFeed}
        canManage={canManage}
      />

      <div className="signal-inbox-split">
        <CheckSignalPanel
          teamFeed={filteredTeamFeed}
          user={user}
          memberProfile={memberProfile}
          userSubteam={userSubteam}
          onAddComment={handleAddSharedComment}
          onReplyComment={handleReplySharedComment}
          onDeleteComment={handleDeleteSharedComment}
          onApproveReview={handleApproveReview}
        />
        <ManagerCommentInbox
          teamFeed={teamFeed}
          currentUid={user.uid}
          userSubteam={userSubteam}
          weekKey={weekKey}
          onReplyComment={handleReplySharedComment}
        />
      </div>
      <TeamWorkloadPanel teamFeed={teamFeed} userSubteam={userSubteam} />

      {/* KPI 바는 별도 KPI 관리 페이지로 이동됨 */}
    </main>
  )
}

function FocusTaskRow({ task, active, onClick }) {
  const due = daysUntil(task.dueDate)
  const status = task.status || 'todo'
  const isDueSoon = due !== null && due >= 0 && due <= 3 && status !== 'done'
  const kpiLabel = (task.kpi || task.impact || '').trim()
  const commentCount = (task.comments || []).length
  const progressCount = (task.progressLogs || []).length

  return (
    <button
      className={`focus-task-row v1 status-${status} ${active ? 'active' : ''} ${isDueSoon ? 'is-due-soon' : ''}`}
      onClick={onClick}
    >
      {/* V2: D-3 이내 좌측 빨강 D-day 강조 */}
      {isDueSoon && (
        <span className="focus-due-bar" aria-label={`마감 D-${due}`}>
          <span className="d-day">D-{due}</span>
          <span className="d-label">{due === 0 ? '오늘' : '임박'}</span>
        </span>
      )}

      {/* V1: KPI 상단 배너 */}
      {kpiLabel && (
        <span className="focus-kpi-banner" title={`KPI: ${kpiLabel}`}>
          <span className="kpi-icon">▣</span>
          <span className="kpi-text">{kpiLabel}</span>
        </span>
      )}

      <div className="focus-row-body">
        <div className="focus-row-head">
          <strong>{task.title}</strong>
          {task.isFocus && <span className="focus-star" title="우선순위 지정">★</span>}
        </div>
        <div className="focus-row-sub">
          {task.subteamLabel || getSubteamLabel(task.subteam)} · {task.memberName || task.ownerName || '담당자 미지정'}
        </div>
        <div className="focus-row-chips">
          <Badge tone={STATUS_META[status]?.tone}>{STATUS_META[status]?.label || status}</Badge>
          <Badge tone={PRIORITY_META[task.priority]?.tone}>{PRIORITY_META[task.priority]?.label || task.priority}</Badge>
          {!isDueSoon && (
            <Badge tone={due !== null && due < 0 ? 'red' : 'gray'}>{formatDue(task.dueDate)}</Badge>
          )}
          {/* 0 chip 자동 숨김 */}
          {progressCount > 0 && <Badge tone="teal">📈 {progressCount}</Badge>}
          {commentCount > 0 && <Badge tone="blue">💬 {commentCount}</Badge>}
        </div>
      </div>
    </button>
  )
}

function TeamTaskDetail({ task, user, onAddComment, onReplyComment, onDeleteComment, canManage = false }) {
  const [commentDraft, setCommentDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isOwner = task.memberUid === user?.uid || task.ownerUid === user?.uid
  const visibleComments = isOwner
    ? (task.comments || []).filter(comment => comment.authorUid !== user?.uid)
    : (task.comments || [])

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
      {onAddComment && !isOwner && (
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
      <CommentThread
        comments={visibleComments}
        user={user}
        canManage={canManage}
        onReply={onReplyComment}
        onDelete={onDeleteComment}
        emptyText={isOwner ? '아직 타인이 남긴 피드백이 없습니다.' : '이 업무에 공유된 코멘트가 없습니다.'}
      />
    </section>
  )
}

function ActionItemDetail({ item, user, onAddComment, onReplyComment, onDeleteComment, canManage = false }) {
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
      <CommentThread
        comments={item.comments || []}
        user={user}
        canManage={canManage}
        onReply={onReplyComment}
        onDelete={onDeleteComment}
        emptyText="이 프로젝트에 남긴 코멘트가 없습니다."
      />
    </section>
  )
}

function CommentThread({ comments, user, canManage = false, onReply, onDelete, emptyText }) {
  const [activeCommentId, setActiveCommentId] = useState(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleReply(event, commentId) {
    event.preventDefault()
    if (!replyDraft.trim() || !onReply) return
    setSaving(true)
    try {
      await onReply(commentId, replyDraft)
      setReplyDraft('')
      setActiveCommentId(null)
    } finally {
      setSaving(false)
    }
  }

  if (comments.length === 0) {
    return <EmptyText text={emptyText} />
  }

  return (
    <div className="comment-list chat-style">
      {comments.map(comment => {
        const isMine = comment.authorUid === user?.uid
        const replies = comment.replies || []
        return (
          <Fragment key={comment.id}>
            {/* 원본 코멘트 — 좌/우 정렬 */}
            <article className={`comment-item threaded-comment ${isMine ? 'is-mine' : 'is-other'}`}>
              <button className="comment-body-button" type="button" onClick={() => setActiveCommentId(activeCommentId === comment.id ? null : comment.id)}>
                <div>
                  <strong>{comment.authorName || '작성자'}</strong>
                  <span>{formatCommentTime(comment.createdAt)}</span>
                </div>
                <p>{comment.text}</p>
              </button>
              {onDelete && (canManage || comment.authorUid === user?.uid) && (
                <button className="icon-button subtle comment-delete-btn" onClick={() => onDelete(comment.id)} title="코멘트 삭제">
                  <Trash2 size={14} />
                </button>
              )}
            </article>

            {/* 답글들 — 각각 별도 chat-style 항목으로 시간순 표시 (원본과 같은 흐름) */}
            {replies.map(reply => {
              const replyIsMine = reply.authorUid === user?.uid
              return (
                <article
                  key={reply.id}
                  className={`comment-item reply-as-comment ${replyIsMine ? 'is-mine' : 'is-other'}`}
                >
                  <div className="comment-body-button reply-bubble">
                    <div>
                      <strong>↳ {reply.authorName || '작성자'}</strong>
                      <span>{formatCommentTime(reply.createdAt)}</span>
                    </div>
                    <p>{reply.text}</p>
                  </div>
                </article>
              )
            })}

            {/* 답글 입력 form — 활성 상태일 때만 부모 코멘트 바로 아래 */}
            {activeCommentId === comment.id && onReply && (
              <form className="comment-form reply-form chat-reply-form" onSubmit={event => handleReply(event, comment.id)}>
                <input
                  value={replyDraft}
                  onChange={event => setReplyDraft(event.target.value)}
                  placeholder="이 코멘트에 답글을 입력하세요"
                />
                <button className="secondary-action" type="submit" disabled={saving}>
                  <Plus size={15} />
                  {saving ? '저장 중' : '답글'}
                </button>
              </form>
            )}
          </Fragment>
        )
      })}
    </div>
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

function PersonalBoard({ user, memberProfile, weekKey, weekLabel, kpis = [] }) {
  const allMembers = useContext(MembersContext)
  const [tasks, setTasks] = useState([])
  const [history, setHistory] = useState([])
  const [personalKpis, setPersonalKpis] = useState([])
  const [draft, setDraft] = useState({
    title: '',
    detail: '',
    priority: 'normal',
    status: 'todo',
    dueDate: '',
    impact: '',
    visibility: 'team',
    isFocus: false,
    recurrence: '', // '' | 'weekly' | 'monthly' | 'quarterly'
    parentIds: [],
    siblingIds: [],
    coOwnerUids: [], // 공유 동시관리 대상 (본인 제외)
  })
  const [showCandidates, setShowCandidates] = useState(false) // KPI 선택 시 추천 박스 표시
  const [saving, setSaving] = useState(false)
  const [dailyReportSaving, setDailyReportSaving] = useState(false)
  const [taskSaving, setTaskSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [taskError, setTaskError] = useState('')
  const [openTaskId, setOpenTaskId] = useState(null)
  const permissions = getMemberPermissions(memberProfile)

  useEffect(() => {
    return subscribeWeekTasks(DEFAULT_TEAM_ID, user.uid, weekKey, setTasks)
  }, [user.uid, weekKey])

  useEffect(() => {
    refreshHistory()
  }, [user.uid])

  useEffect(() => {
    return subscribePersonalKpis(DEFAULT_TEAM_ID, user.uid, setPersonalKpis)
  }, [user.uid])

  // 정기 반복 task 자동 복제 — 이번 주차 진입 시 1회 실행
  useEffect(() => {
    if (!user?.uid || !weekKey) return
    const prevKeysByType = {
      weekly: getRecurrencePrevKey(weekKey, 'weekly'),
      monthly: getRecurrencePrevKey(weekKey, 'monthly'),
      quarterly: getRecurrencePrevKey(weekKey, 'quarterly'),
    }
    ensureRecurringTasksForWeek(DEFAULT_TEAM_ID, user.uid, weekKey, prevKeysByType)
      .then(result => {
        if (result?.copied > 0) {
          setMessage(`정기 반복 업무 ${result.copied}건이 자동으로 이번 주에 등록되었습니다: ${result.titles.join(', ')}`)
        }
      })
      .catch(err => {
        console.error('[정기반복] 자동 복제 실패:', err)
      })
  }, [user?.uid, weekKey])

  // 팀 KPI + 개인 KPI 통합 — 본인 부서 + 본인 개인 KPI만 (task form / 흐름도 모두 동일 필터)
  const allKpis = useMemo(() => {
    const mySub = memberProfile?.subteam || ''
    const myTeamKpis = kpis.filter(k => (k.subteam || '') === mySub && mySub)
    return [...myTeamKpis, ...personalKpis]
  }, [kpis, personalKpis, memberProfile?.subteam])

  async function refreshHistory() {
    const items = await getTaskHistory(DEFAULT_TEAM_ID, user.uid)
    setHistory(items)
  }

  // 히스토리(과거 주차) task의 단일 필드 업데이트 + 히스토리 리프레시
  async function updateHistoryTask(weekKey, taskId, patch) {
    if (!weekKey || !taskId) return
    if (weekKey === undefined) return
    try {
      await updateTaskInWeek(DEFAULT_TEAM_ID, user.uid, weekKey, taskId, patch)
      await refreshHistory()
    } catch (error) {
      setTaskError(`히스토리 업무 업데이트 실패: ${error.message || '알 수 없는 오류'}\n  네트워크와 권한을 확인하거나, 그 주차로 직접 가서 수정해보세요.`)
    }
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
    if (!permissions.canCreateTask) {
      setTaskError('관리자가 내 업무 작성 권한을 제한했습니다.')
      return
    }
    if (!draft.title.trim()) {
      setTaskError('업무명을 입력한 뒤 추가를 눌러주세요.')
      return
    }
    const now = new Date().toISOString()
    // coOwnerUids: 본인 제외 + 본인 자동 포함 (저장 시) — task에는 본인 포함 전체를 저장
    const draftCoOwners = (draft.coOwnerUids || []).filter(uid => uid && uid !== user.uid)
    const allOwnerUids = draftCoOwners.length > 0 ? [user.uid, ...draftCoOwners] : null

    const newTask = {
      id: generateId('task'),
      ...draft,
      title: draft.title.trim(),
      detail: draft.detail.trim(),
      impact: draft.impact.trim(),
      kpi: draft.impact.trim(), // kpi/impact 동기화
      parentIds: draft.parentIds || [],
      siblingIds: draft.siblingIds || [],
      recurrence: draft.recurrence ? { type: draft.recurrence } : null,
      ownerUid: user.uid,
      ownerName: getProfileName(user, memberProfile),
      createdAt: now,
      updatedAt: now,
      // 공유 동시관리: coOwnerUids에는 본인 포함 전체, originalOwnerUid는 만든 사람
      coOwnerUids: allOwnerUids,
      originalOwnerUid: allOwnerUids ? user.uid : null,
    }
    // 병행 업무 양방향 — newTask.siblingIds에 포함된 기존 task에도 newTask.id 추가
    const newSiblingIds = newTask.siblingIds || []
    const updatedTasks = tasks.map(t => {
      if (newSiblingIds.includes(t.id)) {
        const existing = t.siblingIds || []
        if (existing.includes(newTask.id)) return t
        return { ...t, siblingIds: [...existing, newTask.id], updatedAt: now }
      }
      return t
    })
    const nextTasks = [...updatedTasks, newTask]

    setTaskSaving(true)
    try {
      const nextTasksForSave = permissions.canShareTask
        ? nextTasks
        : nextTasks.map(task => task.id === newTask.id ? { ...task, visibility: 'private' } : task)
      const isTeamTask = draft.visibility !== 'private' && permissions.canShareTask
      await persist(nextTasksForSave)

      // 공유 task인 경우 — 다른 coOwner들의 weeks에도 동일 task 미러링
      if (allOwnerUids && allOwnerUids.length > 1) {
        try {
          await mirrorTaskToOwners(DEFAULT_TEAM_ID, draftCoOwners, weekKey, newTask)
        } catch (mirrorErr) {
          console.error('[공유task 미러링] 실패:', mirrorErr)
          setTaskError(`업무는 저장되었으나 일부 공동담당자에게 전달되지 못했습니다.\n  ${mirrorErr.message || '권한/네트워크 확인'}\n  업무 카드의 [공유 갱신]으로 재시도할 수 있습니다.`)
        }
      }

      setDraft({ title: '', detail: '', priority: 'normal', status: 'todo', dueDate: '', impact: '', visibility: 'team', isFocus: false, recurrence: '', parentIds: [], siblingIds: [], coOwnerUids: [], _shareOpen: false })
      setShowCandidates(false)
      const sharedSuffix = allOwnerUids && allOwnerUids.length > 1
        ? ` · 공동담당자 ${allOwnerUids.length - 1}명에게 동시 공유됨`
        : ''
      setMessage((isTeamTask ? '이번 주 업무에 추가되고 팀 보드에 공유되었습니다.' : '개인 보관 업무로 저장되었습니다.') + sharedSuffix)
      await refreshHistory()
    } catch (error) {
      setTaskError(error.message || '업무 저장에 실패했습니다.')
    } finally {
      setTaskSaving(false)
    }
  }

  async function updateTask(taskId, patch) {
    const now = new Date().toISOString()
    const targetTask = tasks.find(t => t.id === taskId)
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
      // 공유 task — 다른 coOwner의 weeks에도 patch 동기화
      const coOwners = (targetTask?.coOwnerUids || []).filter(u => u && u !== user.uid)
      if (coOwners.length > 0) {
        try {
          await syncTaskPatchAcrossOwners(DEFAULT_TEAM_ID, coOwners, weekKey, taskId, patch)
        } catch (syncErr) {
          console.error('[공유task 동기화] 실패:', syncErr)
          setTaskError(`본인 저장은 됐으나 공동담당자에게 동기화 실패: ${syncErr.message || '알 수 없는 오류'}\n  잠시 후 자동 재시도되거나, 다시 한 번 동일 변경을 적용해보세요.`)
        }
      }
    } catch (error) {
      setTaskError(error.message || '업무 상태 저장에 실패했습니다.')
    }
  }

  // 여러 task를 한 번에 update — 루프로 updateTask 호출 시 stale closure로 덮어쓰는 문제 방지
  async function updateTasksBatch(updates) {
    if (!Array.isArray(updates) || updates.length === 0) return
    const now = new Date().toISOString()
    const patchMap = new Map(updates.map(u => [u.taskId, u.patch || {}]))
    const next = tasks.map(task => {
      if (!patchMap.has(task.id)) return task
      const patch = patchMap.get(task.id)
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
      // 공유 task 각각에 대해 동기화
      for (const update of updates) {
        const t = tasks.find(x => x.id === update.taskId)
        const coOwners = (t?.coOwnerUids || []).filter(u => u && u !== user.uid)
        if (coOwners.length > 0) {
          try {
            await syncTaskPatchAcrossOwners(DEFAULT_TEAM_ID, coOwners, weekKey, update.taskId, update.patch || {})
          } catch (syncErr) {
            console.error('[공유task 일괄 동기화] 실패:', syncErr)
          }
        }
      }
    } catch (error) {
      setTaskError(`업무 일괄 저장 실패: ${error.message || '알 수 없는 오류'}\n  네트워크와 권한을 확인 후 다시 시도하세요.`)
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
    if (!permissions.canComment) {
      setTaskError('관리자가 코멘트 작성 권한을 제한했습니다.')
      return
    }
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
            authorName: getProfileName(user, memberProfile),
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

  async function addTaskCommentReply(taskId, commentId, text) {
    const trimmed = text.trim()
    if (!trimmed) return
    if (!permissions.canReply) {
      setTaskError('관리자가 답글 작성 권한을 제한했습니다.')
      return
    }
    const now = new Date().toISOString()
    const next = tasks.map(task => {
      if (task.id !== taskId) return task
      return {
        ...task,
        comments: (task.comments || []).map(comment => {
          if (comment.id !== commentId) return comment
          return {
            ...comment,
            replies: [
              ...(comment.replies || []),
              {
                id: generateId('reply'),
                text: trimmed,
                authorUid: user.uid,
                authorName: getProfileName(user, memberProfile),
                createdAt: now,
              },
            ],
          }
        }),
        updatedAt: now,
      }
    })

    try {
      await persist(next)
    } catch (error) {
      setTaskError(error.message || '답글 저장에 실패했습니다.')
    }
  }

  async function addTaskProgress(taskId, text, imageFiles = []) {
    const trimmed = text.trim()
    const files = Array.from(imageFiles || [])
    if (!permissions.canWriteProgress) {
      setTaskError('관리자가 오늘 진행내용 작성 권한을 제한했습니다.')
      return
    }
    if (files.length > 0 && !permissions.canUploadImage) {
      setTaskError('관리자가 이미지 첨부 권한을 제한했습니다.')
      return
    }
    if (!trimmed && files.length === 0) return
    if (files.length > MAX_PROGRESS_IMAGES) {
      setTaskError(`이미지는 한 번에 최대 ${MAX_PROGRESS_IMAGES}장까지 첨부할 수 있습니다.`)
      return
    }
    const now = new Date().toISOString()
    const progressId = generateId('progress')
    let images = []

    try {
      const compressedFiles = await withTimeout(
        Promise.all(files.map(compressProgressImage)),
        15000,
        '이미지 압축이 오래 걸리고 있습니다. 더 작은 이미지로 다시 시도해주세요.'
      )
      images = await withTimeout(
        uploadProgressImages(DEFAULT_TEAM_ID, user.uid, weekKey, taskId, progressId, compressedFiles),
        30000,
        '이미지 업로드가 30초 이상 지연되었습니다. Firebase Storage 프로젝트/규칙을 확인해주세요.'
      )
    } catch (error) {
      setTaskError(error.message || '이미지 업로드에 실패했습니다.')
      return
    }

    const next = tasks.map(task => {
      if (task.id !== taskId) return task
      return {
        ...task,
        progressLogs: [
          ...(task.progressLogs || []),
          {
            id: progressId,
            text: trimmed,
            images,
            dateKey: getTodayKey(),
            authorUid: user.uid,
            authorName: getProfileName(user, memberProfile),
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

  async function updateTaskProgress(taskId, progressId, patch) {
    const targetTask = tasks.find(task => task.id === taskId)
    if (!targetTask) {
      setTaskError(`업무(id=${taskId})를 찾을 수 없습니다. 새로고침 후 다시 시도하세요.`)
      return
    }
    const targetLog = (targetTask.progressLogs || []).find(log => log.id === progressId)
    if (!targetLog) {
      setTaskError('이미 삭제되었거나 동기화 전 항목입니다. 새로고침 후 다시 시도하세요.')
      return
    }
    const safePatch = { ...patch }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'text')) {
      safePatch.text = String(safePatch.text || '').trim()
    }
    const next = tasks.map(task => {
      if (task.id !== taskId) return task
      return {
        ...task,
        progressLogs: (task.progressLogs || []).map(log => {
          if (log.id !== progressId) return log
          return {
            ...log,
            ...safePatch,
            editedAt: new Date().toISOString(),
          }
        }),
        updatedAt: new Date().toISOString(),
      }
    })
    try {
      await persist(next)
    } catch (error) {
      setTaskError(`진행내용 수정 실패: ${error.message || '알 수 없는 오류'}\n  네트워크와 권한을 확인 후 다시 시도하세요.`)
    }
  }

  async function deleteTaskProgress(taskId, progressId) {
    const targetTask = tasks.find(task => task.id === taskId)
    if (!targetTask) {
      setTaskError(`업무(id=${taskId})를 찾을 수 없습니다. 새로고침 후 다시 시도하세요.`)
      return
    }
    const targetLog = (targetTask.progressLogs || []).find(log => log.id === progressId)
    if (!targetLog) {
      setTaskError('이미 삭제되었거나 동기화 전 항목입니다. 새로고침 후 다시 시도하세요.')
      return
    }
    const ok = window.confirm('이 진행내용을 삭제할까요? 첨부된 이미지도 같이 삭제됩니다.')
    if (!ok) return

    const imagePaths = (targetLog.images || []).map(img => img.path).filter(Boolean)

    const next = tasks.map(task => {
      if (task.id !== taskId) return task
      return {
        ...task,
        progressLogs: (task.progressLogs || []).filter(log => log.id !== progressId),
        updatedAt: new Date().toISOString(),
      }
    })

    try {
      await persist(next)
      if (imagePaths.length > 0) {
        try {
          await deleteStorageFiles(imagePaths)
        } catch (storageErr) {
          // 메타데이터는 이미 삭제됐으므로 사용자에게는 경고만, 진행은 계속
          setMessage(`진행내용은 삭제됐지만 이미지 파일 정리에 실패했습니다: ${storageErr.message}\n  Storage 콘솔에서 직접 정리하세요.`)
        }
      }
    } catch (error) {
      setTaskError(`진행내용 삭제 실패: ${error.message || '알 수 없는 오류'}\n  네트워크와 권한을 확인 후 다시 시도하세요.`)
    }
  }

  async function removeTask(taskId) {
    try {
      const targetTask = tasks.find(task => task.id === taskId)
      const imagePaths = (targetTask?.progressLogs || [])
        .flatMap(log => (log.images || []).map(image => image.path))
      if (imagePaths.length > 0) {
        await deleteStorageFiles(imagePaths)
      }
      await persist(tasks.filter(task => task.id !== taskId))
      // 공유 task — 다른 coOwner의 weeks에서도 함께 삭제
      const coOwners = (targetTask?.coOwnerUids || []).filter(u => u && u !== user.uid)
      if (coOwners.length > 0) {
        try {
          await deleteTaskAcrossOwners(DEFAULT_TEAM_ID, coOwners, weekKey, taskId)
        } catch (delErr) {
          console.error('[공유task 일괄 삭제] 실패:', delErr)
          setTaskError(`본인 삭제는 됐으나 공동담당자 측 삭제 실패: ${delErr.message || '알 수 없는 오류'}\n  공동담당자에게 직접 삭제 요청 필요`)
        }
      }
    } catch (error) {
      setTaskError(error.message || '업무 삭제에 실패했습니다.')
    }
  }

  // 공유 task에서 본인만 빠지기 (전체 삭제 아님)
  async function leaveSharedTask(taskId) {
    const targetTask = tasks.find(task => task.id === taskId)
    if (!targetTask) return
    const allOwners = targetTask.coOwnerUids || []
    if (allOwners.length <= 1) {
      setTaskError('공유되지 않은 task입니다. 일반 삭제를 사용하세요.')
      return
    }
    const ok = window.confirm(`"${targetTask.title}" 공동관리에서 빠질까요?\n  이 task는 본인의 목록에서 사라지지만 다른 공동담당자에게는 유지됩니다.`)
    if (!ok) return
    try {
      await unshareTaskFromOwner(DEFAULT_TEAM_ID, allOwners, weekKey, taskId, user.uid)
      // 본인 weeks에서는 unshareTaskFromOwner가 이미 task 삭제. 로컬 state도 갱신
      setTasks(prev => prev.filter(t => t.id !== taskId))
      setMessage('공동관리에서 빠졌습니다. 다른 공동담당자는 계속 유지됩니다.')
    } catch (error) {
      setTaskError(`공동관리 해제 실패: ${error.message || '알 수 없는 오류'}\n  네트워크와 권한을 확인하세요.`)
    }
  }

  async function handleShare() {
    setSaving(true)
    setMessage('')
    try {
      if (!permissions.canShareTask) {
        setMessage('관리자가 팀 공유 권한을 제한했습니다.')
        return
      }
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

  // 작성 중인 업무를 흐름도에 미리보기로 표시 — parent/sibling 선택했을 때만 노출
  const previewTask = useMemo(() => {
    const parentIds = draft.parentIds || []
    const siblingIds = draft.siblingIds || []
    if (parentIds.length === 0 && siblingIds.length === 0) return null
    const title = (draft.title || '').trim() || '신규 업무'
    return {
      id: '__preview_new_task__',
      title: `(작성 중) ${title}`,
      status: 'preview',
      kpi: (draft.impact || '').trim(),
      impact: (draft.impact || '').trim(),
      parentIds: [...parentIds],
      siblingIds: [...siblingIds],
    }
  }, [draft.parentIds, draft.siblingIds, draft.title, draft.impact])

  async function handlePersonalDailyReport() {
    setDailyReportSaving(true)
    setTaskError('')
    setMessage('')
    try {
      const result = await requestGemini('dailyReport', {
        dateKey: getTodayKey(),
        dateLabel: formatKoreanDate(getTodayKey()),
        weekLabel,
        progressLogs: todayHighlights.map(log => ({
          ...log,
          memberName: getProfileName(user, memberProfile),
          subteam: memberProfile?.subteam,
          subteamLabel: memberProfile?.subteamLabel || getSubteamLabel(memberProfile?.subteam),
        })),
        actionItems: [],
        kpis: [],
      })
      await saveDailyReport(DEFAULT_TEAM_ID, getTodayKey(), {
        ...result,
        weekLabel,
        dateLabel: formatKoreanDate(getTodayKey()),
        progressCount: todayHighlights.length,
        source: 'manual-personal',
        generatedAt: new Date().toISOString(),
      })
      setMessage('오늘의 주요업무 기반 보고서가 생성되었습니다. 보고 초안 메뉴에서 확인할 수 있습니다.')
    } catch (error) {
      setTaskError(error.message || '오늘 보고서 생성에 실패했습니다.')
    } finally {
      setDailyReportSaving(false)
    }
  }

  return (
    <main className="content-grid personal-layout">
      <section className="view-stack">
        <section className="metric-grid compact">
          <MetricCard icon={ListChecks} label="이번 주 업무" value={`${tasks.length}건`} helper={`완료율 ${currentRate}%`} tone="blue" />
          <MetricCard icon={CheckCircle2} label="완료" value={`${completedTasks.length}건`} helper="AI 분석 기준" tone="green" />
          <MetricCard icon={AlertTriangle} label="막힘" value={`${tasks.filter(task => task.status === 'blocked').length}건`} helper="팀장 공유 필요" tone="red" />
        </section>

        <PersonalKpiPanel user={user} kpis={personalKpis} tasks={tasks} history={history} />

        <Panel title="이번 주 업무 추가" icon={Plus}>
          {permissions.canCreateTask ? (
            <form className="task-form" onSubmit={handleAddTask}>
              <input
                value={draft.title}
                onChange={event => setDraft({ ...draft, title: event.target.value })}
                placeholder="업무명"
              />
              <select
                value={draft.impact}
                onChange={event => {
                  const newKpi = event.target.value
                  setDraft({ ...draft, impact: newKpi })
                  // 같은 KPI 가진 진행 중 task가 있으면 추천 박스 표시
                  setShowCandidates(!!newKpi && tasks.some(t => t.status !== 'done' && (t.kpi || t.impact) === newKpi))
                }}
                className="task-form-kpi-select"
              >
                <option value="">KPI 선택 (내 팀 KPI + 내 개인 KPI만 표시)</option>
                {(() => {
                  // 내 부서 KPI + 내 개인 KPI만 노출 (전사/다른 부서 제외)
                  const mySub = memberProfile?.subteam || ''
                  const myTeamKpis = kpis.filter(kpi => (kpi.subteam || '') === mySub && mySub)
                  const blocks = []
                  if (personalKpis.length > 0) {
                    blocks.push(
                      <optgroup key="personal" label="내 개인 KPI">
                        {personalKpis.map(kpi => (
                          <option key={kpi.id} value={kpi.label}>{kpi.label}</option>
                        ))}
                      </optgroup>,
                    )
                  }
                  if (myTeamKpis.length > 0) {
                    blocks.push(
                      <optgroup key="mine" label={`내 팀 KPI (${getSubteamLabel(mySub)})`}>
                        {myTeamKpis.map(kpi => (
                          <option key={kpi.id} value={kpi.label}>{kpi.label}</option>
                        ))}
                      </optgroup>,
                    )
                  }
                  return blocks
                })()}
                {(() => {
                  const mySub = memberProfile?.subteam || ''
                  const myTeamKpiCount = kpis.filter(kpi => (kpi.subteam || '') === mySub && mySub).length
                  if (myTeamKpiCount === 0 && personalKpis.length === 0) {
                    return (
                      <option value="" disabled>
                        {mySub
                          ? '내 팀 KPI도, 내 개인 KPI도 없습니다 — 관리자(팀)/본인(개인)이 등록해야 합니다'
                          : '소속 부서가 지정되지 않아 팀 KPI를 표시할 수 없습니다 — 본인 프로필에서 부서를 설정하세요'}
                      </option>
                    )
                  }
                  return null
                })()}
              </select>

              {/* KPI 선택 시 같은 KPI 진행 중 task 자동 추천 — 단일 선택 강제 */}
              {showCandidates && (() => {
                const candidates = tasks.filter(t =>
                  t.status !== 'done' &&
                  (t.kpi || t.impact) === draft.impact,
                )
                if (candidates.length === 0) return null
                const selectedParent = draft.parentIds[0] || null
                const selectedSibling = draft.siblingIds[0] || null
                const hasAnySelection = !!(selectedParent || selectedSibling)
                return (
                  <div className="task-form-recommend">
                    <strong>
                      {hasAnySelection
                        ? '✓ 아래 선택을 유지한 채 [+ 추가] 누르면 등록됩니다 (다시 클릭 = 변경)'
                        : '💡 이 KPI에 진행 중 업무가 있어요. 새 업무를 어떻게 등록할까요? (한 업무만 골라주세요)'}
                    </strong>
                    <div className="task-form-candidate-list">
                      {candidates.slice(0, 5).map(c => {
                        const days = daysUntil(c.createdAt) ?? 0
                        const dayLabel = days === 0 ? '오늘' : `${Math.abs(days)}일 전`
                        const isParent = selectedParent === c.id
                        const isSibling = selectedSibling === c.id
                        return (
                          <div
                            key={c.id}
                            className={`task-form-candidate-row ${isParent ? 'is-parent' : ''} ${isSibling ? 'is-sibling' : ''}`}
                          >
                            <div className="task-form-candidate-main">
                              <span className="task-form-candidate-title">
                                {(isParent || isSibling) && <span className="task-form-pick-mark">✓</span>}
                                {c.title}
                              </span>
                              <span className="task-form-candidate-meta">
                                {dayLabel} · 진행 중 · 같은 KPI
                                {isParent && <em className="picked-tag parent"> · 이전 업무로 선택됨</em>}
                                {isSibling && <em className="picked-tag sibling"> · 병행 업무로 선택됨</em>}
                              </span>
                            </div>
                            <div className="task-form-candidate-actions">
                              <button
                                type="button"
                                className={`primary-action mini ${isParent ? 'active' : ''}`}
                                onClick={() => {
                                  // 단일 선택 — parent 1개로 교체, sibling은 비움
                                  setDraft(d => ({ ...d, parentIds: [c.id], siblingIds: [] }))
                                }}
                              >
                                이전 업무로
                              </button>
                              <button
                                type="button"
                                className={`secondary-action mini ${isSibling ? 'active' : ''}`}
                                onClick={() => {
                                  // 단일 선택 — sibling 1개로 교체
                                  // 같은 layer 표시를 위해 sibling의 이전 업무를 함께 상속
                                  const inheritedParents = (c.parentIds || []).filter(Boolean)
                                  setDraft(d => ({ ...d, siblingIds: [c.id], parentIds: inheritedParents }))
                                }}
                              >
                                병행 업무로
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="task-form-recommend-actions">
                      <button
                        type="button"
                        className="ghost-action task-form-fresh-start"
                        onClick={() => {
                          setDraft(d => ({ ...d, parentIds: [], siblingIds: [] }))
                          setShowCandidates(false)
                        }}
                      >
                        새로운 업무로 시작하기
                      </button>
                    </div>
                  </div>
                )
              })()}

              <textarea
                value={draft.detail}
                onChange={event => setDraft({ ...draft, detail: event.target.value })}
                placeholder="진행 내용, 산출물, 막힌 지점"
              />

              {/* 정기 반복 + 공유 동시관리 — 한 줄에 같은 포맷으로 */}
              <div className="task-form-toggle-row">
                <label className="check-toggle compact">
                  <input
                    type="checkbox"
                    checked={!!draft.recurrence}
                    onChange={event => setDraft({ ...draft, recurrence: event.target.checked ? 'weekly' : '' })}
                  />
                  🔁 정기 반복
                </label>
                {draft.recurrence && (
                  <select
                    className="task-form-toggle-select"
                    value={draft.recurrence}
                    onChange={event => setDraft({ ...draft, recurrence: event.target.value })}
                  >
                    <option value="weekly">매주</option>
                    <option value="monthly">매월 (4주마다)</option>
                    <option value="quarterly">분기 (13주마다)</option>
                  </select>
                )}

                <label className="check-toggle compact">
                  <input
                    type="checkbox"
                    checked={(draft.coOwnerUids || []).length > 0 || draft._shareOpen}
                    onChange={event => {
                      if (event.target.checked) {
                        setDraft(d => ({ ...d, _shareOpen: true }))
                      } else {
                        // off: 선택된 공동담당자 모두 해제 + 영역 닫기
                        setDraft(d => ({ ...d, coOwnerUids: [], _shareOpen: false }))
                      }
                    }}
                  />
                  👥 공유 동시관리
                  {(draft.coOwnerUids || []).length > 0 && (
                    <em className="toggle-count"> ({(draft.coOwnerUids || []).length}명)</em>
                  )}
                </label>
              </div>

              {draft.recurrence && (
                <small className="task-form-recurrence-hint">
                  다음 주차 진입 시 자동으로 같은 업무가 등록되며, 직전 주차 업무를 이전 업무로 연결합니다.
                </small>
              )}

              {/* 공유 동시관리 토글이 켜졌을 때만 멤버 선택 UI 표시 */}
              {((draft.coOwnerUids || []).length > 0 || draft._shareOpen) && (
                <CoOwnerPicker
                  allMembers={allMembers}
                  currentUid={user.uid}
                  selectedUids={draft.coOwnerUids || []}
                  onChange={uids => setDraft(d => ({ ...d, coOwnerUids: uids }))}
                />
              )}
              <div className="form-row">
                <select value={draft.priority} onChange={event => setDraft({ ...draft, priority: event.target.value })}>
                  {Object.entries(PRIORITY_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
                </select>
                <select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value })}>
                  {Object.entries(STATUS_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
                </select>
                <input type="date" value={draft.dueDate} onChange={event => setDraft({ ...draft, dueDate: event.target.value })} />
                <select value={draft.visibility} onChange={event => setDraft({ ...draft, visibility: event.target.value })} disabled={!permissions.canShareTask}>
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
          ) : (
            <EmptyText text="관리자가 내 업무 작성 권한을 제한했습니다." />
          )}

          {taskError && <div className="alert error slim">{taskError}</div>}
          {message && <div className="alert slim">{message}</div>}
        </Panel>

        <Panel title={`이번 주 업무 목록 (${activeTasks.length}건)`} icon={ListChecks}>
          {(() => {
            const allTasksPool = (() => {
              const seen = new Set()
              return [...tasks, ...history.flatMap(w => w.items || [])].filter(t => {
                if (!t || seen.has(t.id)) return false
                seen.add(t.id)
                return true
              })
            })()

            // 3 컬럼 분류: ★ 우선순위 / 일반 진행 / 대기·검토
            const isFocusTask = t => t.isFocus || t.priority === 'high'
            const sortByRisk = (a, b) => taskRiskRank(a) - taskRiskRank(b)

            const focusList = activeTasks.filter(isFocusTask).sort(sortByRisk)
            const doingList = activeTasks
              .filter(t => !isFocusTask(t) && (t.status === 'doing' || t.status === 'review'))
              .sort(sortByRisk)
            const standbyList = activeTasks
              .filter(t => !isFocusTask(t) && (t.status === 'todo' || t.status === 'blocked'))
              .sort(sortByRisk)

            const renderTaskEditor = task => (
              <TaskEditor
                key={task.id}
                task={task}
                onChange={patch => updateTask(task.id, patch)}
                onComplete={() => completeTask(task.id)}
                onDelete={() => removeTask(task.id)}
                onLeaveShared={() => leaveSharedTask(task.id)}
                expanded={openTaskId === task.id}
                onToggleExpand={() => setOpenTaskId(openTaskId === task.id ? null : task.id)}
                onAddComment={text => addTaskComment(task.id, text)}
                onAddProgress={(text, files) => addTaskProgress(task.id, text, files)}
                onUpdateProgress={(taskId, progressId, patch) => updateTaskProgress(taskId, progressId, patch)}
                onDeleteProgress={(taskId, progressId) => deleteTaskProgress(taskId, progressId)}
                onReplyComment={(commentId, text) => addTaskCommentReply(task.id, commentId, text)}
                onDeleteComment={commentId => deleteTaskComment(task.id, commentId)}
                user={user}
                permissions={permissions}
                allTasks={allTasksPool}
              />
            )

            if (activeTasks.length === 0) {
              return <EmptyText text="진행 중인 이번 주 업무가 없습니다." />
            }

            return (
              <div className="task-kanban-wrap">
              <div className="task-kanban">
                <div className={`task-kanban-col focus ${focusList.length === 0 ? 'is-empty' : ''}`}>
                  <div className="task-kanban-head">
                    <strong><Star size={13} fill="currentColor" /> 우선순위 업무</strong>
                    <span className="cnt">{focusList.length}건</span>
                  </div>
                  <div className="task-kanban-body">
                    {focusList.length === 0
                      ? <p className="task-kanban-empty">우선순위 지정된 업무 없음</p>
                      : focusList.map(renderTaskEditor)}
                  </div>
                </div>
                <div className="task-kanban-col doing">
                  <div className="task-kanban-head">
                    <strong>진행 중</strong>
                    <span className="cnt">{doingList.length}건</span>
                  </div>
                  <div className="task-kanban-body">
                    {doingList.length === 0
                      ? <p className="task-kanban-empty">진행 중인 일반 업무 없음</p>
                      : doingList.map(renderTaskEditor)}
                  </div>
                </div>
                <div className="task-kanban-col standby">
                  <div className="task-kanban-head">
                    <strong>대기 · 막힘</strong>
                    <span className="cnt">{standbyList.length}건</span>
                  </div>
                  <div className="task-kanban-body">
                    {standbyList.length === 0
                      ? <p className="task-kanban-empty">대기 또는 막힌 업무 없음</p>
                      : standbyList.map(renderTaskEditor)}
                  </div>
                </div>
              </div>
              </div>
            )
          })()}
        </Panel>

        <Panel title="오늘의 주요업무" icon={Clock} action={
          <button className="secondary-action" onClick={handlePersonalDailyReport} disabled={dailyReportSaving || todayHighlights.length === 0}>
            <Bot size={15} />
            {dailyReportSaving ? '생성 중' : '보고서 생성'}
          </button>
        }>
          <TodayHighlights logs={todayHighlights} onDelete={deleteTaskProgress} onUpdate={updateTaskProgress} />
        </Panel>

        <Panel title="완료 업무 히스토리" icon={RefreshCcw}>
          <HistoryList history={history} currentWeekKey={weekKey} currentCompletedTasks={completedTasks} user={user} />
        </Panel>
      </section>

      <div className="view-stack right-column-sticky">
        <TaskFlowPanel user={user} memberProfile={memberProfile} tasks={tasks} history={history} kpis={allKpis} previewTask={previewTask} onUpdateTask={updateTask} onUpdateTasksBatch={updateTasksBatch} onUpdateHistoryTask={updateHistoryTask} onDeleteTask={removeTask} />
      </div>
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
          <span>Gemini 2.5 Flash</span>
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

function TodayHighlights({ logs, onDelete, onUpdate }) {
  if (logs.length === 0) {
    return <EmptyText text="오늘 입력된 주요업무가 없습니다. 각 업무를 눌러 오늘 진행내용을 입력해보세요." />
  }

  return (
    <div className="today-highlight-list">
      {logs.map(log => (
        <TodayHighlightItem
          key={`${log.taskId}-${log.id}`}
          log={log}
          onDelete={onDelete}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  )
}

function TodayHighlightItem({ log, onDelete, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(log.text || '')

  function startEdit() {
    setDraft(log.text || '')
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setDraft(log.text || '')
  }

  async function saveEdit() {
    const next = draft.trim()
    if (next === (log.text || '').trim()) {
      setEditing(false)
      return
    }
    if (onUpdate) {
      await onUpdate(log.taskId, log.id, { text: next })
    }
    setEditing(false)
  }

  return (
    <article className="today-highlight-item">
      <div className="today-highlight-head">
        <div className="today-highlight-meta">
          <Badge tone="teal">{log.taskTitle}</Badge>
          {log.impact && <Badge tone="green">{log.impact}</Badge>}
          <span>{formatCommentTime(log.createdAt)}</span>
          {log.editedAt && <span className="today-highlight-edited">(수정됨)</span>}
        </div>
        {(onUpdate || onDelete) && !editing && (
          <div className="today-highlight-actions">
            {onUpdate && (
              <button type="button" className="icon-button subtle" onClick={startEdit} title="편집">
                <Pencil size={13} />
              </button>
            )}
            {onDelete && (
              <button type="button" className="icon-button subtle" onClick={() => onDelete(log.taskId, log.id)} title="삭제">
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )}
      </div>
      {editing ? (
        <div className="today-highlight-edit">
          <textarea
            value={draft}
            onChange={event => setDraft(event.target.value)}
            placeholder="진행내용을 수정하세요"
            rows={3}
            autoFocus
          />
          <div className="today-highlight-edit-actions">
            <button type="button" className="ghost-action" onClick={cancelEdit}>취소</button>
            <button type="button" className="secondary-action" onClick={saveEdit}>
              <Check size={14} /> 저장
            </button>
          </div>
        </div>
      ) : (
        <>
          {log.text && <p className="progress-log-text">{log.text}</p>}
          {log.images?.length > 0 && <ImageStrip images={log.images} />}
        </>
      )}
    </article>
  )
}

function ProgressLogItem({ log, canEdit, canDelete, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(log.text || '')

  function startEdit() {
    setDraft(log.text || '')
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setDraft(log.text || '')
  }

  async function saveEdit() {
    const next = draft.trim()
    if (next === (log.text || '').trim()) {
      setEditing(false)
      return
    }
    if (onUpdate) {
      await onUpdate(next)
    }
    setEditing(false)
  }

  return (
    <article className="comment-item progress-item">
      <div className="progress-item-head">
        <div className="progress-item-meta">
          <strong>{log.authorName || '작성자'}</strong>
          <span>{formatCommentTime(log.createdAt)}</span>
          {log.editedAt && <span className="today-highlight-edited">(수정됨)</span>}
        </div>
        {(canEdit || canDelete) && !editing && (
          <div className="progress-item-actions">
            {canEdit && (
              <button type="button" className="icon-button subtle" onClick={startEdit} title="편집">
                <Pencil size={13} />
              </button>
            )}
            {canDelete && (
              <button type="button" className="icon-button subtle" onClick={onDelete} title="삭제">
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )}
      </div>
      {editing ? (
        <div className="today-highlight-edit">
          <textarea
            value={draft}
            onChange={event => setDraft(event.target.value)}
            placeholder="진행내용을 수정하세요"
            rows={3}
            autoFocus
          />
          <div className="today-highlight-edit-actions">
            <button type="button" className="ghost-action" onClick={cancelEdit}>취소</button>
            <button type="button" className="secondary-action" onClick={saveEdit}>
              <Check size={14} /> 저장
            </button>
          </div>
        </div>
      ) : (
        <>
          {log.text && <p className="progress-log-text">{log.text}</p>}
          {log.images?.length > 0 && <ImageStrip images={log.images} />}
        </>
      )}
    </article>
  )
}

function ImageStrip({ images }) {
  return (
    <div className="image-strip">
      {images.map(image => (
        <a href={image.url} target="_blank" rel="noreferrer" key={image.path || image.url}>
          <img src={image.url} alt={image.name || '첨부 이미지'} loading="lazy" />
        </a>
      ))}
    </div>
  )
}

// 진행 프로젝트 휴지통 — 30일 보관, 본인 항목 또는 팀장만 복원/영구삭제 가능
function TrashPanel({ items = [], canManage = false, currentUid, onRestore, onPurge }) {
  const [open, setOpen] = useState(false)
  const sorted = [...items].sort((a, b) =>
    (b.deletedAt || '').localeCompare(a.deletedAt || ''),
  )

  function canRestoreItem(item) {
    if (canManage) return true
    return item.deletedBy === currentUid || item.ownerUid === currentUid
  }

  return (
    <Panel
      title={`🗑 휴지통 (${items.length}건 · 30일 후 자동 영구 삭제)`}
      icon={Trash2}
      action={
        <button
          type="button"
          className="ghost-action mini"
          onClick={() => setOpen(!open)}
        >
          {open ? '접기' : '펼치기'}
        </button>
      }
    >
      {open && (
        <div className="trash-list">
          {sorted.map(item => {
            const deletedMs = item.deletedAt ? new Date(item.deletedAt).getTime() : 0
            const remainDays = Math.max(0, Math.ceil((deletedMs + 30 * 86400000 - Date.now()) / 86400000))
            const allowRestore = canRestoreItem(item)
            return (
              <article key={item.id} className="trash-item">
                <div className="trash-main">
                  <strong>{item.title || '(제목 없음)'}</strong>
                  <div className="trash-meta">
                    {item.deletedByName ? `🗑 ${item.deletedByName}` : '🗑 알 수 없음'}
                    {' · '}
                    {item.deletedAt ? formatDate(item.deletedAt) : ''}
                    {' · '}
                    <span className={remainDays <= 3 ? 'remain-warn' : 'remain'}>
                      {remainDays === 0 ? '오늘 영구 삭제 예정' : `D-${remainDays} 후 자동 영구 삭제`}
                    </span>
                  </div>
                  {item.detail && <p className="trash-detail">{item.detail}</p>}
                </div>
                <div className="trash-actions">
                  {allowRestore ? (
                    <button
                      type="button"
                      className="secondary-action mini"
                      onClick={() => onRestore && onRestore(item)}
                      title="복원"
                    >
                      <RefreshCcw size={13} /> 복원
                    </button>
                  ) : (
                    <span className="trash-locked">팀장만 복원 가능</span>
                  )}
                  {(canManage || item.deletedBy === currentUid) && (
                    <button
                      type="button"
                      className="ghost-action mini danger"
                      onClick={() => onPurge && onPurge(item)}
                      title="영구 삭제 (복원 불가)"
                    >
                      <Trash2 size={13} /> 영구 삭제
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </Panel>
  )
}

function ProjectForm({ kpis, onCreate }) {
  const [draft, setDraft] = useState({
    title: '',
    detail: '',
    category: 'week',
    status: 'todo',
    priority: 'normal',
    subteam: 'commerce',
    dueDate: '',
    kpi: kpis[0]?.label || '',
    kpiLinks: [],
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function setKpiLink(kpiId, weightStr) {
    setDraft(prev => {
      const others = (prev.kpiLinks || []).filter(l => l.kpiId !== kpiId)
      const w = Number(weightStr)
      if (!weightStr || !Number.isFinite(w) || w <= 0) {
        return { ...prev, kpiLinks: others }
      }
      return { ...prev, kpiLinks: [...others, { kpiId, weight: Math.min(100, w) }] }
    })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!draft.title.trim()) {
      setError('프로젝트명을 입력해주세요.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onCreate({
        id: generateId('action'),
        sortOrder: Date.now(),
        ...draft,
        title: draft.title.trim(),
        detail: draft.detail.trim(),
        assignee: getSubteamLabel(draft.subteam),
      })
    } catch (err) {
      setError(err.message || '프로젝트 추가에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="project-form" onSubmit={handleSubmit}>
      <input value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="진행 프로젝트명" />
      <input value={draft.detail} onChange={event => setDraft({ ...draft, detail: event.target.value })} placeholder="프로젝트 설명 / 산출물" />
      <div className="form-row project-form-row">
        <select value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value })}>
          {Object.entries(CATEGORY_META).filter(([key]) => key !== 'team').map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
        </select>
        <select value={draft.subteam} onChange={event => setDraft({ ...draft, subteam: event.target.value })}>
          {SUBTEAMS.map(team => <option key={team.id} value={team.id}>{team.label}</option>)}
        </select>
        <select value={draft.priority} onChange={event => setDraft({ ...draft, priority: event.target.value })}>
          {Object.entries(PRIORITY_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
        </select>
        <input type="date" value={draft.dueDate} onChange={event => setDraft({ ...draft, dueDate: event.target.value })} />
        <select value={draft.kpi} onChange={event => setDraft({ ...draft, kpi: event.target.value })}>
          <option value="">KPI 미연결</option>
          {(() => {
            // 내 업무 폼과 동일한 그룹 분리 — 부서별 optgroup
            const groups = { all: [], bySubteam: {} }
            kpis.forEach(kpi => {
              const sub = kpi.subteam || 'all'
              if (sub === 'all') groups.all.push(kpi)
              else {
                if (!groups.bySubteam[sub]) groups.bySubteam[sub] = []
                groups.bySubteam[sub].push(kpi)
              }
            })
            const blocks = []
            Object.entries(groups.bySubteam).forEach(([sub, items]) => {
              blocks.push(
                <optgroup key={`sub-${sub}`} label={getSubteamLabel(sub)}>
                  {items.map(kpi => <option key={kpi.id} value={kpi.label}>{kpi.label}</option>)}
                </optgroup>,
              )
            })
            if (groups.all.length > 0) {
              blocks.push(
                <optgroup key="all" label="전사 공통">
                  {groups.all.map(kpi => <option key={kpi.id} value={kpi.label}>{kpi.label}</option>)}
                </optgroup>,
              )
            }
            return blocks
          })()}
        </select>
        <button className="primary-action" type="submit" disabled={saving}>
          <Plus size={15} />
          {saving ? '저장 중' : '추가'}
        </button>
      </div>

      <div className="kpi-link-row">
        <span className="kpi-link-label">KPI 가중치(%)</span>
        {kpis.map(kpi => {
          const link = (draft.kpiLinks || []).find(l => l.kpiId === kpi.id)
          const value = link?.weight ?? ''
          return (
            <label key={kpi.id} className="kpi-link-cell">
              <span>{kpi.label}</span>
              <input
                type="number"
                min="0"
                max="100"
                placeholder="0"
                value={value}
                onChange={event => setKpiLink(kpi.id, event.target.value)}
              />
            </label>
          )
        })}
      </div>

      {error && <div className="alert error slim">{error}</div>}
    </form>
  )
}

function TeamBoard({ user, weekKey, teamFeed, actionItems, kpis, canManage, memberProfile }) {
  const [selectedCategories, setSelectedCategories] = useState(new Set())
  const [status, setStatus] = useState('all')
  const [subteamFilter, setSubteamFilter] = useState('all')
  const [inboxMode, setInboxMode] = useState('comments')
  const [selectedActionId, setSelectedActionId] = useState(null)
  const [showProjectForm, setShowProjectForm] = useState(false)
  const permissions = getMemberPermissions(memberProfile)

  function toggleCategory(key) {
    setSelectedCategories(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // 삭제됨(휴지통) 항목은 일반 리스트에서 자동 제외
  const liveActionItems = actionItems.filter(item => !item.deletedAt)
  const trashedItems = actionItems.filter(item => !!item.deletedAt)

  const filteredActionItems = liveActionItems.filter(item => {
    const categoryMatch = selectedCategories.size === 0 || selectedCategories.has(item.category)
    const statusMatch = status === 'all' || (item.status || (item.done ? 'done' : 'todo')) === status
    const itemSubteam = item.subteam || assigneeToSubteam(item.assignee)
    const subteamMatch = subteamFilter === 'all' || itemSubteam === subteamFilter
    return categoryMatch && statusMatch && subteamMatch
  }).map(item => ({ ...item, sourceType: 'action', actionKey: `action-${item.id}` }))
  const filteredTeamFeed = subteamFilter === 'all'
    ? teamFeed
    : teamFeed.filter(member => member.subteam === subteamFilter)
  const sharedTasks = filteredTeamFeed.flatMap(member => (member.items || []).map(task => {
    const isMine = member.uid === user.uid
    const fallbackName = user?.displayName || user?.email || '이름 없음'
    return {
      ...task,
      memberUid: member.uid,
      memberName: member.displayName || (isMine ? fallbackName : '이름 없음'),
      memberPhotoURL: member.photoURL || (isMine ? (user.photoURL || '') : ''),
      subteam: member.subteam,
      subteamLabel: member.subteamLabel || getSubteamLabel(member.subteam),
    }
  }))
  const filteredSharedActionItems = sharedTasks
    .filter(task => {
      const categoryMatch = selectedCategories.size === 0 || selectedCategories.has('team')
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
  const kpiOrderMap = new Map(kpis.map((k, i) => [k.label, k.sortOrder ?? (i + 1) * 10]))
  const actionPlanItems = [...filteredActionItems, ...filteredSharedActionItems]
    .sort((a, b) => {
      const kpiA = a.kpi || a.impact || ''
      const kpiB = b.kpi || b.impact || ''
      const orderA = kpiA ? (kpiOrderMap.get(kpiA) ?? 9999) : 99999
      const orderB = kpiB ? (kpiOrderMap.get(kpiB) ?? 9999) : 99999
      if (orderA !== orderB) return orderA - orderB
      return (a.sortOrder || 0) - (b.sortOrder || 0)
    })
  const activeSharedTasks = sharedTasks
    .filter(task => task.status !== 'done')
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || dueSortValue(a.dueDate) - dueSortValue(b.dueDate))
  const priorityTasks = actionPlanItems
    .filter(task => task.status !== 'done' && (task.isFocus || task.status === 'blocked' || isDueSoon(task) || task.priority === 'high'))
    .sort((a, b) => projectPriorityRank(a) - projectPriorityRank(b))
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
    if (!permissions.canComment && !canManage) return
    const now = new Date().toISOString()
    await addSharedTaskComment(DEFAULT_TEAM_ID, weekKey, task.memberUid, task.id, {
      id: generateId('comment'),
      text: text.trim(),
      authorUid: user.uid,
      authorName: getProfileName(user, memberProfile),
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
      authorName: getProfileName(user, memberProfile),
      createdAt: now,
    })
  }

  async function handleReplyActionComment(item, commentId, text) {
    if (!permissions.canReply && !canManage) return
    const reply = {
      id: generateId('reply'),
      text: text.trim(),
      authorUid: user.uid,
      authorName: getProfileName(user, memberProfile),
      createdAt: new Date().toISOString(),
    }

    if (item.sourceType === 'shared') {
      await addSharedTaskCommentReply(DEFAULT_TEAM_ID, weekKey, item.memberUid, item.id, commentId, reply)
      return
    }

    await addActionItemCommentReply(DEFAULT_TEAM_ID, item.id, commentId, reply)
  }

  async function handleDeleteActionComment(item, commentId) {
    if (item.sourceType === 'shared') {
      await deleteSharedTaskComment(DEFAULT_TEAM_ID, weekKey, item.memberUid, item.id, commentId)
      return
    }
    await deleteActionItemComment(DEFAULT_TEAM_ID, item.id, commentId)
  }

  async function handleActionStatusChange(item, nextStatus) {
    if (item.sourceType === 'shared') {
      await updateSharedTaskFields(DEFAULT_TEAM_ID, weekKey, item.memberUid, item.id, { status: nextStatus })
      return
    }
    await updateActionItemStatus(DEFAULT_TEAM_ID, item.id, nextStatus)
  }

  async function handleActionKpiChange(item, kpi) {
    if (item.sourceType === 'shared') {
      await updateSharedTaskFields(DEFAULT_TEAM_ID, weekKey, item.memberUid, item.id, { impact: kpi })
      return
    }
    await updateActionItemFields(DEFAULT_TEAM_ID, item.id, { kpi })
  }

  // === Soft delete (휴지통) — 진행 프로젝트 ===
  // 권한: 본인이 만든 것(ownerUid === user.uid) 또는 팀장(canManage)만 삭제 가능
  function canDeleteAction(item) {
    if (!item || item.sourceType === 'shared') return false  // 공유된 개인 task는 본인 weeks에서 삭제
    if (canManage) return true
    return item.ownerUid === user.uid
  }

  async function handleSoftDeleteAction(item) {
    if (!canDeleteAction(item)) return
    const ok = window.confirm(`"${item.title}" 프로젝트를 휴지통으로 이동할까요?\n  30일간 보관 후 자동 영구 삭제됩니다. 그 전엔 휴지통에서 복원 가능.`)
    if (!ok) return
    try {
      await softDeleteActionItem(
        DEFAULT_TEAM_ID,
        item.id,
        user.uid,
        getProfileName(user, memberProfile),
        { title: item.title },
      )
    } catch (err) {
      window.alert(`삭제 실패: ${err.message || '알 수 없는 오류'}`)
    }
  }

  async function handleRestoreAction(item) {
    try {
      await restoreActionItem(
        DEFAULT_TEAM_ID,
        item.id,
        user.uid,
        getProfileName(user, memberProfile),
        { title: item.title },
      )
    } catch (err) {
      window.alert(`복원 실패: ${err.message || '알 수 없는 오류'}`)
    }
  }

  async function handlePurgeAction(item) {
    const ok = window.confirm(`"${item.title}"을(를) 영구 삭제할까요?\n  복원 불가능합니다.`)
    if (!ok) return
    try {
      await hardDeleteActionItem(
        DEFAULT_TEAM_ID,
        item.id,
        user.uid,
        getProfileName(user, memberProfile),
        { title: item.title },
      )
    } catch (err) {
      window.alert(`영구 삭제 실패: ${err.message || '알 수 없는 오류'}`)
    }
  }

  // 30일 지난 휴지통 항목 자동 영구 삭제 (클라이언트 cron) — 감사 로그도 기록
  useEffect(() => {
    if (trashedItems.length === 0) return
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000
    const now = Date.now()
    trashedItems.forEach(item => {
      if (!item.deletedAt) return
      const deletedMs = new Date(item.deletedAt).getTime()
      if (now - deletedMs > THIRTY_DAYS) {
        hardDeleteActionItem(DEFAULT_TEAM_ID, item.id, 'auto-purge', '30일 자동 정리', { title: item.title })
          .catch(err => {
            console.warn('[휴지통 자동 정리 실패]', item.id, err.message)
          })
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trashedItems.length])

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
      {/* KPI 바는 별도 KPI 관리 페이지로 이동됨 */}
      <SubteamFilter value={subteamFilter} onChange={setSubteamFilter} />

      <section className="content-grid two">
        <Panel title="진행 프로젝트" icon={Flag} action={canManage && (
          <button className="secondary-action" onClick={() => setShowProjectForm(!showProjectForm)}>
            <Plus size={15} />
            프로젝트 추가
          </button>
        )}>
          {showProjectForm && (
            <ProjectForm
              kpis={kpis}
              onCreate={async item => {
                await createActionItem(DEFAULT_TEAM_ID, {
                  ...item,
                  ownerUid: user.uid,
                  ownerName: getProfileName(user, memberProfile),
                  ownerPhotoURL: user.photoURL || '',
                })
                setShowProjectForm(false)
              }}
            />
          )}
          <div className="filter-row">
            <button
              key="all"
              className={selectedCategories.size === 0 ? 'active' : ''}
              onClick={() => setSelectedCategories(new Set())}
            >
              전체
            </button>
            {Object.keys(CATEGORY_META).map(key => (
              <button
                key={key}
                className={selectedCategories.has(key) ? 'active' : ''}
                onClick={() => toggleCategory(key)}
              >
                {CATEGORY_META[key].label}
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
            {actionPlanItems.map((item, idx) => {
              const prev = idx > 0 ? actionPlanItems[idx - 1] : null
              const currentKpi = item.kpi || item.impact || ''
              const prevKpi = prev ? (prev.kpi || prev.impact || '') : null
              const showHeader = idx === 0 || prevKpi !== currentKpi
              return (
                <div key={item.actionKey}>
                  {showHeader && (
                    <div className="kpi-group-header">{currentKpi || 'KPI 미연결'}</div>
                  )}
                  <div className="action-with-detail" id={`action-item-${item.actionKey}`}>
                    <ActionRow
                      item={item}
                      active={selectedAction?.actionKey === item.actionKey}
                      onClick={() => setSelectedActionId(selectedAction?.actionKey === item.actionKey ? null : item.actionKey)}
                      onStatusChange={(item.sourceType === 'shared' || canManage || permissions.canUpdateTeamProject) ? next => handleActionStatusChange(item, next) : null}
                      kpis={kpis}
                      onKpiChange={canManage ? next => handleActionKpiChange(item, next) : null}
                      onDelete={canDeleteAction(item) ? () => handleSoftDeleteAction(item) : null}
                    />
                    {selectedAction?.actionKey === item.actionKey && (
                      <ActionItemDetail
                        item={selectedAction}
                        user={user}
                        canManage={canManage}
                        onAddComment={(permissions.canComment || canManage) ? text => handleAddActionComment(selectedAction, text) : null}
                        onReplyComment={(permissions.canReply || canManage) ? (commentId, text) => handleReplyActionComment(selectedAction, commentId, text) : null}
                        onDeleteComment={commentId => handleDeleteActionComment(selectedAction, commentId)}
                      />
                    )}
                  </div>
                </div>
              )
            })}
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
                key={task.actionKey || taskKey(task)}
                task={task}
                active={selectedActionId === (task.actionKey || `shared-${task.memberUid}-${task.id}`)}
                onClick={() => task.actionKey ? focusActionItem(task.actionKey) : focusSharedProject(task)}
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

      {/* 휴지통 — 삭제된 진행 프로젝트 30일 보관 */}
      {trashedItems.length > 0 && (
        <TrashPanel
          items={trashedItems}
          canManage={canManage}
          currentUid={user.uid}
          onRestore={handleRestoreAction}
          onPurge={handlePurgeAction}
        />
      )}

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
  const [dailyReport, setDailyReport] = useState(null)
  const [dailyReports, setDailyReports] = useState([])
  const [openReportId, setOpenReportId] = useState('')
  const [loading, setLoading] = useState(false)
  const [dailyLoading, setDailyLoading] = useState(false)
  const [error, setError] = useState('')
  const todayKey = getTodayKey()
  const todayLogs = collectDailyProgressLogs(teamFeed, todayKey)

  useEffect(() => subscribeDailyReport(DEFAULT_TEAM_ID, todayKey, setDailyReport), [todayKey])
  useEffect(() => subscribeDailyReports(DEFAULT_TEAM_ID, setDailyReports), [])

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

  async function handleDailyRegenerate() {
    setDailyLoading(true)
    setError('')
    try {
      const result = await requestGemini('dailyReport', {
        dateKey: todayKey,
        dateLabel: formatKoreanDate(todayKey),
        weekLabel,
        progressLogs: todayLogs,
        actionItems,
        kpis,
      })
      await saveDailyReport(DEFAULT_TEAM_ID, todayKey, {
        ...result,
        weekLabel,
        dateLabel: formatKoreanDate(todayKey),
        progressCount: todayLogs.length,
        source: 'manual',
        generatedAt: new Date().toISOString(),
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setDailyLoading(false)
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
  const dailyReportText = dailyReport ? [
    `[PM 피드백] ${dailyReport.feedbackReport?.headline || ''}`,
    ...(dailyReport.feedbackReport?.coreProgress || []).map(item => `- ${item}`),
    '',
    '[리스크]',
    ...(dailyReport.feedbackReport?.risks || []).map(item => `- ${item}`),
    '',
    '[디벨롭 제안]',
    ...(dailyReport.feedbackReport?.developmentAdvice || []).map(item => `- ${item}`),
    dailyReport.feedbackReport?.pmComment || '',
    '',
    `[일일 업무보고] ${dailyReport.dailySummary?.title || ''}`,
    ...(dailyReport.dailySummary?.summaryBullets || []).map(item => `- ${item}`),
    dailyReport.dailySummary?.executiveText || '',
    '',
    '[본부장 이메일 초안]',
    dailyReport.emailDraft?.subject || '',
    dailyReport.emailDraft?.body || '',
    '',
    '[AI 누적관리 원장]',
    dailyReport.aiManagement?.dailyDigest || '',
    ...(dailyReport.aiManagement?.taskLedger || []).map(item => `- ${item.taskTitle}: ${item.progressToday} / 다음: ${item.nextAction} / 품질:${item.dataQuality}`),
    '',
    '[누락 입력값]',
    ...(dailyReport.aiManagement?.missingInputs || []).map(item => `- ${item}`),
  ].join('\n') : ''

  return (
    <main className="content-grid report-layout">
      <Panel title="오늘 자동 업무보고" icon={Clock} action={
        <button className="secondary-action" onClick={() => dailyReportText && navigator.clipboard?.writeText(dailyReportText)} disabled={!dailyReport}>
          <Check size={15} />
          복사
        </button>
      }>
        <div className="report-source">
          <MetricCard icon={Clock} label="오늘 진행내용" value={`${todayLogs.length}건`} helper={formatKoreanDate(todayKey)} tone="blue" />
          <MetricCard icon={Bot} label="자동 생성" value="17:50" helper="한국시간 기준" tone="teal" />
          <MetricCard icon={RefreshCcw} label="수동 재생성" value="17:40~18:10" helper="최신 기록 반영" tone="green" />
        </div>
        <button className="primary-action wide" onClick={handleDailyRegenerate} disabled={dailyLoading}>
          <RefreshCcw size={16} />
          {dailyLoading ? '오늘 보고서 생성 중' : '오늘 보고서 다시 생성'}
        </button>
        <DailyReportView report={dailyReport} />
        {!dailyReport && <EmptyText text="아직 오늘 생성된 일일 보고서가 없습니다. 17:50 자동 생성 또는 수동 재생성을 사용하세요." />}
      </Panel>

      <Panel title="AI 보고 초안 생성" icon={Bot}>
        <div className="report-source">
          <MetricCard icon={Users} label="팀 공유" value={`${teamFeed.length}명`} helper="이번 주 기준" tone="blue" />
          <MetricCard icon={Flag} label="진행 프로젝트" value={`${actionItems.length}개`} helper="프로젝트 기준" tone="teal" />
          <MetricCard icon={BarChart3} label="KPI" value={`${kpis.length}개`} helper="운영 지표" tone="green" />
        </div>
        <button className="primary-action wide" onClick={handleGenerate} disabled={loading}>
          <Bot size={16} />
          {loading ? '생성 중' : 'Gemini 2.5 Flash로 보고 초안 생성'}
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

      <Panel title="일별 업무보고 누적 히스토리" icon={ListChecks}>
        <DailyReportHistory
          reports={dailyReports}
          openReportId={openReportId}
          onToggle={id => setOpenReportId(current => current === id ? '' : id)}
        />
      </Panel>
    </main>
  )
}

function DailyReportView({ report }) {
  if (!report) return null
  const feedback = report.feedbackReport || {}
  const summary = report.dailySummary || {}
  const emailDraft = report.emailDraft || {}
  const aiManagement = report.aiManagement || {}
  const emailSubject = emailDraft.subject || `[NST BIO] 일일업무보고 - ${report.dateLabel || report.dateKey || ''}`
  const emailBody = emailDraft.body || [
    '안녕하세요. 본부장님',
    '',
    `${report.dateLabel || report.dateKey || '금일'} 일일업무보고 송부드립니다.`,
    '',
    summary.executiveText || summary.completedOrProgress || '',
    '',
    '끝.',
    '',
    '감사합니다.',
  ].join('\n')
  const mailtoHref = `mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`

  return (
    <div className="daily-report-grid">
      <article className="report-output daily-report-card">
        <div className="note-head">
          <Badge tone="teal">PM 피드백</Badge>
          <span>{report.dateLabel || report.dateKey} · {report.source === 'cron' ? '자동 생성' : '수동 생성'}</span>
        </div>
        <h2>{feedback.headline}</h2>
        <ReportList title="핵심 진행" items={feedback.coreProgress} />
        <ReportList title="리스크" items={feedback.risks} />
        <ReportList title="디벨롭 방향" items={feedback.developmentAdvice} />
        <div className="executive-brief">{feedback.pmComment}</div>
      </article>

      <article className="report-output daily-report-card">
        <div className="note-head">
          <Badge tone="blue">일일 업무보고</Badge>
          <span>보고용 요약</span>
        </div>
        <h2>{summary.title}</h2>
        <ReportList title="요약" items={summary.summaryBullets} />
        <div className="executive-brief">{summary.completedOrProgress}</div>
        <div className="executive-brief">{summary.issuesAndNeeds}</div>
        <div className="executive-brief">{summary.tomorrowPlan}</div>
        <div className="executive-brief">{summary.executiveText}</div>
      </article>

      <article className="report-output daily-report-card ai-ledger-card">
        <div className="note-head">
          <Badge tone="teal">AI 누적관리 원장</Badge>
          <span>데이터 축적용</span>
        </div>
        <h2>{aiManagement.dailyDigest || '오늘 업무 누적관리 데이터'}</h2>
        <div className="ai-ledger-list">
          {(aiManagement.taskLedger || []).map((item, index) => (
            <article className="ai-ledger-item" key={`${item.taskTitle || 'task'}-${index}`}>
              <div className="note-head">
                <strong>{item.taskTitle || '업무명 미입력'}</strong>
                <Badge tone={item.dataQuality === '충분' ? 'green' : 'amber'}>{item.dataQuality || '보완필요'}</Badge>
              </div>
              <div className="ledger-grid">
                <span>담당: {item.owner || '미입력'}</span>
                <span>상태: {item.status || '미입력'}</span>
                <span>KPI/분류: {item.category || '미연결'}</span>
                <span>일정: {item.dueOrTiming || '미입력'}</span>
              </div>
              <p><strong>오늘 진척</strong> {item.progressToday || '미입력'}</p>
              <p><strong>결정/산출물</strong> {item.decisionOrOutput || '미입력'}</p>
              <p><strong>리스크</strong> {item.riskOrBlocker || '없음'}</p>
              <p><strong>다음 액션</strong> {item.nextAction || '미입력'}</p>
            </article>
          ))}
          {(aiManagement.taskLedger || []).length === 0 && <EmptyText text="아직 누적관리 원장이 없습니다. 보고서를 다시 생성하면 함께 만들어집니다." />}
        </div>
        <ReportList title="누락 입력값" items={aiManagement.missingInputs || []} />
        <ReportList title="내일 체크리스트" items={aiManagement.tomorrowChecklist || []} />
      </article>

      <article className="report-output daily-report-card email-draft-card">
        <div className="note-head">
          <Badge tone="green">본부장 메일 초안</Badge>
          <span>바로 발송용</span>
        </div>
        <h2>{emailSubject}</h2>
        <div className="email-draft-body">{emailBody}</div>
        <div className="email-draft-actions">
          <button className="secondary-action" onClick={() => navigator.clipboard?.writeText(`${emailSubject}\n\n${emailBody}`)}>
            <Check size={15} />
            메일 초안 복사
          </button>
          <a className="secondary-action" href={mailtoHref}>
            <Send size={15} />
            메일 열기
          </a>
        </div>
      </article>
    </div>
  )
}

function DailyReportHistory({ reports, openReportId, onToggle }) {
  if (!reports.length) {
    return <EmptyText text="아직 누적된 일일업무보고가 없습니다. 오늘 보고서를 생성하면 날짜별로 쌓입니다." />
  }

  return (
    <div className="daily-history-list">
      {reports.map(report => {
        const isOpen = openReportId === report.id
        const summary = report.dailySummary || {}
        const aiManagement = report.aiManagement || {}
        const emailDraft = report.emailDraft || {}
        const copyText = [
          emailDraft.subject || summary.title || report.dateLabel || report.dateKey,
          '',
          emailDraft.body || summary.executiveText || '',
          '',
          '[AI 누적관리]',
          aiManagement.dailyDigest || '',
          ...(aiManagement.taskLedger || []).map(item => `- ${item.taskTitle}: ${item.progressToday} / 다음: ${item.nextAction}`),
        ].join('\n')

        return (
          <article className="daily-history-item" key={report.id}>
            <button className="history-toggle" type="button" onClick={() => onToggle(report.id)}>
              <span>{isOpen ? '▼' : '▶'} {report.dateLabel || report.dateKey}</span>
              <small>{report.progressCount || 0}건 · {report.source === 'cron' ? '자동' : '수동'} 생성</small>
            </button>
            {isOpen && (
              <div className="daily-history-body">
                <div className="note-head">
                  <Badge tone="green">메일 보고</Badge>
                  <button className="secondary-action mini" onClick={() => navigator.clipboard?.writeText(copyText)}>
                    <Check size={14} />
                    복사
                  </button>
                </div>
                <h3>{emailDraft.subject || summary.title || '일일업무보고'}</h3>
                <div className="email-draft-body">{emailDraft.body || summary.executiveText || '보고 내용이 없습니다.'}</div>
                <div className="history-ledger-summary">
                  <strong>AI 누적관리 요약</strong>
                  <p>{aiManagement.dailyDigest || '누적관리 요약이 없습니다.'}</p>
                  <ReportList title="내일 체크리스트" items={aiManagement.tomorrowChecklist || []} />
                </div>
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}

// 공유 동시관리 대상 선택기 — 본인 외 팀원/부서 멀티 선택
function CoOwnerPicker({ allMembers = [], currentUid, selectedUids = [], onChange }) {
  const [open, setOpen] = useState(false)
  const candidates = (allMembers || []).filter(m => m.uid && m.uid !== currentUid)
  const selectedSet = new Set(selectedUids)

  // 부서별 그룹화
  const grouped = useMemo(() => {
    const map = {}
    candidates.forEach(m => {
      const sub = m.subteam || 'misc'
      const label = m.subteamLabel || getSubteamLabel(m.subteam)
      if (!map[sub]) map[sub] = { label, members: [] }
      map[sub].members.push(m)
    })
    return Object.entries(map).map(([key, v]) => ({ key, label: v.label, members: v.members }))
  }, [candidates])

  function toggleMember(uid) {
    if (selectedSet.has(uid)) {
      onChange(selectedUids.filter(u => u !== uid))
    } else {
      onChange([...selectedUids, uid])
    }
  }

  function toggleSubteam(subKey) {
    const subMembers = candidates.filter(m => (m.subteam || 'misc') === subKey)
    const allSelected = subMembers.every(m => selectedSet.has(m.uid))
    if (allSelected) {
      // 전부 선택돼있으면 전부 해제
      const removeUids = new Set(subMembers.map(m => m.uid))
      onChange(selectedUids.filter(u => !removeUids.has(u)))
    } else {
      // 미선택분 추가
      const addUids = subMembers.filter(m => !selectedSet.has(m.uid)).map(m => m.uid)
      onChange([...selectedUids, ...addUids])
    }
  }

  function removeOne(uid) {
    onChange(selectedUids.filter(u => u !== uid))
  }

  const selectedMembers = candidates.filter(m => selectedSet.has(m.uid))

  return (
    <div className="co-owner-picker">
      <div className="co-owner-summary">
        <strong>👥 공유 동시관리</strong>
        {selectedMembers.length === 0 ? (
          <span className="co-owner-empty">— 선택된 공동담당자 없음 (본인 단독 관리)</span>
        ) : (
          <div className="co-owner-chips">
            {selectedMembers.map(m => (
              <span key={m.uid} className="co-owner-chip">
                {m.displayName || '이름 없음'}
                <button type="button" onClick={() => removeOne(m.uid)} title="제외">
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        <button
          type="button"
          className="ghost-action mini co-owner-toggle"
          onClick={() => setOpen(!open)}
        >
          {open ? '닫기' : (selectedMembers.length > 0 ? '편집' : '추가')}
        </button>
      </div>
      {open && (
        <div className="co-owner-list">
          <small>저장 시 선택된 사람의 이번 주 업무 목록에도 자동 등록되며, 양쪽에서 수정/완료가 동기화됩니다.</small>
          {grouped.length === 0 && (
            <p className="co-owner-empty">초대 가능한 다른 팀원이 없습니다.</p>
          )}
          {grouped.map(group => {
            const subMembers = group.members
            const allSelected = subMembers.every(m => selectedSet.has(m.uid))
            return (
              <div key={group.key} className="co-owner-group">
                <button
                  type="button"
                  className={`co-owner-group-head ${allSelected ? 'all' : ''}`}
                  onClick={() => toggleSubteam(group.key)}
                >
                  {group.label} <span className="co-owner-group-cnt">({subMembers.length})</span>
                  <span className="co-owner-group-action">
                    {allSelected ? '부서 전체 해제' : '부서 전체 추가'}
                  </span>
                </button>
                <div className="co-owner-members">
                  {subMembers.map(m => {
                    const isSelected = selectedSet.has(m.uid)
                    return (
                      <button
                        key={m.uid}
                        type="button"
                        className={`co-owner-member ${isSelected ? 'on' : ''}`}
                        onClick={() => toggleMember(m.uid)}
                      >
                        {isSelected ? <Check size={12} /> : <Plus size={12} />}
                        {m.displayName || '이름 없음'}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TaskEditor({ task, user, permissions, onChange, onComplete, onDelete, onLeaveShared, expanded, onToggleExpand, onAddComment, onAddProgress, onUpdateProgress, onDeleteProgress, onReplyComment, onDeleteComment, allTasks = [] }) {
  const members = useContext(MembersContext)
  const [progressDraft, setProgressDraft] = useState('')
  const [progressImages, setProgressImages] = useState([])
  const [progressSaving, setProgressSaving] = useState(false)
  const [draftStatus, setDraftStatus] = useState(task.status)
  const [draftPriority, setDraftPriority] = useState(task.priority)
  const [draftIsFocus, setDraftIsFocus] = useState(Boolean(task.isFocus))
  const [inlineEditing, setInlineEditing] = useState(null) // 'priority' | 'due' | null
  const [showRelations, setShowRelations] = useState(false) // 업무 연결 토글
  const hasRelations = (task.parentIds || []).length > 0 || (task.siblingIds || []).length > 0
  const due = daysUntil(task.dueDate)
  const todayLogs = (task.progressLogs || []).filter(log => log.dateKey === getTodayKey())

  async function handleInlinePriorityChange(newPriority) {
    setInlineEditing(null)
    if (newPriority === task.priority) return
    setDraftPriority(newPriority)
    await onChange({ priority: newPriority })
  }

  async function handleInlineDueChange(newDate) {
    setInlineEditing(null)
    if (newDate === (task.dueDate || '')) return
    await onChange({ dueDate: newDate || '' })
  }

  async function handleInlineStatusChange(newStatus) {
    setInlineEditing(null)
    if (newStatus === task.status) return
    setDraftStatus(newStatus)
    if (newStatus === 'done') {
      await onComplete()
    } else {
      await onChange({ status: newStatus })
    }
  }

  async function handleToggleFocus() {
    const next = !task.isFocus
    setDraftIsFocus(next)
    await onChange({ isFocus: next })
  }

  useEffect(() => {
    setDraftStatus(task.status)
    setDraftPriority(task.priority)
    setDraftIsFocus(Boolean(task.isFocus))
  }, [task.status, task.priority, task.isFocus])

  async function handleAddProgress(event) {
    event.preventDefault()
    if (!progressDraft.trim() && progressImages.length === 0) return
    const form = event.currentTarget
    setProgressSaving(true)
    try {
      await onAddProgress(progressDraft, progressImages)
      setProgressDraft('')
      setProgressImages([])
      form.reset()
    } finally {
      setProgressSaving(false)
    }
  }

  function handleImageChange(event) {
    const files = Array.from(event.target.files || []).filter(file => file.type.startsWith('image/'))
    setProgressImages(files.slice(0, MAX_PROGRESS_IMAGES))
  }

  async function handleConfirmStatus() {
    if (draftStatus === 'done') {
      await onComplete()
      return
    }
    await onChange({ status: draftStatus, priority: draftPriority, isFocus: draftIsFocus })
  }

  // V2 마감 임박 — D-3 이내(완료/지남 제외) → 좌측 컬러바 빨강 + 큰 D-day 표시
  const isDueSoon = due !== null && due >= 0 && due <= 3 && task.status !== 'done'

  return (
    <article className={`task-editor status-${task.status} ${task.status === 'done' ? 'done' : ''} ${expanded ? 'expanded' : ''} ${isDueSoon ? 'is-due-soon' : ''}`}>
      {/* V2: D-3 이내 마감 D-day 좌측 강조 표시 — 평상시엔 status 컬러바만 */}
      {isDueSoon && (
        <div className="task-due-bar" aria-label={`마감 D-${due}`}>
          <span className="d-day">D-{due}</span>
          <span className="d-label">{due === 0 ? '오늘' : '마감 임박'}</span>
        </div>
      )}
      {/* V1: KPI 상단 배너 — 전략 컨텍스트 즉시 인지 */}
      {(task.kpi || task.impact) && (
        <div className="task-kpi-banner" title={`KPI: ${task.kpi || task.impact}`}>
          <span className="kpi-icon">▣</span>
          <span className="kpi-text">{task.kpi || task.impact}</span>
        </div>
      )}
      <div className="task-row" onClick={onToggleExpand} role="button" tabIndex={0} onKeyDown={event => event.key === 'Enter' && onToggleExpand()}>
        <div className="task-main">
        <span className={`status-dot ${STATUS_META[task.status]?.tone || 'gray'}`} />
        <div>
          <strong>{task.title}</strong>
          {due !== null && due < 0 && task.status !== 'done' && (
            <span className="delay-badge">지연</span>
          )}
          {(() => {
            const owner = members.find(m => m.uid === task.ownerUid)
            const displayName = owner?.displayName || task.ownerName || user?.displayName || user?.email || ''
            const displayPhoto = owner?.photoURL || task.ownerPhotoURL || user?.photoURL
            if (!displayName) return null
            return (
              <span className="owner-chip" title={`작성자: ${displayName}`}>
                {displayPhoto ? (
                  <img src={displayPhoto} alt="" />
                ) : (
                  <span className="avatar">{displayName[0] || 'N'}</span>
                )}
                <span>{displayName}</span>
              </span>
            )
          })()}
          {task.detail && <p>{task.detail}</p>}
          <div className="badge-row" onClick={event => event.stopPropagation()}>
            {/* 상태 인라인 편집 */}
            {inlineEditing === 'status' ? (
              <select
                className="inline-edit-select status"
                value={task.status}
                autoFocus
                onChange={event => handleInlineStatusChange(event.target.value)}
                onBlur={() => setInlineEditing(null)}
              >
                {Object.entries(STATUS_META).map(([key, meta]) => (
                  <option key={key} value={key}>{meta.label}</option>
                ))}
              </select>
            ) : (
              <button
                type="button"
                className="badge-button"
                onClick={() => setInlineEditing('status')}
                title="클릭하여 상태 변경"
              >
                <Badge tone={STATUS_META[task.status]?.tone}>
                  {STATUS_META[task.status]?.label || task.status}
                </Badge>
              </button>
            )}
            {/* 우선순위 인라인 편집 */}
            {inlineEditing === 'priority' ? (
              <select
                className="inline-edit-select priority"
                value={task.priority}
                autoFocus
                onChange={event => handleInlinePriorityChange(event.target.value)}
                onBlur={() => setInlineEditing(null)}
              >
                {Object.entries(PRIORITY_META).map(([key, meta]) => (
                  <option key={key} value={key}>{meta.label}</option>
                ))}
              </select>
            ) : (
              <button
                type="button"
                className="badge-button"
                onClick={() => setInlineEditing('priority')}
                title="클릭하여 우선순위 변경"
              >
                <Badge tone={PRIORITY_META[task.priority]?.tone}>
                  {PRIORITY_META[task.priority]?.label || task.priority}
                </Badge>
              </button>
            )}
            {/* 우선순위 업무 토글 (★) */}
            <button
              type="button"
              className={`focus-toggle ${task.isFocus ? 'on' : ''}`}
              onClick={handleToggleFocus}
              title={task.isFocus ? '우선순위 해제' : '우선순위 업무로 표시'}
            >
              {task.isFocus ? '★ 우선순위' : '☆ 우선순위'}
            </button>
            {/* KPI는 카드 상단 배너로 이동 — 인라인 중복 표시 제거 */}
            {/* 공유 동시관리 표시 */}
            {(task.coOwnerUids || []).length > 1 && (() => {
              const isOriginal = !task.originalOwnerUid || task.originalOwnerUid === user?.uid
              const others = (task.coOwnerUids || []).filter(uid => uid && uid !== user?.uid)
              const otherNames = others.map(uid => {
                const m = members.find(x => x.uid === uid)
                return m?.displayName || '이름 없음'
              })
              return (
                <span
                  className={`shared-chip ${isOriginal ? 'original' : 'received'}`}
                  title={`공동담당자: ${otherNames.join(', ') || '?'}\n${isOriginal ? '본인이 만든 공유 업무' : `원본 작성: ${task.ownerName || '?'}`}`}
                >
                  <Users size={11} /> {isOriginal ? '공유함' : '공유받음'} · {otherNames.length}명
                </span>
              )
            })()}
            {/* 진행로그 카운트 badge 제거 — 클릭하여 펼치면 보이는 내용이라 메타 줄에서 생략 */}
            {/* 마감일 인라인 편집 */}
            {inlineEditing === 'due' ? (
              <input
                type="date"
                className="inline-edit-date"
                defaultValue={task.dueDate || ''}
                autoFocus
                onChange={event => handleInlineDueChange(event.target.value)}
                onBlur={event => handleInlineDueChange(event.target.value)}
              />
            ) : (
              <button
                type="button"
                className="meta-due-button"
                onClick={() => setInlineEditing('due')}
                title="클릭하여 마감일 변경"
              >
                <Calendar size={11} />
                {formatDue(task.dueDate)}
              </button>
            )}
            {/* 코멘트 카운트 (인라인 박스 스타일) */}
            <span className="meta-comments-button">
              <MessageSquareText size={11} />
              코멘트 {(task.comments || []).length}
            </span>
          </div>
        </div>
      </div>
        <div className="task-controls" onClick={event => event.stopPropagation()}>
          <button
            className={`icon-button subtle relation-toggle-btn ${showRelations ? 'active' : ''} ${hasRelations ? 'has-relations' : ''}`}
            onClick={() => {
              if (!expanded) onToggleExpand()
              setShowRelations(prev => !prev)
            }}
            title={showRelations ? '업무 연결 닫기' : '업무 연결 열기'}
          >
            <span className="relation-toggle-label">
              {showRelations ? '−' : '+'} 업무 연결
              {hasRelations && !showRelations && (
                <span className="relation-toggle-count">
                  ({(task.parentIds || []).length + (task.siblingIds || []).length})
                </span>
              )}
            </span>
          </button>
          {/* 공유 task에서 본인만 빠지기 — 받은 사람 측 옵션 */}
          {(task.coOwnerUids || []).length > 1 && task.originalOwnerUid && task.originalOwnerUid !== user?.uid && onLeaveShared && (
            <button
              className="icon-button subtle"
              onClick={onLeaveShared}
              title="공동관리에서 빠지기 (다른 공동담당자는 유지)"
            >
              <Users size={14} /><X size={11} style={{ marginLeft: -2 }} />
            </button>
          )}
          <button className="icon-button subtle" onClick={onDelete} title={(task.coOwnerUids || []).length > 1 ? '전체 삭제 (모든 공동담당자에서 제거)' : '삭제'}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="comment-panel">
          {showRelations && (
            <TaskRelationsEditor task={task} allTasks={allTasks} onChange={onChange} />
          )}

          <div className="comment-title">
            <Clock size={16} />
            <strong>{task.title} 오늘 진행내용</strong>
          </div>
          {permissions.canWriteProgress ? (
            <>
              <form className="comment-form progress-form" onSubmit={handleAddProgress}>
                <textarea
                  className="progress-textarea"
                  value={progressDraft}
                  onChange={event => setProgressDraft(event.target.value)}
                  placeholder="오늘 이 업무에서 진행한 내용, 산출물, 결정사항을 입력하세요 (Enter = 줄바꿈, Ctrl/Cmd+Enter = 등록)"
                  rows={2}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                      event.preventDefault()
                      if (progressDraft.trim() || progressImages.length > 0) {
                        event.currentTarget.form?.requestSubmit?.()
                      }
                    }
                  }}
                />
                {permissions.canUploadImage && (
                  <label className="file-action">
                    이미지
                    <input type="file" accept="image/*" multiple onChange={handleImageChange} />
                  </label>
                )}
                <button className="secondary-action" type="submit" disabled={progressSaving}>
                  <Plus size={15} />
                  {progressSaving ? '저장 중' : '등록'}
                </button>
              </form>
              {progressImages.length > 0 && (
                <div className="image-preview-strip">
                  {progressImages.map(file => (
                    <span key={`${file.name}-${file.size}`}>{file.name}</span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <EmptyText text="관리자가 오늘 진행내용 작성 권한을 제한했습니다." />
          )}
          <div className="comment-list progress-list">
            {todayLogs.map(log => (
              <ProgressLogItem
                key={log.id}
                log={log}
                canEdit={!!onUpdateProgress && log.authorUid === user?.uid}
                canDelete={!!onDeleteProgress && log.authorUid === user?.uid}
                onUpdate={text => onUpdateProgress?.(task.id, log.id, { text })}
                onDelete={() => onDeleteProgress?.(task.id, log.id)}
              />
            ))}
            {todayLogs.length === 0 && <EmptyText text="오늘 입력한 진행내용이 없습니다." />}
          </div>

          <div className="comment-title">
            <MessageSquareText size={16} />
            <strong>{task.title} 코멘트 / 피드백</strong>
          </div>
          <CommentThread
            comments={task.comments || []}
            user={user}
            onReply={onReplyComment}
            onDelete={onDeleteComment}
            emptyText="아직 코멘트가 없습니다."
          />
        </div>
      )}
    </article>
  )
}

function ActionRow({ item, onStatusChange, onKpiChange, onDelete, kpis = [], compact = false, active = false, onClick }) {
  const members = useContext(MembersContext)
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

  const isOverdue = daysUntil(item.dueDate) < 0 && currentStatus !== 'done'
  return (
    <article className={`action-row status-${currentStatus} ${compact ? 'compact' : ''} ${active ? 'active' : ''}`} onClick={onClick}>
      <div>
        {assigneeLabel && <div className="subteam-tag-top">{assigneeLabel}</div>}
        <div className="row-title">
          <strong>{item.title}</strong>
          <Badge tone={CATEGORY_META[item.category]?.tone}>{CATEGORY_META[item.category]?.label}</Badge>
          {isOverdue && <span className="delay-badge">지연</span>}
          {(() => {
            const ownerUid = item.ownerUid || item.memberUid
            const owner = ownerUid ? members.find(m => m.uid === ownerUid) : null
            const displayName = owner?.displayName || item.ownerName || item.memberName
            const displayPhoto = owner?.photoURL || item.ownerPhotoURL || item.memberPhotoURL
            if (!displayName) return null
            return (
              <span className="owner-chip" title={`작성자: ${displayName}`}>
                {displayPhoto ? (
                  <img src={displayPhoto} alt="" />
                ) : (
                  <span className="avatar">{displayName[0] || 'N'}</span>
                )}
                <span>{displayName}</span>
              </span>
            )
          })()}
        </div>
        {!compact && <p>{item.detail}</p>}
        <div className="badge-row">
          <Badge tone={PRIORITY_META[item.priority]?.tone}>{PRIORITY_META[item.priority]?.label}</Badge>
          {(item.kpi || item.impact) && <Badge tone="teal">{item.kpi || item.impact}</Badge>}
          <span className="meta-due">{formatDue(item.dueDate)}</span>
          <span className="meta-comments">코멘트 {(item.comments || []).length}</span>
        </div>
      </div>
      {(onStatusChange || onKpiChange || onDelete) && (
        <div className="status-confirm" onClick={event => event.stopPropagation()}>
          {onKpiChange && (
            <select value={item.kpi || item.impact || ''} onChange={event => onKpiChange(event.target.value)} aria-label="연결 KPI">
              <option value="">KPI 미연결</option>
              {(() => {
                // 내 업무 폼과 동일한 부서별 optgroup
                const groups = { all: [], bySubteam: {} }
                kpis.forEach(kpi => {
                  const sub = kpi.subteam || 'all'
                  if (sub === 'all') groups.all.push(kpi)
                  else {
                    if (!groups.bySubteam[sub]) groups.bySubteam[sub] = []
                    groups.bySubteam[sub].push(kpi)
                  }
                })
                const blocks = []
                Object.entries(groups.bySubteam).forEach(([sub, items]) => {
                  blocks.push(
                    <optgroup key={`sub-${sub}`} label={getSubteamLabel(sub)}>
                      {items.map(kpi => <option key={kpi.id} value={kpi.label}>{kpi.label}</option>)}
                    </optgroup>,
                  )
                })
                if (groups.all.length > 0) {
                  blocks.push(
                    <optgroup key="all" label="전사 공통">
                      {groups.all.map(kpi => <option key={kpi.id} value={kpi.label}>{kpi.label}</option>)}
                    </optgroup>,
                  )
                }
                return blocks
              })()}
            </select>
          )}
          {onStatusChange && (
            <>
              <select value={draftStatus} onChange={event => setDraftStatus(event.target.value)}>
                {Object.entries(STATUS_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
              </select>
              <button className="secondary-action" onClick={handleConfirm} disabled={draftStatus === currentStatus}>
                <Check size={15} />
                확인
              </button>
            </>
          )}
          {onDelete && (
            <button
              type="button"
              className="icon-button subtle action-delete-btn"
              onClick={ev => { ev.stopPropagation(); onDelete() }}
              title="휴지통으로 이동 (30일 보관)"
              aria-label="삭제"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}
    </article>
  )
}

function TaskRelationsEditor({ task, allTasks = [], onChange }) {
  const [parentSearch, setParentSearch] = useState('')
  const parentIds = task.parentIds || []
  const siblingIds = task.siblingIds || []

  const available = allTasks.filter(t => t.id !== task.id)

  // 이전 업무: 검색어 있으면 전체 기간에서, 없으면 1개월 이내만
  const oneMonthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
  const searchLower = parentSearch.trim().toLowerCase()
  const baseParentPool = searchLower
    ? available.filter(t => (t.title || '').toLowerCase().includes(searchLower))
    : available.filter(t => {
        const ts = new Date(t.createdAt || t.updatedAt || 0).getTime()
        return ts >= oneMonthAgo
      })
  const availableParents = baseParentPool.filter(t =>
    !parentIds.includes(t.id) && !siblingIds.includes(t.id)
  )

  // 병행 업무: 진행 중인 task만 (완료 제외)
  const activeTasks = available.filter(t => t.status !== 'done')
  const availableSiblings = activeTasks.filter(t =>
    !siblingIds.includes(t.id) && !parentIds.includes(t.id)
  )

  function getTitle(id) {
    return allTasks.find(t => t.id === id)?.title || '(삭제된 업무)'
  }

  function addParent(value) {
    if (!value || parentIds.includes(value)) return
    onChange({ parentIds: [...parentIds, value] })
    setParentSearch('')
  }

  function removeParent(id) {
    onChange({ parentIds: parentIds.filter(x => x !== id) })
  }

  function addSibling(value) {
    if (!value || siblingIds.includes(value)) return
    onChange({ siblingIds: [...siblingIds, value] })
  }

  function removeSibling(id) {
    onChange({ siblingIds: siblingIds.filter(x => x !== id) })
  }

  return (
    <div className="task-relations">
      <div className="comment-title">
        <strong>업무 연결</strong>
      </div>

      <div className="relation-row">
        <span className="relation-label">이전 업무</span>
        <div className="relation-chips">
          {parentIds.map(id => (
            <span key={id} className="relation-chip parent">
              {getTitle(id)}
              <button type="button" onClick={() => removeParent(id)} aria-label="제거">×</button>
            </span>
          ))}
          <div className="relation-add-group">
            <input
              type="search"
              className="relation-search"
              placeholder="검색 (전체 기간)"
              value={parentSearch}
              onChange={event => setParentSearch(event.target.value)}
            />
            <select
              className="relation-add"
              value=""
              onChange={event => { addParent(event.target.value); event.target.value = '' }}
            >
              <option value="">
                {searchLower
                  ? `+ 검색 결과 (${availableParents.length}건)`
                  : `+ 최근 1개월 (${availableParents.length}건)`}
              </option>
              {availableParents.map(t => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="relation-row">
        <span className="relation-label">병행 업무</span>
        <div className="relation-chips">
          {siblingIds.map(id => (
            <span key={id} className="relation-chip sibling">
              {getTitle(id)}
              <button type="button" onClick={() => removeSibling(id)} aria-label="제거">×</button>
            </span>
          ))}
          <select
            className="relation-add"
            value=""
            onChange={event => { addSibling(event.target.value); event.target.value = '' }}
          >
            <option value="">+ 진행 중 업무 ({availableSiblings.length}건)</option>
            {availableSiblings.map(t => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
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
          <span>{member.subteamLabel || getSubteamLabel(member.subteam)} · {member.title || '팀원'} · {done}/{items.length} 완료</span>
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

function PersonalKpiPanel({ user, kpis = [], tasks = [], history = [] }) {
  // 본인 업무 풀 (이번 주 + 완료 히스토리) — 자동 집계용
  const linkableTasks = useMemo(() => {
    const seen = new Set()
    return [...tasks, ...history.flatMap(w => w.items || [])].filter(t => {
      if (!t || seen.has(t.id)) return false
      seen.add(t.id)
      return true
    })
  }, [tasks, history])

  return (
    <Panel title="내 개인 KPI" icon={Flag}>
      {kpis.length === 0 ? (
        <EmptyText text="아직 팀장이 등록한 개인 KPI가 없습니다." />
      ) : (
        <div className="kpi-grid">
          {kpis.map(kpi => (
            <PersonalKpiCard key={kpi.id} kpi={kpi} linkableTasks={linkableTasks} />
          ))}
        </div>
      )}
    </Panel>
  )
}

function PersonalKpiCard({ kpi, linkableTasks = [], onDelete = null }) {
  const linkedTasks = useMemo(
    () => linkableTasks.filter(t => {
      const label = String(t.kpi || t.impact || '').trim()
      return label && label === kpi.label
    }),
    [linkableTasks, kpi.label],
  )
  const totalCount = linkedTasks.length
  const completedCount = linkedTasks.filter(t => t.status === 'done').length
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  return (
    <article className={`kpi-card ${kpi.color || 'amber'} personal`}>
      <div className="kpi-card-head">
        <span className="kpi-card-label">{kpi.label}</span>
        {onDelete && (
          <button className="icon-button subtle kpi-card-delete" onClick={onDelete} title="삭제">
            <Trash2 size={14} />
          </button>
        )}
      </div>
      <div className="kpi-card-meta">
        <span className="kpi-subteam-tag personal-tag">개인</span>
      </div>
      {kpi.description && <p className="kpi-card-description">{kpi.description}</p>}
      <strong>
        {totalCount > 0
          ? <>업무 <span className="kpi-count-num">{completedCount}/{totalCount}</span> <small style={{ fontWeight: 400, opacity: 0.7 }}>완료</small></>
          : <span className="kpi-count-empty">연결된 업무 없음</span>}
      </strong>
      <div className="progress-track"><span style={{ width: `${pct}%` }} /></div>
      <div className="kpi-foot">
        <small>{totalCount > 0 ? `${pct}% 완료` : '업무를 연결하면 자동 집계됩니다'}</small>
      </div>
    </article>
  )
}

// 사용자별 순서 저장 hook — localStorage에 보관, 새 ID 자동 append
function useOrderPref(storageKey, defaultIds) {
  const [order, setOrder] = useState(() => {
    try {
      const raw = localStorage.getItem(`order-${storageKey}`)
      if (!raw) return defaultIds
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return defaultIds
      const seen = new Set(parsed)
      // 저장된 순서 + 새로 추가된 ID는 끝에 append
      return [...parsed.filter(id => defaultIds.includes(id)), ...defaultIds.filter(id => !seen.has(id))]
    } catch { return defaultIds }
  })

  // defaultIds 변경 시 새 ID 합치기 (멤버 추가 등)
  useEffect(() => {
    setOrder(prev => {
      const seen = new Set(prev)
      const merged = [...prev.filter(id => defaultIds.includes(id)), ...defaultIds.filter(id => !seen.has(id))]
      if (merged.length === prev.length && merged.every((id, i) => id === prev[i])) return prev
      try { localStorage.setItem(`order-${storageKey}`, JSON.stringify(merged)) } catch {}
      return merged
    })
  }, [defaultIds.join(',')])

  function move(id, direction) {
    setOrder(prev => {
      const idx = prev.indexOf(id)
      if (idx === -1) return prev
      const target = direction === 'up' ? idx - 1 : idx + 1
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      try { localStorage.setItem(`order-${storageKey}`, JSON.stringify(next)) } catch {}
      return next
    })
  }

  function reset() {
    setOrder(defaultIds)
    try { localStorage.removeItem(`order-${storageKey}`) } catch {}
  }

  return [order, move, reset]
}

// === 주간 자동 회고 ===
// 매주 금요일 17시 이후 첫 접속자에 의해 자동 생성. 7일간 홈 상단 노출.
function getWeekDateRange(weekKey) {
  if (!weekKey) return { start: null, end: null }
  const [yearStr, weekStr] = weekKey.split('-W')
  const year = Number(yearStr)
  const weekNum = Number(weekStr)
  if (!Number.isFinite(year) || !Number.isFinite(weekNum)) return { start: null, end: null }
  const jan4 = new Date(year, 0, 4)
  const dayOfWeek = jan4.getDay() || 7
  const monday = new Date(jan4.getTime() - (dayOfWeek - 1) * 86400000 + (weekNum - 1) * 7 * 86400000)
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday.getTime() + 7 * 86400000 - 1)
  return { start: monday, end: sunday }
}

function computeWeeklyRetro(teamFeed = [], weekKey) {
  const { start, end } = getWeekDateRange(weekKey)
  let completed = 0
  let delayed = 0
  let created = 0
  const totalSet = new Set()
  const subStats = {} // { subKey: { label, completed, total } }
  const kpiStats = {} // { label: { completed, total } }
  const carryOver = []

  teamFeed.forEach(member => {
    const subKey = member.subteam || 'misc'
    const subLabel = member.subteamLabel || getSubteamLabel(member.subteam)
    if (!subStats[subKey]) subStats[subKey] = { label: subLabel, completed: 0, total: 0 }

    ;(member.items || []).forEach(task => {
      const taskKey = `${member.uid}-${task.id}`
      totalSet.add(taskKey)
      subStats[subKey].total += 1
      const kpiLabel = (task.kpi || task.impact || '').trim()
      if (kpiLabel) {
        if (!kpiStats[kpiLabel]) kpiStats[kpiLabel] = { completed: 0, total: 0 }
        kpiStats[kpiLabel].total += 1
      }

      if (task.status === 'done') {
        completed += 1
        subStats[subKey].completed += 1
        if (kpiLabel) kpiStats[kpiLabel].completed += 1
      } else {
        // 막힘 또는 7일+ 무활동
        const lastActivity = task.updatedAt || task.createdAt
        const staleDays = lastActivity
          ? Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86400000)
          : 0
        if (task.status === 'blocked' || staleDays >= 7) {
          delayed += 1
        }
        // carry-over 후보: 우선순위 또는 막힘 task
        if (task.isFocus || task.priority === 'high' || task.status === 'blocked') {
          carryOver.push({
            taskId: task.id,
            title: task.title,
            ownerName: member.displayName || '이름 없음',
            subteamLabel: subLabel,
            status: task.status,
          })
        }
      }

      // 신규: createdAt이 이번 주 범위 안
      if (start && end && task.createdAt) {
        const createdMs = new Date(task.createdAt).getTime()
        if (createdMs >= start.getTime() && createdMs <= end.getTime()) {
          created += 1
        }
      }
    })
  })

  const total = totalSet.size
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0

  const bySubteam = Object.entries(subStats)
    .map(([key, s]) => ({
      key,
      label: s.label,
      completed: s.completed,
      total: s.total,
      pct: s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total)

  const byKpi = Object.entries(kpiStats)
    .map(([label, k]) => ({
      label,
      completed: k.completed,
      total: k.total,
      pct: k.total > 0 ? Math.round((k.completed / k.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6)

  return {
    stats: { completed, delayed, created, total, progress },
    bySubteam,
    byKpi,
    carryOver: carryOver.slice(0, 8),
  }
}

function WeeklyRetroPanel({ user, weekKey, weekLabel, teamFeed = [], canManage = false }) {
  const [retros, setRetros] = useState([])
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [autoTried, setAutoTried] = useState(false)

  useEffect(() => {
    if (!user?.uid) return undefined
    return subscribeWeeklyRetros(DEFAULT_TEAM_ID, setRetros)
  }, [user?.uid])

  const currentRetro = useMemo(
    () => retros.find(r => r.weekKey === weekKey) || null,
    [retros, weekKey],
  )

  const previousRetro = useMemo(() => {
    const prevKey = getPrevWeekKey(weekKey)
    return retros.find(r => r.weekKey === prevKey) || null
  }, [retros, weekKey])

  async function generate({ silent = false } = {}) {
    if (generating) return
    if (!teamFeed || teamFeed.length === 0) {
      if (!silent) setError('팀 데이터가 아직 로드되지 않았습니다. 잠시 후 다시 시도하세요.')
      return
    }
    setGenerating(true)
    setError('')
    try {
      const computed = computeWeeklyRetro(teamFeed, weekKey)
      let insight = null
      try {
        insight = await requestGemini('weeklyRetro', {
          weekLabel,
          stats: computed.stats,
          bySubteam: computed.bySubteam,
          byKpi: computed.byKpi,
          carryOverTitles: computed.carryOver.map(c => `${c.title} (${c.subteamLabel} / ${c.ownerName})`),
          previousStats: previousRetro?.stats || null,
        })
      } catch (geminiErr) {
        console.warn('[주간회고] Gemini 호출 실패 — stats만 저장:', geminiErr.message)
        insight = { error: geminiErr.message || 'Gemini 인사이트 생성 실패' }
      }
      await saveWeeklyRetro(DEFAULT_TEAM_ID, weekKey, {
        weekLabel,
        stats: computed.stats,
        bySubteam: computed.bySubteam,
        byKpi: computed.byKpi,
        carryOver: computed.carryOver,
        insight,
        generatedBy: user.uid,
        generatedAt: new Date().toISOString(),
      })
    } catch (err) {
      console.error('[주간회고] 생성 실패:', err)
      if (!silent) setError(`회고 생성 실패: ${err.message || '알 수 없는 오류'}\n  네트워크와 권한을 확인 후 다시 시도하세요.`)
    } finally {
      setGenerating(false)
    }
  }

  // 자동 트리거: 금요일 17시 이후 + 회고 없음 + 한 번도 시도 안 함
  useEffect(() => {
    if (autoTried) return
    if (currentRetro) return
    if (!teamFeed || teamFeed.length === 0) return
    const now = new Date()
    if (now.getDay() !== 5) return // 금요일(5)만
    if (now.getHours() < 17) return // 17시 이후
    setAutoTried(true)
    generate({ silent: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRetro, teamFeed.length, autoTried])

  async function handleDelete() {
    if (!currentRetro) return
    const ok = window.confirm(`"${weekLabel}" 회고를 삭제할까요?\n  새로 생성하려면 다시 [지금 생성]을 눌러주세요.`)
    if (!ok) return
    try {
      await deleteWeeklyRetro(DEFAULT_TEAM_ID, weekKey)
    } catch (err) {
      setError(`회고 삭제 실패: ${err.message || '알 수 없는 오류'}\n  네트워크와 권한을 확인하세요.`)
    }
  }

  return (
    <Panel
      title={`📅 주간 자동 회고 — ${weekLabel}`}
      icon={Calendar}
      action={
        <div className="weekly-retro-actions">
          {currentRetro && (
            <span className="weekly-retro-meta">
              {currentRetro.generatedAt
                ? `${formatDate(currentRetro.generatedAt)} ${new Date(currentRetro.generatedAt).getHours()}시 생성`
                : '자동 생성됨'}
            </span>
          )}
          <button
            type="button"
            className="secondary-action mini"
            onClick={() => generate()}
            disabled={generating}
            title="현재 데이터로 회고를 생성/갱신합니다"
          >
            <Bot size={13} />
            {generating ? '생성 중...' : currentRetro ? '갱신' : '지금 생성'}
          </button>
          {currentRetro && canManage && (
            <button
              type="button"
              className="ghost-action mini"
              onClick={handleDelete}
              title="이번 주 회고 삭제 (관리자)"
            >
              <Trash2 size={13} /> 삭제
            </button>
          )}
        </div>
      }
    >
      {error && <div className="alert error slim">{error}</div>}
      {!currentRetro && !generating && (
        <p className="weekly-retro-empty">
          아직 이번 주 회고가 없습니다. 매주 금요일 17시 이후 첫 접속자에 의해 자동 생성됩니다.
          <br />
          지금 바로 보고 싶으면 우측 [지금 생성] 버튼을 누르세요.
        </p>
      )}
      {currentRetro && (
        <div className="weekly-retro-body">
          <div className="weekly-retro-stats">
            <div className="retro-stat info">
              <div className="n">{currentRetro.stats?.completed ?? 0}</div>
              <div className="label">완료</div>
            </div>
            <div className="retro-stat warn">
              <div className="n">{currentRetro.stats?.delayed ?? 0}</div>
              <div className="label">지연</div>
            </div>
            <div className="retro-stat">
              <div className="n">{currentRetro.stats?.created ?? 0}</div>
              <div className="label">신규</div>
            </div>
            <div className="retro-stat">
              <div className="n">{currentRetro.stats?.progress ?? 0}%</div>
              <div className="label">전체 진척률</div>
            </div>
          </div>

          {(currentRetro.bySubteam || []).length > 0 && (
            <>
              <strong className="weekly-retro-section-title">부서별 진척률</strong>
              <div className="weekly-retro-bars">
                {currentRetro.bySubteam.map(s => (
                  <div key={s.key} className="weekly-retro-bar">
                    <span className="label">{s.label}</span>
                    <div className="track">
                      <i style={{ width: `${s.pct}%`, background: s.pct < 50 ? '#f59e0b' : '#0d7a6e' }} />
                    </div>
                    <span className="pct">{s.completed}/{s.total} · {s.pct}%</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {(currentRetro.byKpi || []).length > 0 && (
            <>
              <strong className="weekly-retro-section-title">KPI별 진척률</strong>
              <div className="weekly-retro-bars">
                {currentRetro.byKpi.map(k => (
                  <div key={k.label} className="weekly-retro-bar">
                    <span className="label" title={k.label}>{k.label}</span>
                    <div className="track">
                      <i style={{ width: `${k.pct}%`, background: k.pct < 50 ? '#f59e0b' : '#0d7a6e' }} />
                    </div>
                    <span className="pct">{k.completed}/{k.total} · {k.pct}%</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {currentRetro.insight && !currentRetro.insight.error && (
            <div className="weekly-retro-insight">
              {currentRetro.insight.headline && (
                <strong>🤖 {currentRetro.insight.headline}</strong>
              )}
              {currentRetro.insight.insight && <p>{currentRetro.insight.insight}</p>}
              {currentRetro.insight.recommendation && (
                <p className="recommendation">→ {currentRetro.insight.recommendation}</p>
              )}
            </div>
          )}
          {currentRetro.insight?.error && (
            <div className="weekly-retro-insight insight-error">
              ⚠ Gemini 인사이트 생성 실패: {currentRetro.insight.error}
              <br />
              <small>로컬 dev라면 npm run dev:vercel 사용 / API 키 설정 확인</small>
            </div>
          )}

          {(currentRetro.carryOver || []).length > 0 && (
            <div className="weekly-retro-carryover">
              <strong>🔄 다음 주 carry-over 후보</strong>
              <ul>
                {currentRetro.carryOver.map(c => (
                  <li key={c.taskId}>
                    {c.title}
                    {c.status === 'blocked' && <em className="status-tag-mini blocked"> 막힘</em>}
                    <small>— {c.subteamLabel} / {c.ownerName}</small>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}

// 점검 신호 — 진행중 + 지연 + 검토 요청 + 완료 (탭 전환 레이아웃 C)
function CheckSignalPanel({ teamFeed = [], user, memberProfile = null, userSubteam = '', onAddComment, onReplyComment, onDeleteComment, onApproveReview }) {
  // 결재 권한 — 관리자(role) / 관리자(MANAGER_EMAILS) / 팀장 / 본부장
  const canApproveReview = !!(
    memberProfile?.role === 'manager' ||
    isManagerUser(user) ||
    memberProfile?.title === '팀장' ||
    memberProfile?.title === '본부장'
  )
  const [activeSignal, setActiveSignal] = useState('doing')
  const [searchTerm, setSearchTerm] = useState('')
  const [subteamTab, setSubteamTab] = useState('all')
  const STALE_THRESHOLD = 7

  // 본인 부서 우선 — 같은 부서면 위, 다른 부서는 뒤
  const subteamPriority = (sub) => sub === userSubteam ? 0 : 1

  // 모든 공유 task 평탄화
  const allTasks = useMemo(() => {
    return teamFeed.flatMap(member => (member.items || []).map(task => ({
      ...task,
      memberUid: member.uid,
      memberName: member.displayName || '이름 없음',
      memberPhotoURL: member.photoURL || '',
      subteam: member.subteam,
      subteamLabel: member.subteamLabel || getSubteamLabel(member.subteam),
    })))
  }, [teamFeed])

  // 지연: status='blocked' OR (doing/todo이면서 7일+ 무활동)
  const delayItems = useMemo(() => {
    const items = []
    allTasks.forEach(task => {
      if (task.status === 'done') return
      const lastActivity = task.updatedAt || task.createdAt
      const staleDays = lastActivity
        ? Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86400000)
        : 0
      const isBlocked = task.status === 'blocked'
      const isStale = staleDays >= STALE_THRESHOLD
      if (!isBlocked && !isStale) return
      items.push({
        ...task,
        _kind: isBlocked ? 'blocked' : 'stale',
        _days: staleDays,
      })
    })
    // 본인 부서 우선 → blocked 우선 → 일자 내림차순
    return items.sort((a, b) => {
      const subDiff = subteamPriority(a.subteam) - subteamPriority(b.subteam)
      if (subDiff !== 0) return subDiff
      if (a._kind === 'blocked' && b._kind !== 'blocked') return -1
      if (a._kind !== 'blocked' && b._kind === 'blocked') return 1
      return b._days - a._days
    })
  }, [allTasks, userSubteam])

  // 결재 대기: status='review' — 본인 부서 우선
  const reviewItems = useMemo(() => {
    return allTasks
      .filter(t => t.status === 'review')
      .map(t => {
        const lastActivity = t.updatedAt || t.createdAt
        const ageHours = lastActivity
          ? Math.floor((Date.now() - new Date(lastActivity).getTime()) / 3600000)
          : 0
        return { ...t, _ageHours: ageHours }
      })
      .sort((a, b) => {
        const subDiff = subteamPriority(a.subteam) - subteamPriority(b.subteam)
        if (subDiff !== 0) return subDiff
        return b._ageHours - a._ageHours
      })
  }, [allTasks, userSubteam])

  // 진행중: status='doing' — 정상 흐름. 지연/결재 대상이 아닌 doing만 (지연 항목과 중복 방지)
  const doingItems = useMemo(() => {
    const delayIdSet = new Set(delayItems.map(t => `${t.memberUid}-${t.id}`))
    return allTasks
      .filter(t => t.status === 'doing' && !delayIdSet.has(`${t.memberUid}-${t.id}`))
      .map(t => {
        const lastActivity = t.updatedAt || t.createdAt
        const ageDays = lastActivity
          ? Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86400000)
          : 0
        return { ...t, _ageDays: ageDays }
      })
      .sort((a, b) => {
        const subDiff = subteamPriority(a.subteam) - subteamPriority(b.subteam)
        if (subDiff !== 0) return subDiff
        // 마감 임박 우선
        const aDue = daysUntil(a.dueDate)
        const bDue = daysUntil(b.dueDate)
        const aRank = aDue === null ? 999 : aDue
        const bRank = bDue === null ? 999 : bDue
        return aRank - bRank
      })
  }, [allTasks, delayItems, userSubteam])

  // 완료: status='done' — 이번 주 완료된 task (teamFeed 자체가 이번 주차 데이터라 자동으로 이번 주 기준)
  const doneItems = useMemo(() => {
    return allTasks
      .filter(t => t.status === 'done')
      .map(t => {
        const completedAt = t.completedAt || t.updatedAt
        const completedMs = completedAt ? new Date(completedAt).getTime() : 0
        return { ...t, _completedMs: completedMs }
      })
      .sort((a, b) => {
        const subDiff = subteamPriority(a.subteam) - subteamPriority(b.subteam)
        if (subDiff !== 0) return subDiff
        // 최근 완료 우선
        return b._completedMs - a._completedMs
      })
  }, [allTasks, userSubteam])

  const totalCount = doingItems.length + delayItems.length + reviewItems.length + doneItems.length
  const subtitleSummary = `진행 ${doingItems.length} · 지연 ${delayItems.length} · 검토 요청 ${reviewItems.length} · 완료 ${doneItems.length}`

  const allActiveItems = activeSignal === 'doing'
    ? doingItems
    : activeSignal === 'delay'
      ? delayItems
      : activeSignal === 'review'
        ? reviewItems
        : doneItems

  // 부서 목록 추출 (모든 카테고리 합쳐서)
  const subteamsInSignal = useMemo(() => {
    const set = new Map()
    ;[...doingItems, ...delayItems, ...reviewItems, ...doneItems].forEach(t => {
      if (t.subteam) set.set(t.subteam, t.subteamLabel || getSubteamLabel(t.subteam))
    })
    return Array.from(set.entries()).map(([id, label]) => ({ id, label }))
  }, [doingItems, delayItems, reviewItems, doneItems])

  const trimmedSearch = searchTerm.trim().toLowerCase()
  const items = allActiveItems.filter(item => {
    if (subteamTab !== 'all' && item.subteam !== subteamTab) return false
    // 검색 — 부분 일치 + 초성 일치 (예: "ㅈㄹ" → "전략파트너" 매칭)
    if (trimmedSearch) {
      const haystack = `${item.title} ${item.memberName || ''} ${item.subteamLabel || ''} ${item.kpi || item.impact || ''}`.toLowerCase()
      if (!searchMatch(haystack, trimmedSearch)) return false
    }
    return true
  })

  return (
    <Panel title="🚦 점검 신호" icon={AlertTriangle} action={
      <span className="check-signal-summary">{subtitleSummary}</span>
    }>
      {/* 검색바 */}
      <div className="inbox-search-wrap">
        <input
          type="search"
          className="inbox-search"
          placeholder="검색 (업무명·담당자·부서·KPI · 초성 ㄱㄴㄷ도 OK)"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
        {searchTerm && (
          <button type="button" className="icon-button subtle inbox-search-clear" onClick={() => setSearchTerm('')} title="검색 지우기">
            <X size={13} />
          </button>
        )}
      </div>

      <div className="check-signal-tabs">
        <button
          type="button"
          className={`check-signal-tab doing ${activeSignal === 'doing' ? 'active' : ''}`}
          onClick={() => setActiveSignal('doing')}
        >
          🔵 진행 중 <span className="count">{doingItems.length}</span>
        </button>
        <button
          type="button"
          className={`check-signal-tab ${activeSignal === 'delay' ? 'active' : ''}`}
          onClick={() => setActiveSignal('delay')}
        >
          ⚠️ 지연 <span className="count">{delayItems.length}</span>
        </button>
        <button
          type="button"
          className={`check-signal-tab ${activeSignal === 'review' ? 'active' : ''}`}
          onClick={() => setActiveSignal('review')}
          title="task 상태를 '검토 요청'으로 표시한 항목 — 팀장/동료에게 검토 요청한 업무"
        >
          🟡 검토 요청 <span className="count">{reviewItems.length}</span>
        </button>
        <button
          type="button"
          className={`check-signal-tab done ${activeSignal === 'done' ? 'active' : ''}`}
          onClick={() => setActiveSignal('done')}
        >
          ✅ 완료 (이번 주) <span className="count">{doneItems.length}</span>
        </button>
      </div>

      {/* 부서 탭 */}
      {subteamsInSignal.length > 1 && (
        <div className="inbox-subteam-tabs">
          <button
            type="button"
            className={`inbox-subteam-tab ${subteamTab === 'all' ? 'active' : ''}`}
            onClick={() => setSubteamTab('all')}
          >
            전체 부서
          </button>
          {subteamsInSignal.map(s => (
            <button
              key={s.id}
              type="button"
              className={`inbox-subteam-tab ${subteamTab === s.id ? 'active' : ''}`}
              onClick={() => setSubteamTab(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      <div className="check-signal-content">
        {items.length === 0 ? (
          <EmptyText text={
            activeSignal === 'doing'
              ? '현재 정상 진행 중인 공유 업무가 없습니다.'
              : activeSignal === 'delay'
                ? '지연된 업무가 없습니다. 모두 정상 진행 중!'
                : activeSignal === 'review'
                  ? '검토 요청한 업무가 없습니다.'
                  : '이번 주 완료된 업무가 없습니다.'} />
        ) : (
          <div className="check-signal-list">
            {items.map(item => {
              const signalKind = activeSignal === 'doing'
                ? 'doing'
                : activeSignal === 'delay'
                  ? item._kind
                  : activeSignal === 'review'
                    ? 'review'
                    : 'done'
              const signalMeta = activeSignal === 'doing'
                ? (() => {
                    const due = daysUntil(item.dueDate)
                    if (due === null) return `진행 중 · ${item._ageDays}일째`
                    if (due < 0) return `진행 중 · 마감 ${Math.abs(due)}일 지남`
                    if (due === 0) return '진행 중 · 마감 오늘'
                    return `진행 중 · D-${due}`
                  })()
                : activeSignal === 'done'
                  ? (item._completedMs
                      ? `완료 · ${formatDate(new Date(item._completedMs).toISOString())}`
                      : '완료')
                : activeSignal === 'delay'
                  ? `${item._kind === 'blocked' ? '막힘' : '무활동'} · ${item._days}일째`
                  : `${item._ageHours < 24 ? `${item._ageHours}시간` : `${Math.floor(item._ageHours / 24)}일`} 대기`
              return (
                <TaskSignal
                  key={`${item.memberUid}-${item.id}`}
                  task={item}
                  user={user}
                  onAddComment={text => onAddComment(item, text)}
                  onReplyComment={(commentId, text) => onReplyComment(item, commentId, text)}
                  onDeleteComment={commentId => onDeleteComment(item, commentId)}
                  onApproveReview={canApproveReview && onApproveReview ? () => onApproveReview(item) : null}
                  signalKind={signalKind}
                  signalMeta={signalMeta}
                />
              )
            })}
          </div>
        )}
      </div>
    </Panel>
  )
}

// 본부장이 단 코멘트의 답변 모니터링 — 답변 없는 N일+ 빨간 표시, 답변 없는 게 위
function ManagerCommentInbox({ teamFeed = [], currentUid, onReplyComment, weekKey }) {
  const NO_REPLY_THRESHOLD = 3 // 3일 이상 답변 없으면 빨간 표시
  const [expandedIds, setExpandedIds] = useState(() => new Set())
  const [filterMode, setFilterMode] = useState('pending') // 'pending' | 'replied' | 'all'
  const [searchTerm, setSearchTerm] = useState('')
  const [subteamTab, setSubteamTab] = useState('all')
  const [replyDrafts, setReplyDrafts] = useState({}) // { commentId: text }
  const [replySubmitting, setReplySubmitting] = useState({}) // { commentId: bool }

  // 사용자별 "수동 완료 처리" 추적 (localStorage) — 완료 시점도 함께 저장
  // 데이터 구조: { [commentId]: ISO_timestamp }
  const STORAGE_KEY = `inbox-resolved-${currentUid || 'guest'}`
  const [resolvedMap, setResolvedMap] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return {}
      const parsed = JSON.parse(raw)
      // 구버전(배열) 호환 처리 → 객체 마이그레이션
      if (Array.isArray(parsed)) {
        const obj = {}
        parsed.forEach(id => { obj[id] = null }) // 시점 정보 없음
        return obj
      }
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch { return {} }
  })
  const resolvedSet = useMemo(() => new Set(Object.keys(resolvedMap)), [resolvedMap])

  function toggleResolved(commentId) {
    setResolvedMap(prev => {
      const next = { ...prev }
      if (next[commentId] !== undefined) {
        delete next[commentId]
      } else {
        next[commentId] = new Date().toISOString()
      }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  async function handleSubmitReply(item) {
    const draft = (replyDrafts[item.commentId] || '').trim()
    if (!draft || !onReplyComment) return
    setReplySubmitting(prev => ({ ...prev, [item.commentId]: true }))
    try {
      const taskRef = {
        id: item.taskId,
        memberUid: item.memberUid,
      }
      await onReplyComment(taskRef, item.commentId, draft)
      setReplyDrafts(prev => ({ ...prev, [item.commentId]: '' }))
    } catch (err) {
      window.alert(`답변 저장 실패: ${err.message || '알 수 없는 오류'}`)
    } finally {
      setReplySubmitting(prev => ({ ...prev, [item.commentId]: false }))
    }
  }

  function toggleExpand(commentId) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(commentId)) next.delete(commentId)
      else next.add(commentId)
      return next
    })
  }

  const inbox = useMemo(() => {
    const items = []
    teamFeed.forEach(member => {
      ;(member.items || []).forEach(task => {
        ;(task.comments || []).forEach(comment => {
          if (comment.authorUid !== currentUid) return
          const replies = comment.replies || []
          const repliesCount = replies.length
          const ageDays = comment.createdAt ? Math.floor((Date.now() - new Date(comment.createdAt).getTime()) / 86400000) : 0
          const lastReply = repliesCount > 0 ? replies[repliesCount - 1] : null
          items.push({
            taskId: task.id,
            taskTitle: task.title,
            memberUid: member.uid,
            memberName: member.displayName || '이름 없음',
            subteam: member.subteam,
            subteamLabel: member.subteamLabel || getSubteamLabel(member.subteam),
            commentId: comment.id,
            commentText: comment.text,
            commentCreatedAt: comment.createdAt,
            ageDays,
            repliesCount,
            replies,
            lastReplyDate: lastReply?.createdAt,
          })
        })
      })
    })
    // 답변 없는 것 먼저, 그중에서도 오래된 것 위
    return items.sort((a, b) => {
      if (a.repliesCount === 0 && b.repliesCount > 0) return -1
      if (a.repliesCount > 0 && b.repliesCount === 0) return 1
      return b.ageDays - a.ageDays
    })
  }, [teamFeed, currentUid])

  // pending = 수동 완료 안 한 것 (답변 여부 무관 — 직접 완료 처리해야 done으로 이동)
  // replied = 수동 완료한 것
  const pendingCount = inbox.filter(i => !resolvedSet.has(i.commentId)).length
  const resolvedCount = inbox.filter(i => resolvedSet.has(i.commentId)).length
  const stuckCount = inbox.filter(i => !resolvedSet.has(i.commentId) && i.repliesCount === 0 && i.ageDays >= NO_REPLY_THRESHOLD).length

  // 부서 목록 추출 (탭에 사용)
  const subteamsInInbox = useMemo(() => {
    const set = new Map()
    inbox.forEach(i => {
      if (i.subteam) set.set(i.subteam, i.subteamLabel)
    })
    return Array.from(set.entries()).map(([id, label]) => ({ id, label }))
  }, [inbox])

  const trimmedSearch = searchTerm.trim().toLowerCase()
  const visibleInbox = inbox.filter(item => {
    const isResolved = resolvedSet.has(item.commentId)
    // 답변 상태 필터 — 수동 완료 처리 기준
    if (filterMode === 'pending' && isResolved) return false
    if (filterMode === 'replied' && !isResolved) return false
    // 부서 필터
    if (subteamTab !== 'all' && item.subteam !== subteamTab) return false
    // 검색 — 부분 일치 + 초성 일치 (예: "ㅈㄹ" → "전략파트너" 매칭)
    if (trimmedSearch) {
      const haystack = `${item.taskTitle} ${item.memberName} ${item.commentText} ${item.subteamLabel}`.toLowerCase()
      if (!searchMatch(haystack, trimmedSearch)) return false
    }
    return true
  })

  return (
    <Panel title="📥 코멘트 답변 인박스" icon={MessageSquareText} action={
      <div className="comment-inbox-summary">
        {stuckCount > 0 && <span className="stuck-badge">{stuckCount}건 미응답 {NO_REPLY_THRESHOLD}일+</span>}
        <span>총 {inbox.length}건 · 처리 대기 {pendingCount}건</span>
      </div>
    }>
      {/* 검색바 */}
      <div className="inbox-search-wrap">
        <input
          type="search"
          className="inbox-search"
          placeholder="검색 (업무명·담당자·코멘트·부서 · 초성 ㄱㄴㄷ도 OK)"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
        {searchTerm && (
          <button type="button" className="icon-button subtle inbox-search-clear" onClick={() => setSearchTerm('')} title="검색 지우기">
            <X size={13} />
          </button>
        )}
      </div>

      {/* 답변 상태 탭 — 직접 [완료] 버튼 누른 항목만 완료로 이동 */}
      <div className="comment-inbox-tabs">
        <button
          type="button"
          className={`comment-inbox-tab ${filterMode === 'pending' ? 'active' : ''}`}
          onClick={() => setFilterMode('pending')}
        >
          처리 대기 <span className="cnt">{pendingCount}</span>
        </button>
        <button
          type="button"
          className={`comment-inbox-tab replied ${filterMode === 'replied' ? 'active' : ''}`}
          onClick={() => setFilterMode('replied')}
        >
          처리 완료 (저장함) <span className="cnt">{resolvedCount}</span>
        </button>
        <button
          type="button"
          className={`comment-inbox-tab ${filterMode === 'all' ? 'active' : ''}`}
          onClick={() => setFilterMode('all')}
        >
          전체 <span className="cnt">{inbox.length}</span>
        </button>
      </div>

      {/* 부서 탭 */}
      {subteamsInInbox.length > 1 && (
        <div className="inbox-subteam-tabs">
          <button
            type="button"
            className={`inbox-subteam-tab ${subteamTab === 'all' ? 'active' : ''}`}
            onClick={() => setSubteamTab('all')}
          >
            전체 부서
          </button>
          {subteamsInInbox.map(s => (
            <button
              key={s.id}
              type="button"
              className={`inbox-subteam-tab ${subteamTab === s.id ? 'active' : ''}`}
              onClick={() => setSubteamTab(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {visibleInbox.length === 0 ? (
        <EmptyText text={
          filterMode === 'pending'
            ? '답변 대기 중인 코멘트가 없습니다.'
            : filterMode === 'replied'
              ? '답변 완료된 코멘트가 아직 없습니다.'
              : '아직 단 코멘트가 없습니다. 팀원 task에 코멘트를 남기면 여기에 모입니다.'
        } />
      ) : (
        <div className="comment-inbox-list">
          {visibleInbox.slice(0, 20).map(item => {
            const isResolved = resolvedSet.has(item.commentId)
            const isStuck = !isResolved && item.repliesCount === 0 && item.ageDays >= NO_REPLY_THRESHOLD
            const isExpanded = expandedIds.has(item.commentId)
            const replyDraft = replyDrafts[item.commentId] || ''
            const isSubmitting = !!replySubmitting[item.commentId]
            const canExpand = !!onReplyComment || item.repliesCount > 0
            return (
              <article
                key={`${item.taskId}-${item.commentId}`}
                className={`comment-inbox-item ${isStuck ? 'stuck' : ''} ${item.repliesCount === 0 ? 'no-reply' : 'has-reply'} ${canExpand ? 'expandable' : ''} ${isExpanded ? 'expanded' : ''} ${isResolved ? 'is-resolved' : ''}`}
                onClick={canExpand ? () => toggleExpand(item.commentId) : undefined}
                role={canExpand ? 'button' : undefined}
                tabIndex={canExpand ? 0 : undefined}
                onKeyDown={canExpand ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(item.commentId) } }) : undefined}
              >
                <div className="comment-inbox-head">
                  <Badge tone="teal">{item.taskTitle}</Badge>
                  <span className="member-tag">{item.memberName} · {item.subteamLabel}</span>
                  {isStuck ? (
                    <span className="reply-status stuck">⚠ {item.ageDays}일 미응답 {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}</span>
                  ) : item.repliesCount === 0 ? (
                    <span className="reply-status pending">{item.ageDays}일 전 · 답변 대기 {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}</span>
                  ) : (
                    <span className="reply-status replied">
                      답변 {item.repliesCount}건 {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                    </span>
                  )}
                </div>
                <p className="comment-inbox-text">{item.commentText}</p>

                {/* 수동 완료 버튼 — 답변대기 줄 바로 아래, 사용자가 직접 클릭해야 처리 완료로 이동 */}
                <div className="comment-inbox-resolve-row" onClick={e => e.stopPropagation()}>
                  <button
                    type="button"
                    className={`comment-inbox-resolve-btn ${isResolved ? 'resolved' : ''}`}
                    onClick={() => toggleResolved(item.commentId)}
                    title={isResolved ? '완료 해제 → 처리 대기로 되돌림' : '처리 완료로 표시 → 저장함으로 이동'}
                  >
                    {isResolved ? (
                      <>
                        <Check size={12} /> 처리 완료됨 (클릭하여 해제)
                      </>
                    ) : (
                      <>
                        <Check size={12} /> 처리 완료로 표시
                      </>
                    )}
                  </button>
                </div>

                {/* 펼친 영역 — 활동 타임라인 + 답변 목록 + 답변 작성 form */}
                {isExpanded && (
                  <div className="comment-inbox-expanded-body" onClick={e => e.stopPropagation()}>
                    {/* === 활동 타임라인 (날짜 로그) === */}
                    {(() => {
                      const events = []
                      if (item.commentCreatedAt) {
                        events.push({
                          type: 'comment',
                          ts: item.commentCreatedAt,
                          text: `본부장(${currentUid ? '본인' : '?'}) 코멘트 작성`,
                        })
                      }
                      item.replies.forEach((r, idx) => {
                        events.push({
                          type: 'reply',
                          ts: r.createdAt,
                          text: `${r.authorName || '담당자'} 답변 #${idx + 1}`,
                        })
                      })
                      const resolvedAt = resolvedMap[item.commentId]
                      if (resolvedAt) {
                        events.push({
                          type: 'resolved',
                          ts: resolvedAt,
                          text: '처리 완료로 표시',
                        })
                      }
                      events.sort((a, b) => (a.ts || '').localeCompare(b.ts || ''))

                      if (events.length === 0) return null
                      return (
                        <div className="inbox-activity-log">
                          <div className="inbox-activity-log-head">
                            <Clock size={11} />
                            <strong>활동 기록 ({events.length}건)</strong>
                          </div>
                          <ol className="inbox-activity-list">
                            {events.map((ev, i) => (
                              <li key={i} className={`inbox-activity-item type-${ev.type}`}>
                                <span className="dot" />
                                <span className="ts">
                                  {ev.ts
                                    ? `${formatDate(ev.ts)} ${new Date(ev.ts).getHours()}:${String(new Date(ev.ts).getMinutes()).padStart(2, '0')}`
                                    : '시간 미상'}
                                </span>
                                <span className="text">{ev.text}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )
                    })()}

                    {item.replies.length > 0 && (
                      <div className="comment-inbox-replies">
                        {item.replies.map((reply, idx) => (
                          <div key={reply.id || idx} className="comment-inbox-reply">
                            <div className="reply-head">
                              <strong>{reply.authorName || '이름 없음'}</strong>
                              <small>
                                {reply.createdAt
                                  ? `${formatDate(reply.createdAt)} ${new Date(reply.createdAt).getHours()}:${String(new Date(reply.createdAt).getMinutes()).padStart(2, '0')}`
                                  : ''}
                              </small>
                            </div>
                            <p className="reply-text">{reply.text}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 추가 답변 작성 form */}
                    {onReplyComment && (
                      <form
                        className="comment-inbox-reply-form"
                        onSubmit={e => { e.preventDefault(); handleSubmitReply(item) }}
                      >
                        <input
                          type="text"
                          placeholder={item.repliesCount === 0
                            ? '이 코멘트에 답변/추가 코멘트 남기기'
                            : '추가 답변 / 보충 코멘트 남기기'}
                          value={replyDraft}
                          onChange={e => setReplyDrafts(prev => ({ ...prev, [item.commentId]: e.target.value }))}
                        />
                        <button
                          type="submit"
                          className="secondary-action mini"
                          disabled={isSubmitting || !replyDraft.trim()}
                        >
                          <Send size={13} />
                          {isSubmitting ? '저장 중' : '답변'}
                        </button>
                      </form>
                    )}
                  </div>
                )}

                {!isExpanded && canExpand && (
                  <div className="comment-inbox-expand-hint">
                    {item.repliesCount > 0
                      ? `클릭하여 답변 ${item.repliesCount}건 펼쳐보기 + 추가 답변 →`
                      : '클릭하여 답변/추가 코멘트 작성 →'}
                  </div>
                )}
              </article>
            )
          })}
          {visibleInbox.length > 20 && (
            <div className="comment-inbox-more">+ {visibleInbox.length - 20}건 더 (스크롤하여 모두 보기 — 추후 검색/페이징)</div>
          )}
        </div>
      )}
    </Panel>
  )
}

// 부서별 워크로드 통계 — 활성/완료/지연 비율 자동 집계 + 클릭 시 task 목록 펼침
function TeamWorkloadPanel({ teamFeed = [], userSubteam = '' }) {
  const STALE_THRESHOLD = 7 // 7일+ 무활동이면 지연으로 간주
  // expanded[subteamId] = 'active' | 'done' | 'delayed' | null
  const [expanded, setExpanded] = useState({})
  // 완료 기간 필터 — 'day' | 'week' | 'month'. 활성/지연은 영향 없음 (현재 상태 기준)
  const [donePeriod, setDonePeriod] = useState('week')

  // 기간별 시작 시각 (타임스탬프 ms)
  const periodStartMs = useMemo(() => {
    const now = new Date()
    if (donePeriod === 'day') {
      return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    }
    if (donePeriod === 'month') {
      return new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    }
    // week — 월요일 시작 (한국 기준)
    const day = now.getDay() // 0=Sun, 1=Mon ...
    const diffToMon = (day + 6) % 7 // Mon=0, Tue=1, ... Sun=6
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMon).getTime()
  }, [donePeriod])

  function isDoneInPeriod(task) {
    if (task.status !== 'done') return false
    const ts = task.completedAt || task.updatedAt
    if (!ts) return false
    const ms = new Date(ts).getTime()
    return Number.isFinite(ms) && ms >= periodStartMs
  }

  function toggleExpand(subteamId, kind) {
    setExpanded(prev => {
      const next = { ...prev }
      if (next[subteamId] === kind) delete next[subteamId]
      else next[subteamId] = kind
      return next
    })
  }

  const stats = useMemo(() => {
    const subteamStats = {}
    SUBTEAMS.forEach(team => {
      subteamStats[team.id] = {
        id: team.id,
        label: team.label,
        members: 0,
        active: 0,
        done: 0,
        delayed: 0,
        avgCompletionDays: null,
        completionDaysSum: 0,
        completionDaysCount: 0,
        isMine: team.id === userSubteam,
        // 클릭 펼침용 — 카테고리별 task 목록 (정렬 후 저장)
        activeTasks: [],
        doneTasks: [],
        delayedTasks: [],
        // B3: 멤버별 활성 부하 — { uid → { name, count } }
        memberLoadMap: new Map(),
        // D2: 활성 KPI 분포 — { label → count }
        kpiCountMap: new Map(),
      }
    })

    teamFeed.forEach(member => {
      const sub = member.subteam
      if (!sub || !subteamStats[sub]) return
      subteamStats[sub].members += 1
      const memberMeta = {
        memberUid: member.uid,
        memberName: member.displayName || '이름 없음',
      }

      ;(member.items || []).forEach(task => {
        const enriched = { ...task, ...memberMeta }
        if (task.status === 'done') {
          // 완료는 선택된 기간(일/주/월) 안에 들어온 것만 카운트
          if (isDoneInPeriod(task)) {
            subteamStats[sub].done += 1
            subteamStats[sub].doneTasks.push(enriched)
            // 완료까지 걸린 일수 (createdAt → completedAt)
            if (task.createdAt && task.completedAt) {
              const days = (new Date(task.completedAt).getTime() - new Date(task.createdAt).getTime()) / 86400000
              if (days >= 0) {
                subteamStats[sub].completionDaysSum += days
                subteamStats[sub].completionDaysCount += 1
              }
            }
          }
        } else {
          subteamStats[sub].active += 1
          subteamStats[sub].activeTasks.push(enriched)
          // B3: 멤버별 활성 부하 누적
          const mLoad = subteamStats[sub].memberLoadMap.get(member.uid) || { uid: member.uid, name: memberMeta.memberName, count: 0 }
          mLoad.count += 1
          subteamStats[sub].memberLoadMap.set(member.uid, mLoad)
          // D2: 활성 KPI 분포 누적 (라벨 없는 task는 '미분류'로)
          const kpiLabel = (task.kpi || task.impact || '').trim() || '미분류'
          subteamStats[sub].kpiCountMap.set(kpiLabel, (subteamStats[sub].kpiCountMap.get(kpiLabel) || 0) + 1)
          // 지연 판정: blocked OR (createdAt 또는 updatedAt 이후 7일+)
          const lastActivity = task.updatedAt || task.createdAt
          const staleDays = lastActivity ? Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86400000) : 0
          if (task.status === 'blocked' || staleDays >= STALE_THRESHOLD) {
            subteamStats[sub].delayed += 1
            subteamStats[sub].delayedTasks.push({ ...enriched, _delayKind: task.status === 'blocked' ? 'blocked' : 'stale', _delayDays: staleDays })
          }
        }
      })
    })

    // 펼침 리스트 정렬: 활성/지연은 마감 임박 순, 완료는 최근 완료 순
    Object.values(subteamStats).forEach(s => {
      s.activeTasks.sort((a, b) => {
        const aDue = daysUntil(a.dueDate)
        const bDue = daysUntil(b.dueDate)
        return (aDue === null ? 9999 : aDue) - (bDue === null ? 9999 : bDue)
      })
      s.delayedTasks.sort((a, b) => (b._delayDays || 0) - (a._delayDays || 0))
      s.doneTasks.sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''))

      // B3: memberLoadMap → 부하 많은 순 배열
      s.memberLoads = Array.from(s.memberLoadMap.values()).sort((a, b) => b.count - a.count)
      s.maxMemberLoad = s.memberLoads[0]?.count || 0
      delete s.memberLoadMap

      // D2: kpiCountMap → 비율 + 정렬 + 상위 3 + 기타 합산
      const kpiEntries = Array.from(s.kpiCountMap.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
      const totalKpiTasks = kpiEntries.reduce((sum, k) => sum + k.count, 0)
      const top3 = kpiEntries.slice(0, 3)
      const others = kpiEntries.slice(3)
      const othersSum = others.reduce((sum, k) => sum + k.count, 0)
      const kpiBreakdown = top3.map(k => ({
        label: k.label,
        count: k.count,
        pct: totalKpiTasks > 0 ? Math.round((k.count / totalKpiTasks) * 100) : 0,
      }))
      if (othersSum > 0) {
        kpiBreakdown.push({
          label: `기타 ${others.length}개`,
          count: othersSum,
          pct: totalKpiTasks > 0 ? Math.round((othersSum / totalKpiTasks) * 100) : 0,
          isOther: true,
        })
      }
      s.kpiBreakdown = kpiBreakdown
      s.kpiTotal = totalKpiTasks
      delete s.kpiCountMap
    })

    // 평균 완료일 계산
    Object.values(subteamStats).forEach(s => {
      if (s.completionDaysCount > 0) {
        s.avgCompletionDays = Math.round(s.completionDaysSum / s.completionDaysCount * 10) / 10
      }
    })

    return Object.values(subteamStats)
  }, [teamFeed, userSubteam, periodStartMs])

  // 기본 순서: 본인 부서 → SUBTEAMS 순. 사용자가 ↑↓로 변경 가능, localStorage 저장
  const defaultOrder = useMemo(() => {
    return [
      ...(userSubteam ? [userSubteam] : []),
      ...SUBTEAMS.map(t => t.id).filter(id => id !== userSubteam),
    ]
  }, [userSubteam])
  const [order, moveOrder] = useOrderPref('workload-subteams', defaultOrder)
  const orderedStats = useMemo(() => {
    const map = new Map(stats.map(s => [s.id, s]))
    return order.map(id => map.get(id)).filter(Boolean)
  }, [stats, order])

  const total = stats.reduce((acc, s) => ({
    active: acc.active + s.active,
    done: acc.done + s.done,
    delayed: acc.delayed + s.delayed,
    members: acc.members + s.members,
  }), { active: 0, done: 0, delayed: 0, members: 0 })

  const periodLabel = donePeriod === 'day' ? '오늘' : donePeriod === 'month' ? '이번 달' : '이번 주'

  return (
    <Panel title="📊 부서별 워크로드" icon={BarChart3} action={
      <span className="workload-summary">
        전체 {total.active + total.done}건 · 활성 {total.active} · 완료 {total.done} ({periodLabel}) · 지연 {total.delayed}
      </span>
    }>
      <div className="workload-period-toggle" role="group" aria-label="완료 기간 필터">
        <span className="workload-period-label">완료 기간</span>
        <button
          type="button"
          className={`period-btn ${donePeriod === 'day' ? 'active' : ''}`}
          onClick={() => setDonePeriod('day')}
          title="오늘 완료된 task만"
        >일</button>
        <button
          type="button"
          className={`period-btn ${donePeriod === 'week' ? 'active' : ''}`}
          onClick={() => setDonePeriod('week')}
          title="이번 주(월요일~) 완료"
        >주</button>
        <button
          type="button"
          className={`period-btn ${donePeriod === 'month' ? 'active' : ''}`}
          onClick={() => setDonePeriod('month')}
          title="이번 달(1일~) 완료"
        >월</button>
        <span className="workload-period-hint">활성·지연은 현재 상태 기준으로 변하지 않음</span>
      </div>
      <div className="workload-grid">
        {orderedStats.map((s, idx) => {
          const totalCount = s.active + s.done
          const delayRate = s.active > 0 ? Math.round((s.delayed / s.active) * 100) : 0
          const completionRate = totalCount > 0 ? Math.round((s.done / totalCount) * 100) : 0
          const overload = s.delayed >= 3 || delayRate >= 40 // 부서 과부하 기준
          return (
            <article key={s.id} className={`workload-card subteam-${s.id} ${overload ? 'overload' : ''} ${s.isMine ? 'mine' : ''}`}>
              <header>
                <span className={`team-tag subteam-${s.id}`}>
                  {s.label}
                  {s.isMine && <small style={{ marginLeft: 6, fontSize: 10, opacity: 0.8 }}>(내 부서)</small>}
                </span>
                <div className="card-order-controls">
                  <button type="button" className="order-btn" onClick={() => moveOrder(s.id, 'up')} disabled={idx === 0} title="왼쪽으로">←</button>
                  <button type="button" className="order-btn" onClick={() => moveOrder(s.id, 'down')} disabled={idx === orderedStats.length - 1} title="오른쪽으로">→</button>
                  <span className="member-count">{s.members}명</span>
                </div>
              </header>
              <div className="workload-metrics">
                <button
                  type="button"
                  className={`metric-row clickable ${expanded[s.id] === 'active' ? 'open' : ''}`}
                  onClick={() => toggleExpand(s.id, 'active')}
                  disabled={s.active === 0}
                  title={s.active === 0 ? '활성 업무 없음' : '클릭하면 활성 업무 목록 펼침'}
                >
                  <span className="metric-label">활성</span>
                  <strong>{s.active}<small>건</small></strong>
                  {s.active > 0 && <ChevronDown size={11} className="metric-chev" />}
                </button>
                <button
                  type="button"
                  className={`metric-row done clickable ${expanded[s.id] === 'done' ? 'open' : ''}`}
                  onClick={() => toggleExpand(s.id, 'done')}
                  disabled={s.done === 0}
                  title={s.done === 0 ? `${periodLabel} 완료된 업무 없음` : `클릭하면 ${periodLabel} 완료 업무 목록 펼침`}
                >
                  <span className="metric-label">완료 <small style={{opacity:0.7, fontWeight:600}}>({periodLabel})</small></span>
                  <strong>{s.done}<small>건</small></strong>
                  {s.done > 0 && <ChevronDown size={11} className="metric-chev" />}
                </button>
                <button
                  type="button"
                  className={`metric-row delayed clickable ${expanded[s.id] === 'delayed' ? 'open' : ''}`}
                  onClick={() => toggleExpand(s.id, 'delayed')}
                  disabled={s.delayed === 0}
                  title={s.delayed === 0 ? '지연 업무 없음' : '클릭하면 지연 업무 목록 펼침'}
                >
                  <span className="metric-label">지연</span>
                  <strong>{s.delayed}<small>건 ({delayRate}%)</small></strong>
                  {s.delayed > 0 && <ChevronDown size={11} className="metric-chev" />}
                </button>
              </div>
              <div className="workload-progress">
                <div className="progress-track">
                  <span style={{ width: `${completionRate}%` }} />
                </div>
                <small>완료율 {completionRate}%</small>
              </div>
              {s.avgCompletionDays !== null && (
                <div className="workload-avg">
                  평균 완료 <strong>{s.avgCompletionDays}일</strong>
                </div>
              )}
              {overload && (
                <div className="overload-warning">
                  ⚠ 과부하 의심 — 지연 {s.delayed}건 ({delayRate}%)
                </div>
              )}
              {/* B3: 팀원별 부하 게이지 — 활성 task가 있을 때만 */}
              {s.memberLoads.length > 0 && (
                <div className="member-load-block">
                  <div className="member-load-title">👥 팀원 부하 (활성 기준)</div>
                  {s.memberLoads.map(m => {
                    const ratio = s.maxMemberLoad > 0 ? m.count / s.maxMemberLoad : 0
                    const fillClass = m.count === s.maxMemberLoad && m.count >= 3
                      ? 'heavy'
                      : ratio >= 0.6
                        ? 'warn'
                        : 'normal'
                    return (
                      <div key={m.uid} className="member-load-row" title={`${m.name} — 활성 ${m.count}건`}>
                        <span className="member-load-name">{m.name}</span>
                        <div className="member-load-track">
                          <div className={`member-load-fill ${fillClass}`} style={{ width: `${Math.max(ratio * 100, 6)}%` }} />
                        </div>
                        <span className={`member-load-count ${fillClass === 'heavy' ? 'heavy' : ''}`}>{m.count}</span>
                      </div>
                    )
                  })}
                </div>
              )}
              {/* D2: KPI 분포 — 가로 스택 막대 + 범례 */}
              {s.kpiBreakdown.length > 0 && (
                <div className="kpi-dist-block">
                  <div className="kpi-dist-title">
                    🎯 KPI 분포
                    {s.kpiBreakdown[0]?.pct >= 60 && (
                      <span className="kpi-dist-warn" title="한 KPI에 60% 이상 쏠림">⚠ 쏠림 {s.kpiBreakdown[0].pct}%</span>
                    )}
                  </div>
                  <div className="kpi-dist-bar">
                    {s.kpiBreakdown.map((k, i) => (
                      <span
                        key={k.label}
                        className={`kpi-dist-seg seg-${i}${k.isOther ? ' is-other' : ''}`}
                        style={{ width: `${k.pct}%` }}
                        title={`${k.label} ${k.count}건 (${k.pct}%)`}
                      />
                    ))}
                  </div>
                  <div className="kpi-dist-legend">
                    {s.kpiBreakdown.map((k, i) => (
                      <div key={k.label} className="kpi-dist-legend-row">
                        <i className={`seg-${i}${k.isOther ? ' is-other' : ''}`} />
                        <span className="kpi-dist-name" title={k.label}>{k.label}</span>
                        <span className="kpi-dist-pct">{k.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {expanded[s.id] && (
                <WorkloadTaskList
                  kind={expanded[s.id]}
                  tasks={
                    expanded[s.id] === 'active' ? s.activeTasks
                    : expanded[s.id] === 'done' ? s.doneTasks
                    : s.delayedTasks
                  }
                />
              )}
            </article>
          )
        })}
      </div>
    </Panel>
  )
}

// 워크로드 카드 — 활성/완료/지연 펼침 시 task 미니 리스트 (최대 30건 표시)
function WorkloadTaskList({ kind, tasks = [] }) {
  if (!tasks || tasks.length === 0) {
    return <div className="workload-tasklist empty">표시할 업무가 없습니다.</div>
  }
  const limit = 30
  const items = tasks.slice(0, limit)
  const remaining = tasks.length - limit
  return (
    <div className={`workload-tasklist kind-${kind}`}>
      {items.map(task => {
        const due = daysUntil(task.dueDate)
        const kpiLabel = (task.kpi || task.impact || '').trim()
        let dueText = ''
        let dueTone = ''
        if (kind === 'done') {
          dueText = task.completedAt ? `${formatDate(task.completedAt)} 완료` : '완료'
        } else if (kind === 'delayed') {
          dueText = task._delayKind === 'blocked' ? '막힘' : `${task._delayDays}일 무활동`
          dueTone = 'red'
        } else {
          if (due === null) dueText = '마감 미정'
          else if (due < 0) { dueText = `D+${Math.abs(due)} 지남`; dueTone = 'red' }
          else if (due === 0) { dueText = '오늘 마감'; dueTone = 'amber' }
          else if (due <= 3) { dueText = `D-${due}`; dueTone = 'amber' }
          else dueText = `D-${due}`
        }
        const statusMeta = STATUS_META[task.status] || { label: task.status, tone: 'gray' }
        return (
          <div key={`${task.memberUid}-${task.id}`} className={`workload-task-item tone-${statusMeta.tone}`}>
            <div className="workload-task-main">
              <span className="workload-task-title" title={task.title}>{task.title}</span>
              {kpiLabel && <span className="workload-task-kpi" title={`KPI: ${kpiLabel}`}>▣ {kpiLabel}</span>}
            </div>
            <div className="workload-task-meta">
              <span className="workload-task-owner">{task.memberName}</span>
              <span className={`workload-task-status tone-${statusMeta.tone}`}>{statusMeta.label}</span>
              <span className={`workload-task-due tone-${dueTone}`}>{dueText}</span>
            </div>
          </div>
        )
      })}
      {remaining > 0 && (
        <div className="workload-tasklist-more">+ {remaining}건 더 (최근/임박 30건만 표시)</div>
      )}
    </div>
  )
}

function KpiSection({ kpis, editable = false, teamFeed = [], actionItems = [], personalKpis = [], userSubteam = '' }) {
  const allMembers = useContext(MembersContext)
  // type: 'team' (전사 공통/부서별 팀 KPI) | 'personal' (특정 팀원 개인 KPI)
  const [draft, setDraft] = useState({ type: 'team', label: '', description: '', subteam: '', memberUid: '' })
  const [error, setError] = useState('')

  // 모든 팀 업무 + 진행 프로젝트(actionItems)를 한 풀로 모아서 KPI 라벨 매칭에 사용
  const allLinkableTasks = useMemo(() => {
    const teamTasks = teamFeed.flatMap(member => member.items || [])
    return [...teamTasks, ...actionItems]
  }, [teamFeed, actionItems])

  // 부서별로 그룹핑 (UI 표시용)
  const groupedKpis = useMemo(() => {
    const groups = {}
    kpis.forEach(kpi => {
      const key = kpi.subteam || 'all'
      if (!groups[key]) groups[key] = []
      groups[key].push(kpi)
    })
    return groups
  }, [kpis])

  async function handleCreate(event) {
    event.preventDefault()
    if (!editable) return
    if (!draft.label.trim()) {
      setError('KPI명을 먼저 입력하세요.')
      return
    }
    setError('')
    try {
      if (draft.type === 'personal') {
        if (!draft.memberUid) {
          setError('팀원을 먼저 선택하세요.')
          return
        }
        const targetMember = allMembers.find(m => m.uid === draft.memberUid)
        if (!targetMember) {
          setError('대상 팀원을 찾을 수 없습니다. 새로고침 후 다시 시도하세요.')
          return
        }
        await createPersonalKpi(DEFAULT_TEAM_ID, draft.memberUid, {
          id: generateId('pkpi'),
          sortOrder: Date.now(),
          label: draft.label.trim(),
          description: draft.description.trim(),
          owner: targetMember.displayName || targetMember.email || '이름 없음',
          ownerUid: draft.memberUid,
          color: 'amber',
        })
      } else {
        await createKpi(DEFAULT_TEAM_ID, {
          id: generateId('kpi'),
          sortOrder: Date.now(),
          label: draft.label.trim(),
          description: draft.description.trim(),
          subteam: draft.subteam || '',
          subteamLabel: draft.subteam ? getSubteamLabel(draft.subteam) : '전사 공통',
          current: 0,
          target: 100,
          unit: '%',
          owner: draft.subteam ? getSubteamLabel(draft.subteam) : '전사',
          color: 'teal',
        })
      }
      setDraft({ type: 'team', label: '', description: '', subteam: '', memberUid: '' })
    } catch (err) {
      setError(`KPI 추가 실패: ${err.message || '알 수 없는 오류'}\n  팀장 권한 + Firestore 규칙 배포 여부 확인.`)
    }
  }

  async function handleDeletePersonalKpi(memberUid, kpiId, label) {
    if (!editable) return
    const ok = window.confirm(`이 팀원의 "${label}" 개인 KPI를 삭제할까요?`)
    if (!ok) return
    try {
      await deletePersonalKpi(DEFAULT_TEAM_ID, memberUid, kpiId)
    } catch (err) {
      setError(`개인 KPI 삭제 실패: ${err.message}`)
    }
  }

  // 그룹 기본 순서 — 본인 부서 → 다른 부서 → 'all' (전사 공통). 사용자가 편집 가능
  const defaultGroupOrder = useMemo(() => {
    return [
      ...(userSubteam ? [userSubteam] : []),
      ...SUBTEAMS.map(t => t.id).filter(id => id !== userSubteam),
      'all',
    ]
  }, [userSubteam])
  const [groupOrder, moveTeamGroup] = useOrderPref('kpi-team-groups', defaultGroupOrder)

  // 팀원 개인 KPI 그룹 순서 (멤버 uid 기반)
  const personalMembersDefaultOrder = useMemo(() => {
    const set = new Set()
    personalKpis.forEach(k => {
      const uid = k._memberUid || k.ownerUid
      if (uid) set.add(uid)
    })
    return Array.from(set)
  }, [personalKpis])
  const [personalGroupOrder, movePersonalGroup] = useOrderPref('kpi-personal-groups', personalMembersDefaultOrder)

  return (
    <Panel title="KPI 바" icon={BarChart3}>
      {editable && (
        <form className="kpi-create-form compact" onSubmit={handleCreate}>
          <button
            className="secondary-action kpi-add-btn"
            type="submit"
            title="KPI 추가 (KPI명 + 타입별 옵션 입력 후 클릭)"
          >
            <Plus size={15} />
            추가
          </button>
          <select
            className="kpi-create-type"
            value={draft.type}
            onChange={event => setDraft({ ...draft, type: event.target.value, subteam: '', memberUid: '' })}
            title="팀 KPI vs 개인 KPI"
          >
            <option value="team">팀</option>
            <option value="personal">개인</option>
          </select>
          {draft.type === 'team' ? (
            <select
              className="kpi-create-subteam"
              value={draft.subteam}
              onChange={event => setDraft({ ...draft, subteam: event.target.value })}
              title="담당 부서"
            >
              <option value="">전사 공통</option>
              {SUBTEAMS.map(team => (
                <option key={team.id} value={team.id}>{team.label}</option>
              ))}
            </select>
          ) : (
            <select
              className="kpi-create-subteam"
              value={draft.memberUid}
              onChange={event => setDraft({ ...draft, memberUid: event.target.value })}
              title="대상 팀원"
            >
              <option value="">팀원 선택</option>
              {allMembers.map(m => (
                <option key={m.uid} value={m.uid}>{m.displayName || m.email}</option>
              ))}
            </select>
          )}
          <input
            className="kpi-create-label"
            value={draft.label}
            onChange={event => setDraft({ ...draft, label: event.target.value })}
            placeholder="KPI명"
          />
          <textarea
            className="kpi-create-description"
            value={draft.description}
            onChange={event => setDraft({ ...draft, description: event.target.value })}
            placeholder="핵심 목표 / 세부 이행 필요내역 (Enter로 줄바꿈)"
            rows={2}
          />
        </form>
      )}
      {editable && error && <div className="alert error slim">{error}</div>}

      {/* 팀 KPI 영역 */}
      <div className="kpi-section-divider">
        <strong>팀 KPI</strong>
        <small>관리자가 등록한 부서별 공통 KPI</small>
      </div>
      {kpis.length === 0 ? (
        <EmptyText text="등록된 팀 KPI가 없습니다." />
      ) : (
        <div className="kpi-grouped">
          {groupOrder.map((key, idx) => {
            const items = groupedKpis[key]
            if (!items || items.length === 0) return null
            const groupLabel = key === 'all' ? '전사 공통' : getSubteamLabel(key)
            return (
              <div key={key} className="kpi-group">
                <h4 className="kpi-group-title">
                  <span className={`kpi-group-tag subteam-${key}`}>{groupLabel}</span>
                  <small>{items.length}개</small>
                  <span className="group-order-controls">
                    <button type="button" className="order-btn" onClick={() => moveTeamGroup(key, 'up')} disabled={idx === 0} title="위로">↑</button>
                    <button type="button" className="order-btn" onClick={() => moveTeamGroup(key, 'down')} disabled={idx === groupOrder.length - 1} title="아래로">↓</button>
                  </span>
                </h4>
                <div className="kpi-grid">
                  {items.map(kpi => (
                    <KpiCard key={kpi.id} kpi={kpi} editable={editable} allLinkableTasks={allLinkableTasks} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 팀원 개인 KPI 영역 — 팀장만 등록/수정/삭제 (위 통합 폼에서 [개인] 선택 시 추가) */}
      <div className="kpi-section-divider personal">
        <strong>팀원 개인 KPI</strong>
        <small>팀장이 각 팀원에게 부여 · 팀원은 읽기 전용 (위 폼에서 [개인] 선택 후 등록)</small>
      </div>
      {personalKpis.length === 0 ? (
        <EmptyText text={editable
          ? '등록된 팀원 개인 KPI가 없습니다. 위 폼에서 [개인] 선택 후 팀원과 KPI를 입력하세요.'
          : '등록된 팀원 개인 KPI가 없습니다.'} />
      ) : (
        <div className="kpi-grouped">
          {(() => {
            // 팀원별로 그룹핑 — allMembers를 기준으로 정렬, 멤버 정보 join
            const byMember = {}
            personalKpis.forEach(kpi => {
              const uid = kpi._memberUid || kpi.ownerUid || 'unknown'
              const member = allMembers.find(m => m.uid === uid)
              const ownerName = member?.displayName || member?.email || kpi.owner || '이름 없음'
              if (!byMember[uid]) byMember[uid] = { uid, owner: ownerName, items: [] }
              byMember[uid].items.push(kpi)
            })
            // 사용자 정의 순서 적용
            const orderedGroups = personalGroupOrder
              .map(uid => byMember[uid])
              .filter(Boolean)
            // 누락된 그룹은 끝에 (방어용)
            Object.values(byMember).forEach(g => {
              if (!orderedGroups.includes(g)) orderedGroups.push(g)
            })
            return orderedGroups.map((group, idx) => (
              <div key={group.uid} className="kpi-group">
                <h4 className="kpi-group-title">
                  <span className="kpi-group-tag subteam-all">{group.owner}</span>
                  <small>{group.items.length}개</small>
                  <span className="group-order-controls">
                    <button type="button" className="order-btn" onClick={() => movePersonalGroup(group.uid, 'up')} disabled={idx === 0} title="위로">↑</button>
                    <button type="button" className="order-btn" onClick={() => movePersonalGroup(group.uid, 'down')} disabled={idx === orderedGroups.length - 1} title="아래로">↓</button>
                  </span>
                </h4>
                <div className="kpi-grid">
                  {group.items.map(kpi => (
                    <PersonalKpiCard
                      key={kpi.id}
                      kpi={kpi}
                      linkableTasks={allLinkableTasks}
                      onDelete={editable ? () => handleDeletePersonalKpi(group.uid, kpi.id, kpi.label) : null}
                    />
                  ))}
                </div>
              </div>
            ))
          })()}
        </div>
      )}
    </Panel>
  )
}

function KpiCard({ kpi, editable, allLinkableTasks = [] }) {
  // 이 KPI 라벨에 연결된 업무 카운트 (task.kpi 또는 task.impact 매칭)
  const linkedTasks = useMemo(
    () => allLinkableTasks.filter(t => {
      const label = String(t.kpi || t.impact || '').trim()
      return label && label === kpi.label
    }),
    [allLinkableTasks, kpi.label],
  )
  const totalCount = linkedTasks.length
  const completedCount = linkedTasks.filter(t => t.status === 'done').length
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  async function handleDelete() {
    const ok = window.confirm(`"${kpi.label}" KPI를 삭제할까요?`)
    if (!ok) return
    await deleteKpi(DEFAULT_TEAM_ID, kpi.id)
  }

  const subteamKey = kpi.subteam || 'all'
  const subteamLabel = subteamKey === 'all' ? '전사 공통' : getSubteamLabel(kpi.subteam)

  return (
    <article className={`kpi-card ${kpi.color || 'teal'}`}>
      <div className="kpi-card-head">
        <span className="kpi-card-label">{kpi.label}</span>
        {editable && (
          <button className="icon-button subtle kpi-card-delete" onClick={handleDelete} title="KPI 삭제">
            <Trash2 size={14} />
          </button>
        )}
      </div>
      <div className="kpi-card-meta">
        <span className={`kpi-subteam-tag subteam-${subteamKey}`}>{subteamLabel}</span>
      </div>
      {kpi.description && <p className="kpi-card-description">{kpi.description}</p>}
      <strong>
        {totalCount > 0
          ? <>업무 <span className="kpi-count-num">{completedCount}/{totalCount}</span> <small style={{ fontWeight: 400, opacity: 0.7 }}>완료</small></>
          : <span className="kpi-count-empty">연결된 업무 없음</span>}
      </strong>
      <div className="progress-track"><span style={{ width: `${pct}%` }} /></div>
      <div className="kpi-foot">
        <small>{totalCount > 0 ? `${pct}% 완료` : '업무를 연결하면 자동 집계됩니다'}</small>
      </div>
    </article>
  )
}

function HistoryList({ history, currentWeekKey, currentCompletedTasks = [], user }) {
  const [expandedItems, setExpandedItems] = useState(new Set())
  // 즐겨찾기 — localStorage 기반 (사용자별)
  const FAV_KEY = `history-favorites-${user?.uid || 'guest'}`
  const [favorites, setFavorites] = useState(() => {
    try {
      const raw = localStorage.getItem(FAV_KEY)
      return new Set(raw ? JSON.parse(raw) : [])
    } catch { return new Set() }
  })
  const toggleItem = (key) => {
    setExpandedItems(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  function toggleFavorite(taskId, ev) {
    if (ev) ev.stopPropagation()
    setFavorites(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      try { localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(next))) } catch {}
      return next
    })
  }

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
        <details key={week.weekKey} open>
          <summary>{weekKeyToLabel(week.weekKey)} <span>{week.doneItems.length}건</span></summary>
          <div className="history-table">
            {week.doneItems.map(item => {
              const itemKey = `${week.weekKey}-${item.id}`
              const isOpen = expandedItems.has(itemKey)
              const isFavorite = favorites.has(item.id)
              const progressLogs = item.progressLogs || []
              const comments = item.comments || []
              const imageCount = progressLogs.reduce((sum, log) => sum + (log.images?.length || 0), 0)
              // 작업 기간 계산
              const startMs = item.createdAt ? new Date(item.createdAt).getTime() : null
              const endMs = (item.completedAt || item.updatedAt) ? new Date(item.completedAt || item.updatedAt).getTime() : null
              const durationDays = (startMs && endMs && endMs > startMs)
                ? Math.max(1, Math.ceil((endMs - startMs) / 86400000))
                : 0
              const sameDayDone = durationDays === 0 || durationDays === 1
              const kpiLabel = (item.kpi || item.impact || '').trim()

              // 타임라인 이벤트 모음 (시작 + 진행로그 + 코멘트 + 완료)
              const events = []
              if (startMs) events.push({ type: 'start', ts: startMs, text: '시작' })
              progressLogs.forEach((log, idx) => {
                if (log.createdAt) events.push({
                  type: 'progress', ts: new Date(log.createdAt).getTime(),
                  text: `진행로그 #${idx + 1}: ${(log.text || log.note || '').slice(0, 60)}`,
                  images: log.images?.length || 0,
                })
              })
              comments.forEach(c => {
                if (c.createdAt) events.push({
                  type: 'comment', ts: new Date(c.createdAt).getTime(),
                  text: `${c.authorName || '코멘트'}: ${(c.text || '').slice(0, 60)}`,
                })
              })
              if (endMs) events.push({ type: 'end', ts: endMs, text: '완료' })
              events.sort((a, b) => a.ts - b.ts)
              const tsRange = events.length > 1 ? events[events.length - 1].ts - events[0].ts : 1
              const tsStart = events.length > 0 ? events[0].ts : 0

              return (
                <article
                  key={itemKey}
                  className={`history-item ${isOpen ? 'expanded' : ''} ${isFavorite ? 'is-favorite' : ''}`}
                  onClick={() => toggleItem(itemKey)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggleItem(itemKey)
                    }
                  }}
                >
                  {/* 즐겨찾기 ★ 우상단 */}
                  <button
                    type="button"
                    className={`history-fav-btn ${isFavorite ? 'active' : ''}`}
                    onClick={ev => toggleFavorite(item.id, ev)}
                    title={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                    aria-label="즐겨찾기"
                  >
                    {isFavorite ? '★' : '☆'}
                  </button>

                  {/* ① 요약 헤더 */}
                  <div className="history-item-header">
                    <strong className="h-title">{item.title}</strong>
                    <div className="h-dates">
                      시작 {formatHistoryDate(item.createdAt)}
                      {' · '}
                      완료 {formatHistoryDate(item.completedAt || item.updatedAt)}
                      {durationDays > 0 ? ` · ${durationDays === 1 ? '당일' : `${durationDays}일`}` : ''}
                    </div>
                    {item.detail && <p className="h-detail">{item.detail}</p>}
                    {/* 0인 chip은 자동 숨김 */}
                    <div className="h-summary-chips">
                      {kpiLabel && <span className="h-chip kpi">▣ {kpiLabel}</span>}
                      {durationDays > 0 && (
                        <span className="h-chip duration">⏱ {durationDays === 1 ? '당일' : `${durationDays}일`}</span>
                      )}
                      {progressLogs.length > 0 && (
                        <span className="h-chip">📈 진행로그 <em>{progressLogs.length}</em></span>
                      )}
                      {comments.length > 0 && (
                        <span className="h-chip">💬 코멘트 <em>{comments.length}</em></span>
                      )}
                      {imageCount > 0 && (
                        <span className="h-chip">📎 첨부 <em>{imageCount}</em></span>
                      )}
                      {(item.parentIds?.length || 0) > 0 && (
                        <span className="h-chip">🔗 이전업무 <em>{item.parentIds.length}</em></span>
                      )}
                    </div>
                  </div>

                  {/* ② 가로 타임라인 — 당일완료/이벤트 1개 이하면 생략 */}
                  {!sameDayDone && events.length > 2 && (
                    <div className="history-timeline" onClick={e => e.stopPropagation()}>
                      <div className="hl-track">
                        <div className="hl-line"></div>
                        {events.map((ev, idx) => {
                          const pct = tsRange > 0 ? ((ev.ts - tsStart) / tsRange) * 100 : 0
                          // 가장자리(좌 15% / 우 85%) 툴팁이 잘리지 않도록 좌·우 정렬 클래스
                          const tipAlign = pct < 15 ? 'tip-left' : pct > 85 ? 'tip-right' : 'tip-center'
                          const dot = `hl-dot hl-${ev.type} ${tipAlign}`
                          return (
                            <span
                              key={idx}
                              className={dot}
                              style={{ left: `${pct}%` }}
                              data-tip={`${formatHistoryDate(ev.ts)}\n${ev.text}`}
                              title={ev.text}
                            />
                          )
                        })}
                      </div>
                      <div className="hl-legend">
                        <span><i className="hl-lg start"></i>시작</span>
                        <span><i className="hl-lg progress"></i>진행 {progressLogs.length}</span>
                        <span><i className="hl-lg comment"></i>코멘트 {comments.length}</span>
                        <span><i className="hl-lg end"></i>완료</span>
                      </div>
                    </div>
                  )}

                  {/* ③ 본문 확장 */}
                  {isOpen && (
                    <div className="history-item-detail" onClick={e => e.stopPropagation()}>
                      {/* 진행로그 — 게시글 형태 */}
                      {progressLogs.length > 0 && (
                        <div className="history-section">
                          <div className="history-section-h">📈 진행로그 <span className="cnt">{progressLogs.length}</span></div>
                          <div className="progress-feed">
                            {progressLogs.map(log => (
                              <div key={log.id} className="progress-post">
                                <div className="post-meta">
                                  <span className="date">{formatHistoryDate(log.createdAt)}</span>
                                  {log.createdAt && (
                                    <span className="time">
                                      {new Date(log.createdAt).getHours()}:{String(new Date(log.createdAt).getMinutes()).padStart(2, '0')}
                                    </span>
                                  )}
                                  <span className="author">{log.memberName || log.authorName || '작성자'}</span>
                                </div>
                                <div className="post-body">
                                  <p className="post-text">{log.text || log.note || ''}</p>
                                  {log.images?.length > 0 && (
                                    <div className="post-thumbs">
                                      <ImageStrip images={log.images} />
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 코멘트 — 카카오톡 채팅 형태 */}
                      {comments.length > 0 && (
                        <div className="history-section">
                          <div className="history-section-h">💬 코멘트 <span className="cnt">{comments.length}</span></div>
                          <div className="comment-list chat-style">
                            {comments.map(c => {
                              const isMine = c.authorUid === user?.uid
                              return (
                                <article
                                  key={c.id}
                                  className={`comment-item ${isMine ? 'is-mine' : 'is-other'}`}
                                >
                                  <div className="comment-body-button">
                                    <div>
                                      <strong>{c.authorName || '작성자'}</strong>
                                      <span>{formatHistoryDate(c.createdAt)}</span>
                                    </div>
                                    <p>{c.text}</p>
                                  </div>
                                </article>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {progressLogs.length === 0 && comments.length === 0 && (
                        <p className="history-empty">남긴 내용이 없습니다.</p>
                      )}
                    </div>
                  )}
                </article>
              )
            })}
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

function TaskSignal({ task, user, onAddComment, onReplyComment, onDeleteComment, onApproveReview, signalKind, signalMeta }) {
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [approving, setApproving] = useState(false)

  async function handleApprove(event) {
    event.stopPropagation()
    if (!onApproveReview || approving) return
    if (!window.confirm(`"${task.title}" 검토 요청을 승인 처리하시겠습니까? (상태가 완료로 변경됩니다)`)) return
    setApproving(true)
    try {
      await onApproveReview()
    } catch (err) {
      window.alert(`결재 확인 실패: ${err.message || '알 수 없는 오류'}`)
    } finally {
      setApproving(false)
    }
  }
  const comments = task.comments || []
  // 담당자 진행내용 — 최신순으로 정렬 (오늘 + 이전 진행)
  const progressLogs = useMemo(() => {
    const logs = task.progressLogs || []
    return [...logs].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  }, [task.progressLogs])

  async function handleSubmit(event) {
    event.preventDefault()
    if (!draft.trim() || !onAddComment) return
    setSubmitting(true)
    try {
      await onAddComment(draft)
      setDraft('')
    } catch (err) {
      window.alert(`코멘트 저장 실패: ${err.message || '알 수 없는 오류'}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <article className={`signal-row ${expanded ? 'expanded' : ''} ${signalKind ? `signal-${signalKind}` : ''}`}>
      <div className="signal-row-head-wrap">
        <button
          type="button"
          className="signal-row-head"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          {signalKind === 'doing'
            ? <Activity size={16} />
            : signalKind === 'review'
              ? <Clock size={16} />
              : signalKind === 'done'
                ? <CheckCircle2 size={16} />
                : <AlertTriangle size={16} />}
          <div>
            <strong>
              {task.title}
              {signalKind === 'doing' && <span className="kind-tag doing">진행</span>}
              {signalKind === 'done' && <span className="kind-tag done">완료</span>}
              {signalKind === 'blocked' && <span className="kind-tag blocked">막힘</span>}
              {signalKind === 'stale' && <span className="kind-tag stale">무활동</span>}
              {signalKind === 'review' && <span className="kind-tag review">검토</span>}
            </strong>
            <span>
              {task.memberName || task.ownerName || '담당자 미지정'}
              {task.subteamLabel && ` · [${task.subteamLabel}]`}
              {signalMeta ? ` · ${signalMeta}` : ` · ${formatDue(task.dueDate)}`}
              {comments.length > 0 && ` · 코멘트 ${comments.length}`}
            </span>
          </div>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {signalKind === 'review' && onApproveReview && (
          <button
            type="button"
            className="signal-approve-btn"
            onClick={handleApprove}
            disabled={approving}
            title="검토 요청을 승인 → 상태가 완료로 변경됩니다"
          >
            <CheckCircle2 size={14} />
            {approving ? '처리 중' : '결재 확인'}
          </button>
        )}
        {task.approvedAt && (
          <div className="approval-block" title={`결재 ${task.approvedByName || ''}${task.approvedByTitle ? ` (${task.approvedByTitle})` : ''} · ${formatDate(task.approvedAt)}`}>
            <div className="approval-stamp">
              <span className="approval-stamp-text">확 인</span>
              {task.approvedByName && (
                <span className="approval-stamp-name">{task.approvedByName}</span>
              )}
              {task.approvedByTitle && (
                <span className="approval-stamp-title">{task.approvedByTitle}</span>
              )}
            </div>
            <span className="approval-stamp-date">{formatDate(task.approvedAt)}</span>
          </div>
        )}
      </div>
      {expanded && (
        <div className="signal-row-body">
          {/* 담당자가 기록한 진행내용 — 업무 파악용 */}
          {progressLogs.length > 0 && (
            <div className="signal-progress-block">
              <div className="signal-progress-head">
                <Clock size={13} />
                <strong>{task.memberName || task.ownerName || '담당자'}의 진행내용</strong>
                <span className="signal-progress-cnt">{progressLogs.length}건</span>
              </div>
              <div className="signal-progress-list">
                {progressLogs.slice(0, 5).map(log => (
                  <div key={log.id} className="signal-progress-item">
                    <div className="signal-progress-body">
                      <div className="signal-progress-meta">
                        <span className="who">{log.memberName || log.authorName || task.memberName || '담당자'}</span>
                        {log.createdAt && (
                          <span className="when">
                            {formatDate(log.createdAt)} {new Date(log.createdAt).getHours()}:{String(new Date(log.createdAt).getMinutes()).padStart(2, '0')}
                          </span>
                        )}
                      </div>
                      {log.text && <p className="signal-progress-text">{log.text}</p>}
                    </div>
                    {(log.images || []).length > 0 && (
                      <div className="signal-progress-images">
                        {log.images.slice(0, 3).map(img => (
                          <a key={img.path || img.url} href={img.url} target="_blank" rel="noreferrer" title="클릭하여 원본 보기">
                            <img src={img.url} alt="" />
                          </a>
                        ))}
                        {log.images.length > 3 && (
                          <span className="signal-progress-more-images">+{log.images.length - 3}</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {progressLogs.length > 5 && (
                  <div className="signal-progress-more">+ {progressLogs.length - 5}건 더 (최근 5건만 표시)</div>
                )}
              </div>
            </div>
          )}

          {onAddComment && (
            <form className="comment-form" onSubmit={handleSubmit}>
              <input
                value={draft}
                onChange={event => setDraft(event.target.value)}
                placeholder="이 업무에 코멘트 남기기 (마감 지원·병목 해소·우선순위 조정 등)"
              />
              <button className="secondary-action" type="submit" disabled={submitting || !draft.trim()}>
                <MessageSquareText size={14} />
                {submitting ? '저장 중' : '코멘트'}
              </button>
            </form>
          )}
          {comments.length > 0 ? (
            <CommentThread
              comments={comments}
              user={user}
              onReply={onReplyComment}
              onDelete={onDeleteComment}
              emptyText="아직 코멘트가 없습니다."
            />
          ) : (
            <EmptyText text="아직 코멘트가 없습니다. 위에서 첫 코멘트를 남겨보세요." />
          )}
        </div>
      )}
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

function projectPriorityRank(task) {
  const remain = daysUntil(task.dueDate)
  if (remain !== null) return remain
  if (task.status === 'blocked') return 30
  if (task.isFocus) return 40
  if (task.priority === 'high') return 50
  return 999
}

function taskKey(task) {
  if (!task) return ''
  return `${task.memberUid || task.ownerUid || 'member'}-${task.id}`
}

function getMemberPermissions(profile) {
  return {
    ...DEFAULT_POST_PERMISSIONS,
    ...(profile?.permissions || {}),
  }
}

function getProfileName(user, profile) {
  return profile?.displayName || user?.displayName || user?.email || '이름 없음'
}

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function sumNumbers(values) {
  return values.reduce((sum, value) => sum + toNumber(value), 0)
}

function formatNumber(value) {
  return toNumber(value).toLocaleString('en-US', { maximumFractionDigits: 1 })
}

function formatKrw(value) {
  return `${Math.round(toNumber(value)).toLocaleString('ko-KR')}원`
}

function getRecordValueKrw(record) {
  if (record?.currency === 'KRW' || record?.estimatedValueKrw !== undefined) {
    return toNumber(record.estimatedValueKrw ?? record.estimatedValueUsd)
  }
  return Math.round(toNumber(record?.estimatedValueUsd) * AI_USD_TO_KRW)
}

function getRecordCostAvoidedKrw(record) {
  if (record?.currency === 'KRW' || record?.costAvoidedKrw !== undefined) {
    return toNumber(record.costAvoidedKrw ?? record.costAvoidedUsd)
  }
  return Math.round(toNumber(record?.costAvoidedUsd) * AI_USD_TO_KRW)
}

function parseAiUsageLog(rawText, weekTasks = []) {
  const text = (rawText || '').trim()
  if (!text) return { hasContent: false }

  const matchedTask = weekTasks.find(task => task.title && text.includes(task.title))
  const useCase = pickLogSection(text, ['활용 내용', '활용방식', '사용 내용', '작업 내용', '프롬프트', 'ai 활용'])
    || summarizeLogLines(text, ['활용', '작성', '정리', '분석', '요약', '초안', '비교'])
  const output = pickLogSection(text, ['산출물', '결과물', '결과', '만든 것', '작성물'])
    || summarizeLogLines(text, ['산출물', '초안', '표', '메일', '보고', '제안서', '리스트'])
  const nextStep = pickLogSection(text, ['다음 액션', '후속', 'next', 'todo', '추가 활용', '계획'])
    || summarizeLogLines(text, ['다음', '후속', '반영', '공유', '검토'])
  const impact = pickLogSection(text, ['업무 가치', '가치', '효과', '성과', '기여'])
    || guessAiImpact(text, output)
  const monthKey = normalizeMonthKey(pickLogSection(text, ['기준월', '월간 마일스톤', '월']))
  const projectName = pickLogSection(text, ['대 프로젝트', '프로젝트', '연결 업무'])
  const improvementTitle = pickLogSection(text, ['개선과제', '개선 사항', '로그 제목'])
  const tags = normalizeTags(pickLogSection(text, ['태그', '라벨'])).join(' ')
  const approvalStatus = pickLogSection(text, ['승인상태', '상태']) || '작성됨'
  const aiTool = guessAiTool(text)
  const baselineMinutes = parseDurationByKeywords(text, ['기존 소요시간', '기존', '원래', 'before', 'baseline'])
    || guessBaselineMinutes(text)
  const aiMinutes = parseDurationByKeywords(text, ['ai 후 소요시간', 'ai 후', '실제', 'after', '완료시간'])
    || guessAiMinutes(text, baselineMinutes)
  const monthlyCount = parsePlainNumberByKeywords(text, ['월 반복횟수', '반복횟수', 'monthly count'])
  const costAvoidedKrw = parseMoneyByKeywords(text, ['외주', '리서치', '대체비', '비용절감'])
  const revenueImpactKrw = parseMoneyByKeywords(text, ['매출', '기회', '수주', '전환'])

  return {
    hasContent: true,
    taskId: matchedTask?.id || '',
    monthKey,
    projectName,
    improvementTitle,
    tags,
    approvalStatus,
    aiTool,
    useCase,
    output,
    impact,
    baselineMinutes: String(baselineMinutes || ''),
    aiMinutes: String(aiMinutes || ''),
    monthlyCount: monthlyCount ? String(monthlyCount) : '1',
    hourlyRateUsd: String(DEFAULT_HOURLY_RATE_KRW),
    costAvoidedUsd: costAvoidedKrw ? String(costAvoidedKrw) : '',
    revenueImpactUsd: revenueImpactKrw ? String(revenueImpactKrw) : '',
    nextStep,
  }
}

function pickLogSection(text, labels) {
  const lines = text.split(/\r?\n/)
  const collected = []
  let collecting = false
  for (const line of lines) {
    const clean = normalizeLogLine(line)
    const isTarget = labels.some(label => clean.toLowerCase().includes(label.toLowerCase()))
    const isNewSection = /^#{1,6}\s/.test(line) || /^\[[^\]]+\]/.test(clean) || /^[-*]?\s*[^:：]{2,24}[:：]/.test(line)

    if (isTarget) {
      collecting = true
      const inline = line.split(/[:：]/).slice(1).join(':').trim()
      if (inline) collected.push(inline)
      continue
    }

    if (collecting && isNewSection && collected.length > 0) break
    if (collecting && clean) collected.push(clean)
    if (collected.length >= 4) break
  }
  return collected.join('\n').trim()
}

function summarizeLogLines(text, keywords) {
  const lines = text
    .split(/\r?\n/)
    .map(normalizeLogLine)
    .filter(Boolean)
    .filter(line => keywords.some(keyword => line.toLowerCase().includes(keyword.toLowerCase())))
  return lines.slice(0, 3).join('\n')
}

function normalizeLogLine(line) {
  return line
    .replace(/^#{1,6}\s*/, '')
    .replace(/^\s*[-*]\s*/, '')
    .replace(/^\s*\d+[.)]\s*/, '')
    .trim()
}

function guessAiTool(text) {
  const candidates = ['ChatGPT', 'Gemini', 'Claude', 'Perplexity', 'Copilot', 'v0', 'Cursor', 'Codex']
  const found = candidates.filter(tool => text.toLowerCase().includes(tool.toLowerCase()))
  return found.length ? found.join(' / ') : 'ChatGPT / Gemini / Claude'
}

function parseDurationByKeywords(text, keywords) {
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    if (!keywords.some(keyword => line.toLowerCase().includes(keyword.toLowerCase()))) continue
    const match = line.match(/(\d+(?:\.\d+)?)\s*(시간|hour|hours|h|분|minute|minutes|m)?/i)
    if (!match) continue
    const value = Number(match[1])
    const unit = match[2] || '분'
    return /시간|hour|h/i.test(unit) ? Math.round(value * 60) : Math.round(value)
  }
  return 0
}

function parsePlainNumberByKeywords(text, keywords) {
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    if (!keywords.some(keyword => line.toLowerCase().includes(keyword.toLowerCase()))) continue
    const match = line.match(/(\d+(?:\.\d+)?)/)
    if (match) return Math.max(1, Math.round(Number(match[1])))
  }
  return 0
}

function parseMoneyByKeywords(text, keywords) {
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    if (!keywords.some(keyword => line.toLowerCase().includes(keyword.toLowerCase()))) continue
    const match = line.match(/\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(원|만원|만 원|천원|천 원|달러|usd|\$)?/i)
    if (!match) continue
    const value = Number(match[1].replace(/,/g, ''))
    const unit = match[2] || '원'
    if (/만원|만 원/.test(unit)) return Math.round(value * 10000)
    if (/천원|천 원/.test(unit)) return Math.round(value * 1000)
    if (/달러|usd|\$/i.test(unit)) return Math.round(value * AI_USD_TO_KRW)
    return Math.round(value)
  }
  return 0
}

function guessBaselineMinutes(text) {
  const lower = text.toLowerCase()
  if (/제안서|보고서|시장조사|리서치|forecast|분석/.test(lower)) return 120
  if (/비교표|표|정리|voc|요약/.test(lower)) return 90
  if (/메일|초안|문구|카피/.test(lower)) return 60
  return 60
}

function guessAiMinutes(text, baselineMinutes) {
  const lower = text.toLowerCase()
  if (/검증|복잡|자료|리서치/.test(lower)) return Math.max(30, Math.round(baselineMinutes * 0.4))
  if (/요약|메일|초안/.test(lower)) return Math.max(15, Math.round(baselineMinutes * 0.3))
  return Math.max(20, Math.round(baselineMinutes * 0.5))
}

function guessAiImpact(text, output) {
  if (/외주|리서치|시장조사|비교표/.test(text)) return '리서치/정리 시간을 줄이고 의사결정용 근거 자료를 빠르게 확보함'
  if (/보고|메일|초안|제안서/.test(text + output)) return '보고/제안 초안 작성 시간을 줄이고 팀장 검토 가능한 1차 산출물을 빠르게 확보함'
  return '반복 업무 시간을 줄이고 산출물 초안 품질과 실행 속도를 개선함'
}

function buildAiUsageLogTemplate(task) {
  return [
    '# 이 문서를 첨부하면 월별·부서별·프로젝트별·태그 기반 AI 활용 로그 데이터로 정리해줘',
    '- 기준월: ',
    '- 부서: ',
    `- 대 프로젝트: ${task?.title || '내 업무 프로젝트명'}`,
    '- 개선과제: ',
    '- 태그: #문서작성 #보고 #시간절감',
    '- 승인상태: 작성됨',
    '- 사용 AI: ChatGPT / Gemini / Claude',
    '- 활용 내용: ',
    '- 산출물: ',
    '- 업무 가치: ',
    '- 기존 소요시간:  분',
    '- AI 후 소요시간:  분',
    '- 월 반복횟수: 1',
    '- 외주/리서치 대체비: 0원',
    '- 매출/기회가치: 0원',
    '- 다음 액션: ',
  ].join('\n')
}

function buildAiUsagePromptGuide() {
  return [
    '# 이 문서를 첨부하면 월별·부서별·프로젝트별·태그 기반 AI 활용 로그 데이터로 정리해줘',
    '',
    '너는 NST BIO 마케팅본부의 AI 활용 기록 정리 담당자야.',
    '',
    '이 문서와 함께 첨부되거나 붙여넣어진 작업 원자료를 기준으로, 회사 주간업무 대시보드와 보고에 사용할 수 있는 AI 활용 로그 데이터를 Markdown 형식으로 작성해줘.',
    '',
    '가장 중요한 목적:',
    '- 네가 출력한 Markdown 전체를 사용자가 주간업무 대시보드의 [AI 활용 기록] 탭 > [AI 업무 로그로 자동 채우기] 입력창에 그대로 복사해서 붙여넣을 수 있어야 해.',
    '- 따라서 첫 번째 결과 블록은 반드시 아래의 [대시보드 붙여넣기용 AI 업무 로그] 형식으로 작성해.',
    '- 필드명은 바꾸지 말고 그대로 사용해. 대시보드가 이 필드명을 기준으로 자동 분석해.',
    '- 여러 업무가 있어도 대시보드에 1회 저장할 대표 로그 1건을 먼저 만들고, 월간 집계와 세부 로그는 그 아래에 참고용으로 붙여.',
    '- 사용자가 바로 복사할 수 있도록 결과 앞뒤에 설명, 인사말, 안내 문장을 붙이지 마.',
    '',
    '중요:',
    '- 마지막 작업 하나만 요약하지 말고, 원자료에 있는 오늘 작업 전체를 기준으로 정리해.',
    '- 로그는 개별 업무 단위로 저장하되, 월별·부서별·프로젝트별·태그별로 집계할 수 있게 작성해.',
    '- 부서는 실제 업무 부서를 사용해. 예: 커머스, 마케팅, DX',
    '- 대 프로젝트는 업무의 큰 묶음으로 작성해. 예: 홈쇼핑런칭, 자사몰 개선, AI Agent 업무 자동화',
    '- 개선과제는 프로젝트 안에서 실제로 개선된 세부 업무로 작성해.',
    '- 태그는 검색과 분석이 가능하도록 2~5개만 작성해. 예: #문서작성 #리서치 #자동화 #보고 #개발 #영업지원 #시간절감',
    '- 기존 소요시간과 AI 후 소요시간은 과장하지 말고 보수적으로 추정해.',
    '- 외주/리서치 대체비와 매출/기회가치는 명확한 근거가 없으면 0원으로 둬.',
    '- 산정근거는 반드시 계산식으로 작성해.',
    '- 결과는 아래 형식만 출력하고, 별도 설명 문장은 붙이지 마.',
    '',
    '## 대시보드 붙여넣기용 AI 업무 로그',
    '- 기준월:',
    '- 부서:',
    '- 대 프로젝트:',
    '- 개선과제:',
    '- 태그:',
    '- 승인상태: 작성됨',
    '- 사용 AI:',
    '- 활용 내용:',
    '- 산출물:',
    '- 업무 가치:',
    '- 기존 소요시간:  분',
    '- AI 후 소요시간:  분',
    '- 월 반복횟수: 1',
    '- 외주/리서치 대체비: 0원',
    '- 매출/기회가치: 0원',
    '- 산정근거:',
    '- 다음 액션:',
    '',
    '## AI 활용 로그 데이터',
    '',
    '### 월간 마일스톤',
    '- 기준월:',
    '- 월간 목표:',
    '- 부서:',
    '- 승인상태: 작성됨',
    '',
    '### 프로젝트 요약',
    '- 부서:',
    '- 대 프로젝트:',
    '- 개선과제:',
    '- 로그 제목:',
    '- 사용 AI:',
    '- 태그:',
    '- 활용 요약:',
    '- 산출물 요약:',
    '- 업무 가치 요약:',
    '- 기존 소요시간:  분',
    '- AI 후 소요시간:  분',
    '- 월 반복횟수: 1',
    '- 절감시간:  h',
    '- 외주/리서치 대체비: 0원',
    '- 매출/기회가치: 0원',
    '- 추정가치:  원',
    '- 산정근거:',
    '- 다음 액션:',
    '',
    '### 세부 로그',
    '- 날짜:',
    '- 작성자:',
    '- 부서:',
    '- 대 프로젝트:',
    '- 개선과제:',
    '- 로그 제목:',
    '- 사용 AI:',
    '- 태그:',
    '- 활용 내용:',
    '- 산출물:',
    '- 업무 가치:',
    '- 기존 소요시간:  분',
    '- AI 후 소요시간:  분',
    '- 월 반복횟수: 1',
    '- 절감시간:  h',
    '- 외주/리서치 대체비: 0원',
    '- 매출/기회가치: 0원',
    '- 추정가치:  원',
    '- 산정근거:',
    '- 승인상태: 작성됨',
    '- 다음 액션:',
    '',
    '### 월간 집계',
    '- 총 로그 수:',
    '- 총 절감시간:  h',
    '- 총 외주/리서치 대체비:  원',
    '- 총 매출/기회가치:  원',
    '- 총 추정가치:  원',
    '- 주요 태그:',
    '- 주요 산출물:',
    '- CSO 보고 포인트:',
    '',
    '## 작성 기준',
    '',
    '가치 산정 방식:',
    '',
    '```txt',
    '절감시간 = (기존 소요시간 - AI 후 소요시간) × 월 반복횟수 ÷ 60',
    '시간가치 = 절감시간 × 40,000원',
    '총 추정가치 = 시간가치 + 외주/리서치 대체비 + 매출/기회가치',
    '```',
    '',
    '기본 시간당 기준가는 40,000원으로 계산해.',
    '',
    '## 원자료 입력 영역',
    '',
    '아래에 오늘 작업 메모, AI 대화 요약, 산출물 목록, 사용량 캡처 메모, 커밋 메시지, 보고 내용 등을 붙여넣어.',
    '',
    '---',
    '',
    '날짜:',
    '작성자:',
    '부서:',
    '',
    '오늘 사용한 AI:',
    '-',
    '',
    '오늘 AI로 진행한 업무:',
    '1.',
    '2.',
    '3.',
    '',
    '만든 산출물:',
    '-',
    '',
    '수정/개선한 내용:',
    '-',
    '',
    '업무에 도움이 된 점:',
    '-',
    '',
    '대략적인 시간:',
    '- AI 없이 했을 때 예상:',
    '- AI 활용 후 실제:',
    '',
    '외주/리서치 대체비 근거:',
    '-',
    '',
    '매출/기회가치 근거:',
    '-',
    '',
    '다음 액션:',
    '-',
    '',
    '---',
  ].join('\n')
}

function buildChangeRequestPrompt({ title, location, detail, expected, authorName, imageCount = 0, imageNames = [] }) {
  const safeTitle = title?.trim() || '수정요청 제목 미입력'
  const safeLocation = location?.trim() || '화면 위치 미입력'
  const safeDetail = detail?.trim() || '수정해야 하는 내용 미입력'
  const safeExpected = expected?.trim() || '원하는 결과 미입력'
  const imageLine = imageCount > 0
    ? `첨부 캡처: ${imageCount}장${imageNames.length ? ` (${imageNames.join(', ')})` : ''}`
    : '첨부 캡처: 없음'

  return [
    '아래 수정요청을 기준으로 현재 주간업무 대시보드를 개선해줘.',
    '',
    `[요청자] ${authorName || '작성자 미입력'}`,
    `[요청 제목] ${safeTitle}`,
    `[화면 위치] ${safeLocation}`,
    `[캡처 여부] ${imageLine}`,
    '',
    '[현재 문제/수정해야 할 내용]',
    safeDetail,
    '',
    '[원하는 결과]',
    safeExpected,
    '',
    '[작업 기준]',
    '- 기존 Firebase/Firestore/Vercel 구조를 유지해줘.',
    '- 사용자 데이터가 삭제되지 않도록 기존 저장 구조를 보존해줘.',
    '- 수정 후 로컬에서 확인해야 할 다음 실행 단계를 알려줘.',
    '- 막혔던 방식은 재시도하지 말고 다른 방법을 제안해줘.',
  ].join('\n')
}

function compressProgressImage(file) {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    throw new Error('이미지는 JPG, PNG, WEBP 형식만 첨부할 수 있습니다.')
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('이미지는 원본 기준 10MB 이하만 첨부할 수 있습니다.')
  }

  return new Promise((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(file)

    image.onload = () => {
      const maxSide = 1600
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const context = canvas.getContext('2d')
      context.drawImage(image, 0, 0, canvas.width, canvas.height)

      canvas.toBlob(blob => {
        URL.revokeObjectURL(url)
        if (!blob) {
          reject(new Error('이미지 압축에 실패했습니다.'))
          return
        }
        const baseName = file.name.replace(/\.[^.]+$/, '')
        resolve(new File([blob], `${baseName || 'progress-image'}.jpg`, { type: 'image/jpeg' }))
      }, 'image/jpeg', 0.76)
    }

    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('이미지를 읽을 수 없습니다. 다른 파일을 선택해주세요.'))
    }

    image.src = url
  })
}

function withTimeout(promise, ms, message) {
  let timeoutId
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), ms)
  })

  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId))
}

function getTodayKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getMonthKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function getRecordMonthKey(record) {
  if (record?.monthKey) return record.monthKey
  if (!record?.createdAt) return ''
  const date = new Date(record.createdAt)
  return Number.isNaN(date.getTime()) ? '' : getMonthKey(date)
}

function normalizeMonthKey(value) {
  const text = String(value || '').trim()
  const match = text.match(/(20\d{2})[-./년\s]*(\d{1,2})/)
  if (!match) return ''
  return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}`
}

function normalizeTags(value) {
  if (Array.isArray(value)) return value.map(tag => String(tag).trim()).filter(Boolean)
  return String(value || '')
    .split(/[\s,]+/)
    .map(tag => tag.trim())
    .filter(Boolean)
    .map(tag => tag.startsWith('#') ? tag : `#${tag}`)
    .slice(0, 5)
}

function buildAiProjectSummaries(records = []) {
  const summaries = new Map()
  records.forEach(record => {
    const projectName = record.projectName || record.taskTitle || '프로젝트 미지정'
    const key = `${record.subteam || 'team'}::${projectName}`
    const current = summaries.get(key) || {
      key,
      subteam: record.subteam || '',
      subteamLabel: record.subteamLabel || getSubteamLabel(record.subteam),
      projectName,
      count: 0,
      hours: 0,
      value: 0,
      records: [],
      tags: new Set(),
      improvements: new Set(),
      months: new Set(),
    }
    current.count += 1
    current.hours += toNumber(record.timeSavedHours)
    current.value += getRecordValueKrw(record)
    current.records.push(record)
    normalizeTags(record.tags).forEach(tag => current.tags.add(tag))
    if (record.improvementTitle || record.taskTitle) {
      current.improvements.add(record.improvementTitle || record.taskTitle)
    }
    const monthKey = getRecordMonthKey(record)
    if (monthKey) current.months.add(monthKey)
    summaries.set(key, current)
  })

  return Array.from(summaries.values())
    .map(project => ({
      ...project,
      tags: Array.from(project.tags),
      improvements: Array.from(project.improvements).slice(0, 6),
      months: Array.from(project.months).sort().reverse(),
      records: project.records.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
    }))
    .sort((a, b) => b.value - a.value)
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

function collectDailyProgressLogs(teamFeed, dateKey) {
  return teamFeed
    .flatMap(member => (member.items || []).flatMap(task => (task.progressLogs || [])
      .filter(log => log.dateKey === dateKey)
      .map(log => ({
        ...log,
        memberUid: member.uid,
        memberName: member.displayName,
        subteam: member.subteam,
        subteamLabel: member.subteamLabel || getSubteamLabel(member.subteam),
        taskId: task.id,
        taskTitle: task.title,
        status: task.status,
        priority: task.priority,
        impact: task.impact,
        dueDate: task.dueDate,
      }))))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
}

function formatKoreanDate(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`)
  if (Number.isNaN(date.getTime())) return dateKey
  return `${date.getFullYear()}년 ${date.getMonth() + 1}/${date.getDate()}`
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
