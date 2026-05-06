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
  Settings,
  ShieldAlert,
  Trash2,
  Users,
} from 'lucide-react'
import { auth, googleProvider, isFirebaseConfigured } from './lib/firebase'
import {
  addAiUsageRecord,
  addIdeaNote,
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
  saveDailyReport,
  seedInitialData,
  shareWeekToTeam,
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
import { daysUntil, formatDate, generateId, getWeekKey, weekKeyToLabel } from './lib/date'
import { requestGemini } from './lib/ai'
import FlowDemoBoard from './FlowDemoBoard'

const VIEWS = [
  { id: 'home', label: '팀장 홈', icon: Home, managerOnly: true },
  { id: 'personal', label: '내 업무', icon: ListChecks },
  { id: 'aiUsage', label: 'AI 활용 기록', icon: Bot },
  { id: 'team', label: '팀 보드', icon: Users },
  { id: 'flow_demo', label: '🧪 흐름 미리보기', icon: Activity },
  { id: 'report', label: '보고 초안', icon: ClipboardList, managerOnly: true },
  { id: 'requests', label: '수정요청사항', icon: MessageSquareText },
  { id: 'admin', label: '구성원 관리', icon: Settings, managerOnly: true },
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
          <PersonalBoard user={user} memberProfile={memberProfile} weekKey={weekKey} weekLabel={weekLabel} />
        )}
        {activeView === 'aiUsage' && (
          <AiUsageBoard user={user} memberProfile={memberProfile} weekKey={weekKey} />
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
        {activeView === 'flow_demo' && <FlowDemoBoard />}
        {activeView === 'requests' && (
          <ChangeRequestBoard user={user} memberProfile={memberProfile} />
        )}
        {canManage && activeView === 'admin' && (
          <AdminBoard currentUser={user} />
        )}
      </div>
    </div>
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
    </main>
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [logText, setLogText] = useState('')
  const [logFileName, setLogFileName] = useState('')
  const [draft, setDraft] = useState({
    subteam: memberProfile?.subteam || 'commerce',
    taskId: '',
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

  const visibleRecords = records.filter(record => teamFilter === 'all' || record.subteam === teamFilter)
  const selectedTask = weekTasks.find(task => task.id === draft.taskId)
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
      subteam: prev.subteam || memberProfile?.subteam || 'commerce',
      taskId: parsed.taskId || prev.taskId,
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

  async function handleSubmit(event) {
    event.preventDefault()
    const form = event.currentTarget
    if (!selectedTask || !draft.useCase.trim()) {
      setError('내 업무에서 AI 활용 기록을 연결할 프로젝트와 AI 활용 내용을 선택/입력해주세요.')
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
        subteam: draft.subteam,
        subteamLabel: getSubteamLabel(draft.subteam),
        taskId: selectedTask.id,
        taskTitle: selectedTask.title,
        taskStatus: selectedTask.status,
        taskPriority: selectedTask.priority,
        taskImpact: selectedTask.impact || '',
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
        subteam: memberProfile?.subteam || 'commerce',
        taskId: '',
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
                  '- 연결 업무: 현대홈쇼핑 신상품런칭',
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

        <Panel title="AI 활용 기록 리스트" icon={ListChecks}>
          <div className="ai-usage-list">
            {visibleRecords.map(record => (
              <article className="ai-usage-card" key={record.id}>
                <div className="note-head">
                  <Badge tone="teal">{record.subteamLabel || getSubteamLabel(record.subteam)}</Badge>
                  <span>{record.authorName || '작성자'} · {formatCommentTime(record.createdAt)}</span>
                </div>
                <h3>{record.taskTitle}</h3>
                <p><strong>활용 방식</strong> {record.useCase}</p>
                {record.output && <p><strong>산출물</strong> {record.output}</p>}
                {record.impact && <p><strong>가치</strong> {record.impact}</p>}
                <div className="ledger-grid">
                  <span>툴: {record.aiTool || '미입력'}</span>
                  <span>절감: {formatNumber(record.timeSavedHours)}h</span>
                  <span>절감비용: {formatKrw(getRecordCostAvoidedKrw(record))}</span>
                  <span>추정가치: {formatKrw(getRecordValueKrw(record))}</span>
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
              </article>
            ))}
            {visibleRecords.length === 0 && <EmptyText text="아직 AI 활용 기록이 없습니다. AI로 진행한 업무와 만들어낸 가치를 기록해보세요." />}
          </div>
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
  }, [member])

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

function TeamHome({ user, weekKey, weekLabel, teamFeed, actionItems, kpis, canManage }) {
  const [subteamFilter, setSubteamFilter] = useState('all')
  const [selectedTaskKey, setSelectedTaskKey] = useState(null)
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
              <div className="action-with-detail" key={`${item.memberUid}-${item.id}`}>
                <FocusTaskRow
                  task={item}
                  active={taskKey(selectedTask) === taskKey(item)}
                  onClick={() => setSelectedTaskKey(taskKey(item))}
                />
                {taskKey(selectedTask) === taskKey(item) && (
                  <TeamTaskDetail
                    task={item}
                    user={user}
                    canManage={canManage}
                    onReplyComment={(commentId, text) => handleReplySharedComment(item, commentId, text)}
                    onDeleteComment={commentId => handleDeleteSharedComment(item, commentId)}
                  />
                )}
              </div>
            ))}
            {focusItems.length === 0 && <EmptyText text="팀원이 공유한 진행 업무가 없습니다." />}
          </div>
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
    <div className="comment-list">
      {comments.map(comment => (
        <article className="comment-item threaded-comment" key={comment.id}>
          <button className="comment-body-button" type="button" onClick={() => setActiveCommentId(activeCommentId === comment.id ? null : comment.id)}>
            <div>
              <strong>{comment.authorName || '작성자'}</strong>
              <span>{formatCommentTime(comment.createdAt)}</span>
            </div>
            <p>{comment.text}</p>
          </button>
          {onDelete && (canManage || comment.authorUid === user?.uid) && (
            <button className="icon-button subtle" onClick={() => onDelete(comment.id)} title="코멘트 삭제">
              <Trash2 size={14} />
            </button>
          )}
          {(comment.replies || []).length > 0 && (
            <div className="reply-list">
              {(comment.replies || []).map(reply => (
                <article className="reply-item" key={reply.id}>
                  <div>
                    <strong>{reply.authorName || '작성자'}</strong>
                    <span>{formatCommentTime(reply.createdAt)}</span>
                  </div>
                  <p>{reply.text}</p>
                </article>
              ))}
            </div>
          )}
          {activeCommentId === comment.id && onReply && (
            <form className="comment-form reply-form" onSubmit={event => handleReply(event, comment.id)}>
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
        </article>
      ))}
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
    if (!permissions.canCreateTask) {
      setTaskError('관리자가 내 업무 작성 권한을 제한했습니다.')
      return
    }
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
        ownerName: getProfileName(user, memberProfile),
        createdAt: now,
        updatedAt: now,
      },
    ]

    setTaskSaving(true)
    try {
      const nextTasksForSave = permissions.canShareTask
        ? nextTasks
        : nextTasks.map(task => task.id === nextTasks[nextTasks.length - 1].id ? { ...task, visibility: 'private' } : task)
      const isTeamTask = draft.visibility !== 'private' && permissions.canShareTask
      await persist(nextTasksForSave)
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

  async function removeTask(taskId) {
    try {
      const targetTask = tasks.find(task => task.id === taskId)
      const imagePaths = (targetTask?.progressLogs || [])
        .flatMap(log => (log.images || []).map(image => image.path))
      if (imagePaths.length > 0) {
        await deleteStorageFiles(imagePaths)
      }
      await persist(tasks.filter(task => task.id !== taskId))
    } catch (error) {
      setTaskError(error.message || '업무 삭제에 실패했습니다.')
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

        <Panel title="이번 주 업무" icon={ListChecks} action={
          <button className="secondary-action" onClick={handleShare} disabled={saving || !permissions.canShareTask}>
            <Send size={15} />
            {saving ? '공유 중' : '팀에 공유'}
          </button>
        }>
          {permissions.canCreateTask ? (
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
                onAddProgress={(text, files) => addTaskProgress(task.id, text, files)}
                onReplyComment={(commentId, text) => addTaskCommentReply(task.id, commentId, text)}
                onDeleteComment={commentId => deleteTaskComment(task.id, commentId)}
                user={user}
                permissions={permissions}
                allTasks={[...tasks, ...history.flatMap(w => w.items || [])]}
              />
            ))}
            {activeTasks.length === 0 && <EmptyText text="진행 중인 이번 주 업무가 없습니다." />}
          </div>
        </Panel>

        <Panel title="오늘의 주요업무" icon={Clock} action={
          <button className="secondary-action" onClick={handlePersonalDailyReport} disabled={dailyReportSaving || todayHighlights.length === 0}>
            <Bot size={15} />
            {dailyReportSaving ? '생성 중' : '보고서 생성'}
          </button>
        }>
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
          {log.text && <p>{log.text}</p>}
          {log.images?.length > 0 && <ImageStrip images={log.images} />}
        </article>
      ))}
    </div>
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
          {kpis.map(kpi => <option key={kpi.id} value={kpi.label}>{kpi.label}</option>)}
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

  const filteredActionItems = actionItems.filter(item => {
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

function TaskEditor({ task, user, permissions, onChange, onComplete, onDelete, expanded, onToggleExpand, onAddComment, onAddProgress, onReplyComment, onDeleteComment, allTasks = [] }) {
  const [progressDraft, setProgressDraft] = useState('')
  const [progressImages, setProgressImages] = useState([])
  const [progressSaving, setProgressSaving] = useState(false)
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

  return (
    <article className={`task-editor status-${task.status} ${task.status === 'done' ? 'done' : ''} ${expanded ? 'expanded' : ''}`}>
      <div className="task-row" onClick={onToggleExpand} role="button" tabIndex={0} onKeyDown={event => event.key === 'Enter' && onToggleExpand()}>
        <div className="task-main">
        <span className={`status-dot ${STATUS_META[task.status]?.tone || 'gray'}`} />
        <div>
          <strong>{task.title}</strong>
          {due !== null && due < 0 && task.status !== 'done' && (
            <span className="delay-badge">지연</span>
          )}
          {(() => {
            const displayName = task.ownerName || user?.displayName || user?.email || ''
            const displayPhoto = task.ownerPhotoURL || user?.photoURL
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
          <div className="badge-row">
            <Badge tone={PRIORITY_META[task.priority]?.tone}>{PRIORITY_META[task.priority]?.label || task.priority}</Badge>
            {task.isFocus && <Badge tone="teal">우선순위</Badge>}
            {task.impact && <Badge tone="green">{task.impact}</Badge>}
            {(task.progressLogs || []).length > 0 && <Badge tone="teal">진행 {(task.progressLogs || []).length}</Badge>}
            <span className="meta-due">{formatDue(task.dueDate)}</span>
            <span className="meta-comments">코멘트 {(task.comments || []).length}</span>
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
          <TaskRelationsEditor task={task} allTasks={allTasks} onChange={onChange} />

          <div className="comment-title">
            <Clock size={16} />
            <strong>{task.title} 오늘 진행내용</strong>
          </div>
          {permissions.canWriteProgress ? (
            <>
              <form className="comment-form progress-form" onSubmit={handleAddProgress}>
                <input
                  value={progressDraft}
                  onChange={event => setProgressDraft(event.target.value)}
                  placeholder="오늘 이 업무에서 진행한 내용, 산출물, 결정사항을 입력하세요"
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
              <article className="comment-item progress-item" key={log.id}>
                <div>
                  <strong>{log.authorName || '작성자'}</strong>
                  <span>{formatCommentTime(log.createdAt)}</span>
                </div>
                {log.text && <p>{log.text}</p>}
                {log.images?.length > 0 && <ImageStrip images={log.images} />}
              </article>
            ))}
            {todayLogs.length === 0 && <EmptyText text="오늘 입력한 진행내용이 없습니다." />}
          </div>

          <div className="comment-title">
            <MessageSquareText size={16} />
            <strong>{task.title} 피드백</strong>
          </div>
          <CommentThread
            comments={(task.comments || []).filter(comment => comment.authorUid !== user?.uid)}
            user={user}
            onReply={onReplyComment}
            onDelete={onDeleteComment}
            emptyText="아직 타인이 남긴 피드백이 없습니다."
          />
        </div>
      )}
    </article>
  )
}

function ActionRow({ item, onStatusChange, onKpiChange, kpis = [], compact = false, active = false, onClick }) {
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
          {(item.ownerName || item.memberName) && (() => {
            const displayName = item.ownerName || item.memberName
            const displayPhoto = item.ownerPhotoURL || item.memberPhotoURL
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
      {(onStatusChange || onKpiChange) && (
        <div className="status-confirm" onClick={event => event.stopPropagation()}>
          {onKpiChange && (
            <select value={item.kpi || item.impact || ''} onChange={event => onKpiChange(event.target.value)} aria-label="연결 KPI">
              <option value="">KPI 미연결</option>
              {kpis.map(kpi => <option key={kpi.id} value={kpi.label}>{kpi.label}</option>)}
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
        </div>
      )}
    </article>
  )
}

function TaskRelationsEditor({ task, allTasks = [], onChange }) {
  const parentIds = task.parentIds || []
  const siblingIds = task.siblingIds || []

  const available = allTasks.filter(t => t.id !== task.id)
  const availableParents = available.filter(t => !parentIds.includes(t.id) && !siblingIds.includes(t.id))
  const availableSiblings = available.filter(t => !siblingIds.includes(t.id) && !parentIds.includes(t.id))

  function getTitle(id) {
    return allTasks.find(t => t.id === id)?.title || '(삭제된 업무)'
  }

  function addParent(value) {
    if (!value || parentIds.includes(value)) return
    onChange({ parentIds: [...parentIds, value] })
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
        <span className="relation-label">상위 (모태)</span>
        <div className="relation-chips">
          {parentIds.map(id => (
            <span key={id} className="relation-chip parent">
              {getTitle(id)}
              <button type="button" onClick={() => removeParent(id)} aria-label="제거">×</button>
            </span>
          ))}
          <select
            className="relation-add"
            value=""
            onChange={event => { addParent(event.target.value); event.target.value = '' }}
          >
            <option value="">+ 상위 업무 추가</option>
            {availableParents.map(t => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="relation-row">
        <span className="relation-label">동위 (병행)</span>
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
            <option value="">+ 동위 업무 추가</option>
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

function KpiSection({ kpis, editable = false }) {
  const [draft, setDraft] = useState({ label: '', target: 100, unit: '%', current: 0 })
  const [error, setError] = useState('')

  async function handleCreate(event) {
    event.preventDefault()
    if (!editable || !draft.label.trim()) return
    setError('')
    try {
      await createKpi(DEFAULT_TEAM_ID, {
        id: generateId('kpi'),
        sortOrder: Date.now(),
        label: draft.label.trim(),
        current: Number(draft.current) || 0,
        target: Number(draft.target) || 100,
        unit: draft.unit.trim() || '%',
        owner: '관리자',
        color: 'teal',
      })
      setDraft({ label: '', target: 100, unit: '%', current: 0 })
    } catch (err) {
      setError(err.message || 'KPI 추가에 실패했습니다.')
    }
  }

  return (
    <Panel title="KPI 바" icon={BarChart3}>
      {editable && (
        <form className="kpi-create-form" onSubmit={handleCreate}>
          <input value={draft.label} onChange={event => setDraft({ ...draft, label: event.target.value })} placeholder="KPI명" />
          <input value={draft.current} onChange={event => setDraft({ ...draft, current: event.target.value })} placeholder="현재값" />
          <input value={draft.target} onChange={event => setDraft({ ...draft, target: event.target.value })} placeholder="목표값" />
          <input value={draft.unit} onChange={event => setDraft({ ...draft, unit: event.target.value })} placeholder="단위" />
          <button className="secondary-action" type="submit">
            <Plus size={15} />
            KPI 추가
          </button>
        </form>
      )}
      {editable && error && <div className="alert error slim">{error}</div>}
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

  async function handleDelete() {
    const ok = window.confirm(`"${kpi.label}" KPI를 삭제할까요?`)
    if (!ok) return
    await deleteKpi(DEFAULT_TEAM_ID, kpi.id)
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
            <button className="icon-button subtle" onClick={handleDelete} title="KPI 삭제">
              <Trash2 size={14} />
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
  const [expandedItems, setExpandedItems] = useState(new Set())
  const toggleItem = (key) => {
    setExpandedItems(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
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
              const progressLogs = item.progressLogs || []
              const comments = item.comments || []
              const hasContent = item.detail || progressLogs.length > 0 || comments.length > 0
              return (
                <article
                  key={itemKey}
                  className={`history-item ${isOpen ? 'expanded' : ''}`}
                  onClick={() => toggleItem(itemKey)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggleItem(itemKey))}
                >
                  <div className="history-item-summary">
                    <strong>{item.title}</strong>
                    <span>시작 {formatHistoryDate(item.createdAt)}</span>
                    <span>완료 {formatHistoryDate(item.completedAt || item.updatedAt)}</span>
                  </div>
                  {isOpen && (
                    <div className="history-item-detail" onClick={e => e.stopPropagation()}>
                      {item.detail && (
                        <div className="history-section">
                          <h4>설명</h4>
                          <p>{item.detail}</p>
                        </div>
                      )}
                      {progressLogs.length > 0 && (
                        <div className="history-section">
                          <h4>진행 내용 ({progressLogs.length})</h4>
                          {progressLogs.map(log => (
                            <div key={log.id} className="history-log">
                              <span className="history-log-date">{formatHistoryDate(log.createdAt)}</span>
                              <p>{log.text || log.note || ''}</p>
                              {log.images?.length > 0 && <ImageStrip images={log.images} />}
                            </div>
                          ))}
                        </div>
                      )}
                      {comments.length > 0 && (
                        <div className="history-section">
                          <h4>코멘트 ({comments.length})</h4>
                          {comments.map(comment => (
                            <div key={comment.id} className="history-comment">
                              <div className="history-comment-head">
                                <strong>{comment.authorName || '작성자 미상'}</strong>
                                <span>{formatHistoryDate(comment.createdAt)}</span>
                              </div>
                              <p>{comment.text}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {!hasContent && (
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
    '# AI 업무 로그',
    `- 연결 업무: ${task?.title || '내 업무 프로젝트명'}`,
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
