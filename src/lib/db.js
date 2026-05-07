import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
} from 'firebase/storage'
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db, isFirebaseConfigured, storage } from './firebase'
import { INITIAL_ACTION_ITEMS, INITIAL_KPIS, getSubteamLabel } from './constants'

function assertDb() {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase 환경변수가 아직 설정되지 않았습니다.')
  }
}

function assertStorage() {
  if (!isFirebaseConfigured || !storage) {
    throw new Error('Firebase Storage 환경변수가 아직 설정되지 않았습니다.')
  }
}

function safeFileName(name) {
  return String(name || 'progress-image.jpg')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .slice(0, 80)
}

export async function uploadProgressImages(teamId, uid, weekKey, taskId, progressId, files) {
  assertStorage()
  const uploads = Array.from(files || []).map(async (file, index) => {
    const name = safeFileName(file.name)
    const path = `teams/${teamId}/members/${uid}/weeks/${weekKey}/tasks/${taskId}/progress/${progressId}/${Date.now()}-${index}-${name}`
    const fileRef = storageRef(storage, path)
    await uploadBytes(fileRef, file, {
      contentType: file.type || 'image/jpeg',
      customMetadata: {
        teamId,
        uid,
        weekKey,
        taskId,
        progressId,
      },
    })
    const url = await getDownloadURL(fileRef)
    return {
      url,
      path,
      name,
      size: file.size,
      contentType: file.type || 'image/jpeg',
    }
  })

  return Promise.all(uploads)
}

export async function uploadChangeRequestImages(teamId, uid, requestId, files) {
  assertStorage()
  const uploads = Array.from(files || []).map(async (file, index) => {
    const name = safeFileName(file.name)
    const path = `teams/${teamId}/changeRequests/${requestId}/${uid}/${Date.now()}-${index}-${name}`
    const fileRef = storageRef(storage, path)
    await uploadBytes(fileRef, file, {
      contentType: file.type || 'image/jpeg',
      customMetadata: {
        teamId,
        uid,
        requestId,
      },
    })
    const url = await getDownloadURL(fileRef)
    return {
      url,
      path,
      name,
      size: file.size,
      contentType: file.type || 'image/jpeg',
    }
  })

  return Promise.all(uploads)
}

export async function deleteStorageFiles(paths = []) {
  assertStorage()
  await Promise.all(paths.filter(Boolean).map(path => deleteObject(storageRef(storage, path))))
}

export async function ensureTeamAndMember(teamId, user) {
  assertDb()
  const memberRef = doc(db, 'teams', teamId, 'members', user.uid)
  const existingSnap = await getDoc(memberRef)
  const existing = existingSnap.exists() ? existingSnap.data() : {}
  await setDoc(memberRef, {
    uid: user.uid,
    displayName: existing.displayName || user.displayName || user.email || '이름 없음',
    email: user.email || '',
    photoURL: user.photoURL || '',
    role: existing.role || 'member',
    title: existing.title || '팀원',
    permissions: existing.permissions || {},
    updatedAt: serverTimestamp(),
  }, { merge: true })

  await setDoc(doc(db, 'teams', teamId), {
    name: 'NST BIO 커머스팀',
    teamId,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

export async function seedInitialData(teamId) {
  assertDb()
  const actionSnap = await getDocs(collection(db, 'teams', teamId, 'actionItems'))
  const kpiSnap = await getDocs(collection(db, 'teams', teamId, 'kpis'))
  const batch = writeBatch(db)

  if (actionSnap.empty) {
    INITIAL_ACTION_ITEMS.forEach(item => {
      batch.set(doc(db, 'teams', teamId, 'actionItems', item.id), {
        ...item,
        done: item.status === 'done',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    })
  }

  if (kpiSnap.empty) {
    INITIAL_KPIS.forEach(kpi => {
      batch.set(doc(db, 'teams', teamId, 'kpis', kpi.id), {
        ...kpi,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    })
  }

  if (actionSnap.empty || kpiSnap.empty) {
    await batch.commit()
  }
}

export function subscribeWeekTasks(teamId, uid, weekKey, callback) {
  assertDb()
  const ref = doc(db, 'teams', teamId, 'members', uid, 'weeks', weekKey)
  return onSnapshot(ref, snap => {
    const items = snap.exists() ? (snap.data().items || []) : []
    callback(items.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')))
  })
}

export function subscribeMemberProfile(teamId, uid, callback) {
  assertDb()
  return onSnapshot(doc(db, 'teams', teamId, 'members', uid), snap => {
    callback(snap.exists() ? snap.data() : null)
  })
}

export function subscribeMembers(teamId, callback) {
  assertDb()
  const membersRef = collection(db, 'teams', teamId, 'members')
  return onSnapshot(query(membersRef, orderBy('displayName', 'asc')), snap => {
    callback(snap.docs.map(item => ({ id: item.id, ...item.data() })))
  })
}

export async function updateMemberProfile(teamId, uid, patch) {
  assertDb()
  const nextPatch = { ...patch }
  if (Object.prototype.hasOwnProperty.call(patch, 'subteam')) {
    nextPatch.subteamLabel = getSubteamLabel(patch.subteam)
    nextPatch.subteamLocked = true
  }
  await setDoc(doc(db, 'teams', teamId, 'members', uid), {
    ...nextPatch,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

export async function updateMemberSubteam(teamId, uid, subteam) {
  assertDb()
  await setDoc(doc(db, 'teams', teamId, 'members', uid), {
    subteam,
    subteamLabel: getSubteamLabel(subteam),
    subteamLocked: true,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

// 특정 주차의 단일 task 업데이트 (history task의 KPI 변경 등에 사용)
export async function updateTaskInWeek(teamId, uid, weekKey, taskId, patch) {
  assertDb()
  const ref = doc(db, 'teams', teamId, 'members', uid, 'weeks', weekKey)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    throw new Error(`주차(${weekKey}) 데이터가 없습니다.`)
  }
  const items = snap.data().items || []
  const target = items.find(i => i.id === taskId)
  if (!target) {
    throw new Error(`업무(id=${taskId})를 ${weekKey} 주차에서 찾지 못했습니다.`)
  }
  const nextItems = items.map(item => {
    if (item.id !== taskId) return item
    return {
      ...item,
      ...patch,
      updatedAt: new Date().toISOString(),
    }
  })
  await setDoc(ref, {
    items: nextItems,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

// === 공동 관리 (B안: 양방향 미러링) ===
// 한 task를 여러 owner의 weeks에 추가 — 신규 공유 task 생성 또는 기존 task 신규 공유에 사용
// task: 저장할 task 객체. coOwnerUids는 task에 이미 포함되어 있어야 함.
export async function mirrorTaskToOwners(teamId, ownerUids, weekKey, task) {
  assertDb()
  if (!Array.isArray(ownerUids) || ownerUids.length === 0) return { mirrored: 0 }
  const uniqueUids = Array.from(new Set(ownerUids.filter(Boolean)))
  const batch = writeBatch(db)
  for (const uid of uniqueUids) {
    const ref = doc(db, 'teams', teamId, 'members', uid, 'weeks', weekKey)
    const snap = await getDoc(ref)
    const items = snap.exists() ? (snap.data().items || []) : []
    const exists = items.some(i => i.id === task.id)
    const nextItems = exists
      ? items.map(i => i.id === task.id ? { ...i, ...task, updatedAt: new Date().toISOString() } : i)
      : [...items, { ...task, updatedAt: task.updatedAt || new Date().toISOString() }]
    batch.set(ref, { items: nextItems, updatedAt: serverTimestamp() }, { merge: true })
  }
  await batch.commit()
  return { mirrored: uniqueUids.length }
}

// 공유 task에 patch 적용 — 모든 coOwner의 weeks에 동시 반영
// patch는 부분 업데이트 (예: { status: 'doing' })
export async function syncTaskPatchAcrossOwners(teamId, ownerUids, weekKey, taskId, patch) {
  assertDb()
  if (!Array.isArray(ownerUids) || ownerUids.length === 0) return { synced: 0 }
  const uniqueUids = Array.from(new Set(ownerUids.filter(Boolean)))
  const now = new Date().toISOString()
  const batch = writeBatch(db)
  let writes = 0
  for (const uid of uniqueUids) {
    const ref = doc(db, 'teams', teamId, 'members', uid, 'weeks', weekKey)
    const snap = await getDoc(ref)
    if (!snap.exists()) continue
    const items = snap.data().items || []
    if (!items.some(i => i.id === taskId)) continue
    const nextItems = items.map(item => {
      if (item.id !== taskId) return item
      const nextStatus = patch.status || item.status
      return {
        ...item,
        ...patch,
        completedAt: nextStatus === 'done' ? (item.completedAt || now) : null,
        updatedAt: now,
      }
    })
    batch.set(ref, { items: nextItems, updatedAt: serverTimestamp() }, { merge: true })
    writes += 1
  }
  if (writes > 0) await batch.commit()
  return { synced: writes }
}

// 공유 task를 모든 coOwner의 weeks에서 제거 — 완전 삭제 (unshare가 아니라 task 삭제)
export async function deleteTaskAcrossOwners(teamId, ownerUids, weekKey, taskId) {
  assertDb()
  if (!Array.isArray(ownerUids) || ownerUids.length === 0) return { deleted: 0 }
  const uniqueUids = Array.from(new Set(ownerUids.filter(Boolean)))
  const batch = writeBatch(db)
  let writes = 0
  for (const uid of uniqueUids) {
    const ref = doc(db, 'teams', teamId, 'members', uid, 'weeks', weekKey)
    const snap = await getDoc(ref)
    if (!snap.exists()) continue
    const items = snap.data().items || []
    if (!items.some(i => i.id === taskId)) continue
    const nextItems = items.filter(i => i.id !== taskId)
    batch.set(ref, { items: nextItems, updatedAt: serverTimestamp() }, { merge: true })
    writes += 1
  }
  if (writes > 0) await batch.commit()
  return { deleted: writes }
}

// 한 owner를 공유에서 제외 — 그 owner의 weeks에서 task 제거 + 남은 owner들의 coOwnerUids 갱신
export async function unshareTaskFromOwner(teamId, allOwnerUids, weekKey, taskId, removeUid) {
  assertDb()
  const remainOwners = (allOwnerUids || []).filter(u => u && u !== removeUid)
  const batch = writeBatch(db)
  // 1) 제거 대상 owner의 weeks에서 task 삭제
  const removeRef = doc(db, 'teams', teamId, 'members', removeUid, 'weeks', weekKey)
  const removeSnap = await getDoc(removeRef)
  if (removeSnap.exists()) {
    const items = removeSnap.data().items || []
    const nextItems = items.filter(i => i.id !== taskId)
    batch.set(removeRef, { items: nextItems, updatedAt: serverTimestamp() }, { merge: true })
  }
  // 2) 남은 owner들의 task에 coOwnerUids 갱신
  for (const uid of remainOwners) {
    const ref = doc(db, 'teams', teamId, 'members', uid, 'weeks', weekKey)
    const snap = await getDoc(ref)
    if (!snap.exists()) continue
    const items = snap.data().items || []
    if (!items.some(i => i.id === taskId)) continue
    const nextItems = items.map(item => {
      if (item.id !== taskId) return item
      return {
        ...item,
        coOwnerUids: remainOwners,
        updatedAt: new Date().toISOString(),
      }
    })
    batch.set(ref, { items: nextItems, updatedAt: serverTimestamp() }, { merge: true })
  }
  await batch.commit()
  return { remainOwners }
}

// 정기 반복 task 자동 복제
// 이전 주차(들)에서 recurrence 설정된 task를 찾아 이번 주차에 없으면 자동 복제
export async function ensureRecurringTasksForWeek(teamId, uid, currentWeekKey, prevWeekKeysByType) {
  assertDb()
  if (!currentWeekKey || !prevWeekKeysByType) return { copied: 0 }
  const currRef = doc(db, 'teams', teamId, 'members', uid, 'weeks', currentWeekKey)
  const currSnap = await getDoc(currRef)
  const currItems = currSnap.exists() ? (currSnap.data().items || []) : []

  // 이미 복제된 task ID 추적용 — parentIds에 이전 주차 task ID가 있으면 복제 완료
  const alreadyCopiedParentIds = new Set()
  currItems.forEach(t => {
    ;(t.parentIds || []).forEach(pid => alreadyCopiedParentIds.add(pid))
  })

  const newTasks = []
  // type별로 이전 주차 doc 조회
  for (const [type, prevKey] of Object.entries(prevWeekKeysByType)) {
    if (!prevKey) continue
    const prevRef = doc(db, 'teams', teamId, 'members', uid, 'weeks', prevKey)
    const prevSnap = await getDoc(prevRef)
    if (!prevSnap.exists()) continue
    const prevItems = prevSnap.data().items || []

    prevItems.forEach(prev => {
      if (!prev.recurrence || prev.recurrence.type !== type) return
      if (alreadyCopiedParentIds.has(prev.id)) return
      // 이번 주에 새로 생성
      const id = `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
      newTasks.push({
        id,
        title: prev.title,
        detail: prev.detail || '',
        kpi: prev.kpi || prev.impact || '',
        impact: prev.impact || prev.kpi || '',
        parentIds: [prev.id],
        siblingIds: [],
        status: 'todo',
        priority: prev.priority || 'normal',
        recurrence: prev.recurrence,
        visibility: prev.visibility || 'team',
        isFocus: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    })
  }

  if (newTasks.length === 0) return { copied: 0 }

  const merged = [...currItems, ...newTasks]
  await setDoc(currRef, {
    items: merged,
    updatedAt: serverTimestamp(),
  }, { merge: true })
  return { copied: newTasks.length, titles: newTasks.map(t => t.title) }
}

export async function saveWeekTasks(teamId, uid, weekKey, items) {
  assertDb()
  const ref = doc(db, 'teams', teamId, 'members', uid, 'weeks', weekKey)
  await setDoc(ref, {
    items,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

export async function getTaskHistory(teamId, uid) {
  assertDb()
  const weeksRef = collection(db, 'teams', teamId, 'members', uid, 'weeks')
  const snap = await getDocs(query(weeksRef, orderBy('updatedAt', 'desc')))
  return snap.docs.map(item => ({
    weekKey: item.id,
    items: item.data().items || [],
  }))
}

export async function shareWeekToTeam(teamId, uid, weekKey, user, memberProfile, items) {
  assertDb()
  const ref = doc(db, 'teams', teamId, 'weeks', weekKey, 'shared', uid)
  const existingSnap = await getDoc(ref)
  const existingItems = existingSnap.exists() ? (existingSnap.data().items || []) : []
  const existingCommentsByTask = new Map(existingItems.map(item => [item.id, item.comments || []]))
  const visibleItems = items
    .filter(item => item.visibility !== 'private')
    .map(item => ({
      ...item,
      comments: item.comments?.length ? item.comments : (existingCommentsByTask.get(item.id) || []),
    }))
  const doneCount = visibleItems.filter(item => item.status === 'done').length
  const completionRate = visibleItems.length > 0 ? Math.round((doneCount / visibleItems.length) * 100) : 0

  await setDoc(ref, {
    uid,
    displayName: memberProfile?.displayName || user.displayName || user.email || '이름 없음',
    email: user.email || '',
    photoURL: user.photoURL || '',
    subteam: memberProfile?.subteam || '',
    subteamLabel: memberProfile?.subteamLabel || getSubteamLabel(memberProfile?.subteam),
    items: visibleItems,
    completionRate,
    sharedAt: serverTimestamp(),
  }, { merge: true })
}

export async function addSharedTaskComment(teamId, weekKey, memberUid, taskId, comment) {
  assertDb()
  const ref = doc(db, 'teams', teamId, 'weeks', weekKey, 'shared', memberUid)
  const memberWeekRef = doc(db, 'teams', teamId, 'members', memberUid, 'weeks', weekKey)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    throw new Error('팀 공유 업무를 찾을 수 없습니다.')
  }

  const applyComment = items => (items || []).map(item => {
    if (item.id !== taskId) return item
    return {
      ...item,
      comments: [...(item.comments || []), comment],
      updatedAt: new Date().toISOString(),
    }
  })
  const nextItems = applyComment(snap.data().items)

  await setDoc(ref, {
    items: nextItems,
    updatedAt: serverTimestamp(),
  }, { merge: true })

  const memberWeekSnap = await getDoc(memberWeekRef)
  if (memberWeekSnap.exists()) {
    await setDoc(memberWeekRef, {
      items: applyComment(memberWeekSnap.data().items),
      updatedAt: serverTimestamp(),
    }, { merge: true })
  }
}

export async function addSharedTaskCommentReply(teamId, weekKey, memberUid, taskId, commentId, reply) {
  assertDb()
  const ref = doc(db, 'teams', teamId, 'weeks', weekKey, 'shared', memberUid)
  const memberWeekRef = doc(db, 'teams', teamId, 'members', memberUid, 'weeks', weekKey)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    throw new Error('팀 공유 업무를 찾을 수 없습니다.')
  }

  const applyReply = items => (items || []).map(item => {
    if (item.id !== taskId) return item
    return {
      ...item,
      comments: (item.comments || []).map(comment => {
        if (comment.id !== commentId) return comment
        return {
          ...comment,
          replies: [...(comment.replies || []), reply],
        }
      }),
      updatedAt: new Date().toISOString(),
    }
  })
  const nextItems = applyReply(snap.data().items)

  await setDoc(ref, {
    items: nextItems,
    updatedAt: serverTimestamp(),
  }, { merge: true })

  const memberWeekSnap = await getDoc(memberWeekRef)
  if (memberWeekSnap.exists()) {
    await setDoc(memberWeekRef, {
      items: applyReply(memberWeekSnap.data().items),
      updatedAt: serverTimestamp(),
    }, { merge: true })
  }
}

export async function deleteSharedTaskComment(teamId, weekKey, memberUid, taskId, commentId) {
  assertDb()
  const ref = doc(db, 'teams', teamId, 'weeks', weekKey, 'shared', memberUid)
  const memberWeekRef = doc(db, 'teams', teamId, 'members', memberUid, 'weeks', weekKey)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    throw new Error('팀 공유 업무를 찾을 수 없습니다.')
  }

  const applyDelete = items => (items || []).map(item => {
    if (item.id !== taskId) return item
    return {
      ...item,
      comments: (item.comments || []).filter(comment => comment.id !== commentId),
      updatedAt: new Date().toISOString(),
    }
  })
  const nextItems = applyDelete(snap.data().items)

  await setDoc(ref, {
    items: nextItems,
    updatedAt: serverTimestamp(),
  }, { merge: true })

  const memberWeekSnap = await getDoc(memberWeekRef)
  if (memberWeekSnap.exists()) {
    await setDoc(memberWeekRef, {
      items: applyDelete(memberWeekSnap.data().items),
      updatedAt: serverTimestamp(),
    }, { merge: true })
  }
}

export async function updateSharedTaskFields(teamId, weekKey, memberUid, taskId, patch) {
  assertDb()
  const now = new Date().toISOString()
  const sharedRef = doc(db, 'teams', teamId, 'weeks', weekKey, 'shared', memberUid)
  const memberWeekRef = doc(db, 'teams', teamId, 'members', memberUid, 'weeks', weekKey)

  const updateItems = items => (items || []).map(item => {
    if (item.id !== taskId) return item
    const nextStatus = patch.status || item.status
    return {
      ...item,
      ...patch,
      completedAt: nextStatus === 'done' ? (item.completedAt || now) : null,
      updatedAt: now,
    }
  })

  const sharedSnap = await getDoc(sharedRef)
  if (!sharedSnap.exists()) {
    throw new Error('팀 공유 업무를 찾을 수 없습니다.')
  }
  const nextSharedItems = updateItems(sharedSnap.data().items)
  const doneCount = nextSharedItems.filter(item => item.status === 'done').length
  const completionRate = nextSharedItems.length > 0 ? Math.round((doneCount / nextSharedItems.length) * 100) : 0

  await setDoc(sharedRef, {
    items: nextSharedItems,
    completionRate,
    updatedAt: serverTimestamp(),
  }, { merge: true })

  const memberWeekSnap = await getDoc(memberWeekRef)
  if (memberWeekSnap.exists()) {
    await setDoc(memberWeekRef, {
      items: updateItems(memberWeekSnap.data().items),
      updatedAt: serverTimestamp(),
    }, { merge: true })
  }
}

export function subscribeTeamFeed(teamId, weekKey, callback) {
  assertDb()
  const sharedRef = collection(db, 'teams', teamId, 'weeks', weekKey, 'shared')
  return onSnapshot(sharedRef, snap => {
    const members = snap.docs.map(item => ({ id: item.id, ...item.data() }))
    members.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''))
    callback(members)
  })
}

export function subscribeActionItems(teamId, callback) {
  assertDb()
  const actionRef = collection(db, 'teams', teamId, 'actionItems')
  return onSnapshot(query(actionRef, orderBy('sortOrder', 'asc')), snap => {
    callback(snap.docs.map(item => ({ id: item.id, ...item.data() })))
  })
}

export async function updateActionItemStatus(teamId, itemId, status) {
  assertDb()
  await updateDoc(doc(db, 'teams', teamId, 'actionItems', itemId), {
    status,
    done: status === 'done',
    updatedAt: serverTimestamp(),
  })
}

export async function createActionItem(teamId, item) {
  assertDb()
  await setDoc(doc(db, 'teams', teamId, 'actionItems', item.id), {
    ...item,
    done: item.status === 'done',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function updateActionItemFields(teamId, itemId, patch) {
  assertDb()
  const nextPatch = { ...patch }
  if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
    nextPatch.done = patch.status === 'done'
  }
  await setDoc(doc(db, 'teams', teamId, 'actionItems', itemId), {
    ...nextPatch,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

// === Audit Logs (관리자 페이지에서 누적 조회) ===
// 모든 삭제/복원/영구삭제/권한변경 이벤트를 누적 기록
// teams/{teamId}/auditLogs/{autoId}
export async function addAuditLog(teamId, log) {
  assertDb()
  const id = generateLogId()
  const ref = doc(db, 'teams', teamId, 'auditLogs', id)
  await setDoc(ref, {
    id,
    timestamp: new Date().toISOString(),
    serverTs: serverTimestamp(),
    ...log,
  })
}

export function subscribeAuditLogs(teamId, callback, max = 200) {
  assertDb()
  const ref = collection(db, 'teams', teamId, 'auditLogs')
  return onSnapshot(query(ref, orderBy('timestamp', 'desc')), snap => {
    const items = snap.docs.slice(0, max).map(d => ({ id: d.id, ...d.data() }))
    callback(items)
  })
}

function generateLogId() {
  return `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

// === Soft delete (휴지통) — 진행 프로젝트 ===
// deletedAt + deletedBy + deletedByName 필드 추가, 일반 list에서는 자동 필터링됨
// audit log도 함께 기록
export async function softDeleteActionItem(teamId, itemId, deletedBy, deletedByName, snapshotData) {
  assertDb()
  await setDoc(doc(db, 'teams', teamId, 'actionItems', itemId), {
    deletedAt: new Date().toISOString(),
    deletedBy: deletedBy || '',
    deletedByName: deletedByName || '',
    updatedAt: serverTimestamp(),
  }, { merge: true })
  // 감사 로그
  await addAuditLog(teamId, {
    action: 'soft_delete',
    target: 'actionItem',
    targetId: itemId,
    targetTitle: snapshotData?.title || '',
    actorUid: deletedBy || '',
    actorName: deletedByName || '',
  })
}

// 휴지통에서 복원 — deletedAt 필드 제거 + audit log
export async function restoreActionItem(teamId, itemId, restoredBy, restoredByName, snapshotData) {
  assertDb()
  const { deleteField } = await import('firebase/firestore')
  await setDoc(doc(db, 'teams', teamId, 'actionItems', itemId), {
    deletedAt: deleteField(),
    deletedBy: deleteField(),
    deletedByName: deleteField(),
    updatedAt: serverTimestamp(),
  }, { merge: true })
  await addAuditLog(teamId, {
    action: 'restore',
    target: 'actionItem',
    targetId: itemId,
    targetTitle: snapshotData?.title || '',
    actorUid: restoredBy || '',
    actorName: restoredByName || '',
  })
}

// 영구 삭제 + audit log
export async function hardDeleteActionItem(teamId, itemId, purgedBy, purgedByName, snapshotData) {
  assertDb()
  await deleteDoc(doc(db, 'teams', teamId, 'actionItems', itemId))
  // audit log는 doc 삭제 후에 별도 기록 (실패해도 doc 삭제는 이미 완료)
  try {
    await addAuditLog(teamId, {
      action: 'hard_delete',
      target: 'actionItem',
      targetId: itemId,
      targetTitle: snapshotData?.title || '',
      actorUid: purgedBy || 'auto',
      actorName: purgedByName || 'auto-purge',
    })
  } catch (err) {
    console.warn('[감사로그 기록 실패]', err.message)
  }
}

export async function addActionItemComment(teamId, itemId, comment) {
  assertDb()
  const ref = doc(db, 'teams', teamId, 'actionItems', itemId)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    throw new Error('대표님 지시사항 업무를 찾을 수 없습니다.')
  }

  await setDoc(ref, {
    comments: [...(snap.data().comments || []), comment],
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

export async function addActionItemCommentReply(teamId, itemId, commentId, reply) {
  assertDb()
  const ref = doc(db, 'teams', teamId, 'actionItems', itemId)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    throw new Error('진행 프로젝트를 찾을 수 없습니다.')
  }

  await setDoc(ref, {
    comments: (snap.data().comments || []).map(comment => {
      if (comment.id !== commentId) return comment
      return {
        ...comment,
        replies: [...(comment.replies || []), reply],
      }
    }),
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

export async function deleteActionItemComment(teamId, itemId, commentId) {
  assertDb()
  const ref = doc(db, 'teams', teamId, 'actionItems', itemId)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    throw new Error('진행 프로젝트를 찾을 수 없습니다.')
  }

  await setDoc(ref, {
    comments: (snap.data().comments || []).filter(comment => comment.id !== commentId),
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

const KPI_STATUS_FACTOR = {
  done: 1,
  review: 0.8,
  doing: 0.5,
  todo: 0,
  blocked: 0,
}

export function computeKpiProgressFromActions(kpiId, actionItems = []) {
  let totalWeight = 0
  let weightedProgress = 0
  for (const item of actionItems) {
    const link = (item.kpiLinks || []).find(l => l && l.kpiId === kpiId)
    if (!link) continue
    const weight = Number(link.weight) || 0
    if (weight <= 0) continue
    const factor = KPI_STATUS_FACTOR[item.status] ?? 0
    totalWeight += weight
    weightedProgress += weight * factor
  }
  if (totalWeight === 0) return null
  return Math.round((weightedProgress / totalWeight) * 100)
}

export function subscribeKpis(teamId, callback) {
  assertDb()
  const kpiRef = collection(db, 'teams', teamId, 'kpis')
  return onSnapshot(query(kpiRef, orderBy('sortOrder', 'asc')), snap => {
    callback(snap.docs.map(item => ({ id: item.id, ...item.data() })))
  })
}

export async function updateKpiValue(teamId, kpiId, current) {
  assertDb()
  await updateDoc(doc(db, 'teams', teamId, 'kpis', kpiId), {
    current: Number(current),
    updatedAt: serverTimestamp(),
  })
}

export async function createKpi(teamId, kpi) {
  assertDb()
  await setDoc(doc(db, 'teams', teamId, 'kpis', kpi.id), {
    ...kpi,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function deleteKpi(teamId, kpiId) {
  assertDb()
  await deleteDoc(doc(db, 'teams', teamId, 'kpis', kpiId))
}

export function subscribeDailyReport(teamId, dateKey, callback) {
  assertDb()
  return onSnapshot(doc(db, 'teams', teamId, 'reports', `daily-${dateKey}`), snap => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null)
  })
}

export function subscribeDailyReports(teamId, callback) {
  assertDb()
  const reportsRef = collection(db, 'teams', teamId, 'reports')
  return onSnapshot(query(reportsRef, orderBy('dateKey', 'desc')), snap => {
    callback(snap.docs.map(item => ({ id: item.id, ...item.data() })))
  })
}

export async function saveDailyReport(teamId, dateKey, report) {
  assertDb()
  await setDoc(doc(db, 'teams', teamId, 'reports', `daily-${dateKey}`), {
    ...report,
    dateKey,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

export function subscribeIdeaNotes(teamId, uid, callback) {
  assertDb()
  const notesRef = collection(db, 'teams', teamId, 'members', uid, 'notes')
  return onSnapshot(query(notesRef, orderBy('createdAt', 'desc')), snap => {
    callback(snap.docs.map(item => ({ id: item.id, ...item.data() })))
  })
}

export async function addIdeaNote(teamId, uid, note) {
  assertDb()
  await setDoc(doc(db, 'teams', teamId, 'members', uid, 'notes', note.id), {
    ...note,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function deleteIdeaNote(teamId, uid, noteId) {
  assertDb()
  await deleteDoc(doc(db, 'teams', teamId, 'members', uid, 'notes', noteId))
}

// === 개인 KPI ===
// 팀 KPI(teams/{teamId}/kpis/...) 와 별도로 사용자별 KPI를 보관
// 경로: teams/{teamId}/members/{uid}/kpis/{kpiId}

export function subscribePersonalKpis(teamId, uid, callback) {
  assertDb()
  const ref = collection(db, 'teams', teamId, 'members', uid, 'kpis')
  return onSnapshot(query(ref, orderBy('sortOrder', 'asc')), snap => {
    callback(snap.docs.map(item => ({ id: item.id, ...item.data() })))
  })
}

export async function createPersonalKpi(teamId, uid, kpi) {
  assertDb()
  await setDoc(doc(db, 'teams', teamId, 'members', uid, 'kpis', kpi.id), {
    ...kpi,
    scope: 'personal',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function deletePersonalKpi(teamId, uid, kpiId) {
  assertDb()
  await deleteDoc(doc(db, 'teams', teamId, 'members', uid, 'kpis', kpiId))
}

// 홈/팀장 시점에서 모든 팀원의 개인 KPI를 한 번에 구독
// 인덱스 필요할 수 있음 (collectionGroup + scope filter)
export function subscribeAllPersonalKpis(teamId, callback) {
  assertDb()
  // collectionGroup로 모든 'kpis' 서브컬렉션 검색
  const q = query(collectionGroup(db, 'kpis'), where('scope', '==', 'personal'))
  return onSnapshot(q, snap => {
    const items = snap.docs
      .filter(d => d.ref.path.startsWith(`teams/${teamId}/members/`))
      .map(d => {
        const segments = d.ref.path.split('/')
        // path: teams/{teamId}/members/{uid}/kpis/{kpiId}
        const memberUid = segments[3] || ''
        return { id: d.id, ...d.data(), _memberUid: memberUid }
      })
    callback(items)
  }, error => {
    console.error('[subscribeAllPersonalKpis] 구독 실패 (collectionGroup 인덱스 필요할 수 있음):', error)
    callback([])
  })
}

export function subscribeFlowSnapshots(teamId, uid, callback) {
  assertDb()
  const ref = collection(db, 'teams', teamId, 'members', uid, 'flowSnapshots')
  return onSnapshot(query(ref, orderBy('updatedAt', 'desc')), snap => {
    callback(snap.docs.map(item => ({ id: item.id, ...item.data() })))
  })
}

export async function saveFlowSnapshot(teamId, uid, snapshotId, data) {
  assertDb()
  const ref = doc(db, 'teams', teamId, 'members', uid, 'flowSnapshots', snapshotId)
  const exists = await getDoc(ref)
  await setDoc(ref, {
    ...data,
    createdAt: exists.exists() ? exists.data().createdAt : serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

export async function deleteFlowSnapshot(teamId, uid, snapshotId) {
  assertDb()
  await deleteDoc(doc(db, 'teams', teamId, 'members', uid, 'flowSnapshots', snapshotId))
}

export function subscribeChangeRequests(teamId, callback) {
  assertDb()
  const requestsRef = collection(db, 'teams', teamId, 'changeRequests')
  return onSnapshot(query(requestsRef, orderBy('createdAt', 'desc')), snap => {
    callback(snap.docs.map(item => ({ id: item.id, ...item.data() })))
  })
}

export async function addChangeRequest(teamId, request) {
  assertDb()
  await setDoc(doc(db, 'teams', teamId, 'changeRequests', request.id), {
    ...request,
    updatedAt: serverTimestamp(),
  })
}

export function subscribeAiUsageRecords(teamId, callback) {
  assertDb()
  const recordsRef = collection(db, 'teams', teamId, 'aiUsageRecords')
  return onSnapshot(query(recordsRef, orderBy('createdAt', 'desc')), snap => {
    callback(snap.docs.map(item => ({ id: item.id, ...item.data() })))
  })
}

export async function addAiUsageRecord(teamId, record) {
  assertDb()
  await setDoc(doc(db, 'teams', teamId, 'aiUsageRecords', record.id), {
    ...record,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteAiUsageRecord(teamId, recordId) {
  assertDb()
  await deleteDoc(doc(db, 'teams', teamId, 'aiUsageRecords', recordId))
}

// === 주간 자동 회고 ===
export function subscribeWeeklyRetros(teamId, callback) {
  assertDb()
  const ref = collection(db, 'teams', teamId, 'weeklyRetros')
  return onSnapshot(ref, snapshot => {
    const items = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.weekKey || '').localeCompare(a.weekKey || ''))
    callback(items)
  })
}

export async function saveWeeklyRetro(teamId, weekKey, data) {
  assertDb()
  await setDoc(doc(db, 'teams', teamId, 'weeklyRetros', weekKey), {
    ...data,
    weekKey,
    generatedAt: data.generatedAt || new Date().toISOString(),
    updatedAt: serverTimestamp(),
  })
}

export async function deleteWeeklyRetro(teamId, weekKey) {
  assertDb()
  await deleteDoc(doc(db, 'teams', teamId, 'weeklyRetros', weekKey))
}
