import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
} from 'firebase/storage'
import {
  collection,
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
