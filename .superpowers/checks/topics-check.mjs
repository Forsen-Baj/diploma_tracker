import { actAs, createCleanup, grantRoles, makeStaff, removeGroup } from './checkCleanup.mjs'

const API = 'http://localhost:5000'
const stamp = Date.now().toString().slice(-6)
const results = []
const authCalls = []
const cleanup = createCleanup()

function check(name, actual, expected) {
  const ok = actual === expected
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`)
}

async function paceAuth() {
  const now = Date.now()
  while (authCalls.length && now - authCalls[0] > 61_000) authCalls.shift()
  if (authCalls.length >= 9) {
    const wait = 61_000 - (now - authCalls[0])
    console.log(`... waiting ${Math.ceil(wait / 1000)}s for the rate-limit window`)
    await new Promise((resolve) => setTimeout(resolve, wait))
    authCalls.length = 0
  }
  authCalls.push(Date.now())
}

async function call(method, path, { token, json } = {}) {
  if (path === '/api/auth/login') await paceAuth()
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (json !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(API + path, { method, headers, body: json === undefined ? undefined : JSON.stringify(json) })
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { status: response.status, body }
}

const login = async (email, password) => (await call('POST', '/api/auth/login', { json: { email, password } })).body.token

async function runChecks() {
const admin = await login('admin@diploma.local', 'Admin123!')
const teacher = await login('teacher@diploma.local', 'Teacher123!')

const groups = (await call('GET', '/api/groups', { token: admin })).body
const seedGroup = groups.find((g) => g.code === 'SEED-A')
const departmentId = seedGroup.departmentId
// Design 2026-09-27: every topic belongs to a direction. The seeded one is managed by the seeded
// teacher, who therefore holds both the direction and the supervision seat on their own topics:
// the administrator's approval is the one that completes them.
const directionId = (await call('GET', `/api/directions?departmentId=${departmentId}`, { token: admin })).body.find((d) => d.name === 'Software Engineering').id
// Every student this script creates lives in a group of its own, removed with them at the end.
const ownGroup = (await call('POST', '/api/groups', { token: admin, json: { departmentId, code: `TP${stamp}`, academicYear: '2026/2027', description: '' } })).body
cleanup.add(`group ${ownGroup.code}`, () => removeGroup(call, admin, ownGroup))
const teachers = (await call('GET', '/api/staff', { token: admin })).body
const teacherId = teachers.find((t) => t.email === 'teacher@diploma.local').id

async function createStudent(suffix) {
  const email = `topic.${suffix}.${stamp}@student.local`
  const created = await call('POST', '/api/students', { token: admin, json: { firstName: 'Topic', lastName: `Student${suffix}`, email, studentNumber: `T${suffix}${stamp}`, password: 'Password1!', groupId: ownGroup.id } })
  return { id: created.body.id, token: await login(email, 'Password1!') }
}

const s1 = await createStudent('A')
const s2 = await createStudent('B')
const s3 = await createStudent('C')
const s4 = await createStudent('D') // used only for the topicHeld-refusal sequence (checks 40-48)

const teacher2Email = `teacher2.${stamp}@diploma.local`
const teacher2Id = await makeStaff(call, cleanup, admin, {
  email: teacher2Email,
  firstName: 'Second',
  lastName: 'Teacher',
  roles: [{ role: 'Teacher', scopeKind: 'Department', scopeId: departmentId }]
})
const teacher2 = await login(teacher2Email, 'Teacher456!')
// Phase 12 §5: the seeded teacher decides as direction manager on topics they do not supervise.
const teacherAsManager = await actAs(call, teacher, 'DirectionManager')

const originalDeadline = (await call('GET', '/api/settings/topic-selection', { token: admin })).body.deadline
cleanup.add('topic-selection deadline', () => call('PUT', '/api/settings/topic-selection', { token: admin, json: { deadline: originalDeadline } }))
await call('PUT', '/api/settings/topic-selection', { token: admin, json: { deadline: null } })

// Catalogue
const t1 = await call('POST', '/api/topics', { token: teacher, json: { title: `Topic One ${stamp}`, description: 'First', directionId } })
check('01 teacher creates topic', t1.status, 201)
const t2 = (await call('POST', '/api/topics', { token: teacher, json: { title: `Topic Two ${stamp}`, directionId } })).body
const t4 = (await call('POST', '/api/topics', { token: admin, json: { title: `Topic Four ${stamp}`, directionId, supervisorId: teacherId } })).body
cleanup.add(`topic ${t4.title}`, () => call('DELETE', `/api/topics/${t4.id}`, { token: admin }))
const t5 = (await call('POST', '/api/topics', { token: teacher2, json: { title: `Topic Five ${stamp}`, directionId } })).body
cleanup.add(`topic ${t5.title}`, () => call('DELETE', `/api/topics/${t5.id}`, { token: admin }))
const t6 = (await call('POST', '/api/topics', { token: teacher, json: { title: `Topic Six ${stamp}`, directionId } })).body
const t7 = (await call('POST', '/api/topics', { token: teacher, json: { title: `Topic Seven ${stamp}`, directionId } })).body
const t8 = (await call('POST', '/api/topics', { token: teacher, json: { title: `Topic Eight ${stamp}`, directionId } })).body
check('02 admin topic without supervisor refused', (await call('POST', '/api/topics', { token: admin, json: { title: 'X', directionId } })).body.code, 'topic.supervisorInvalid')
check('03a supervisors list for student', (await call('GET', '/api/topics/supervisors', { token: s1.token })).body.some((t) => t.id === teacherId), true)
check('03 unknown direction refused', (await call('POST', '/api/topics', { token: teacher, json: { title: 'X', directionId: '00000000-0000-0000-0000-000000000001' } })).body.code, 'direction.invalid')

const otherFaculty = (await call('POST', '/api/faculties', { token: admin, json: { name: `Other Faculty ${stamp}`, shortName: `OF${stamp}` } })).body
cleanup.add(`faculty ${otherFaculty.shortName}`, () => call('DELETE', `/api/faculties/${otherFaculty.id}`, { token: admin }))
const otherDepartment = (await call('POST', '/api/departments', { token: admin, json: { facultyId: otherFaculty.id, name: `Other Department ${stamp}`, shortName: `OD${stamp}` } })).body
cleanup.add(`department ${otherDepartment.shortName}`, () => call('DELETE', `/api/departments/${otherDepartment.id}`, { token: admin }))
// Phase 12 §4: the seeded teacher manages and teaches in this department too.
await grantRoles(call, cleanup, admin, teacherId, [
  { role: 'Teacher', scopeKind: 'Department', scopeId: otherDepartment.id },
  { role: 'DirectionManager', scopeKind: 'Department', scopeId: otherDepartment.id }
])
const otherDirection = (await call('POST', '/api/directions', { token: admin, json: { departmentId: otherDepartment.id, name: `Other Direction ${stamp}`, managerId: teacherId } })).body
cleanup.add(`direction ${otherDirection.name}`, () => call('DELETE', `/api/directions/${otherDirection.id}`, { token: admin }))
const t3 = (await call('POST', '/api/topics', { token: teacher, json: { title: `Topic Other ${stamp}`, directionId: otherDirection.id } })).body
cleanup.add(`topic ${t3.title}`, () => call('DELETE', `/api/topics/${t3.id}`, { token: admin }))

const catalogue = (await call('GET', '/api/topics', { token: s1.token })).body
check('04 student sees own-department topic', catalogue.some((t) => t.id === t1.body.id), true)
check('05 student does not see other department', catalogue.some((t) => t.id === t3.id), false)
check('06 other department reserve refused', (await call('POST', `/api/topics/${t3.id}/reserve`, { token: s1.token })).body.code, 'topic.notInYourDepartment')

// Reserve, reject, reserve, approve, release
const r1 = await call('POST', `/api/topics/${t1.body.id}/reserve`, { token: s1.token })
check('07 reserve', r1.status, 200)
check('08 reservation pending', r1.body.status, 'Pending')
check('09 second reservation refused', (await call('POST', `/api/topics/${t2.id}/reserve`, { token: s1.token })).body.code, 'reservation.alreadyActive')
check('10 teacher2 holds no seat', (await call('POST', `/api/reservations/${r1.body.id}/approve`, { token: teacher2 })).body.code, 'approval.notApprover')
const rejected = await call('POST', `/api/reservations/${r1.body.id}/reject`, { token: teacher, json: { comment: 'Please narrow the scope' } })
check('11 reject', rejected.body.status, 'Rejected')
check('12 topic available again', (await call('GET', `/api/topics/${t1.body.id}`, { token: admin })).body.status, 'Available')
const mine = (await call('GET', '/api/reservations/mine', { token: s1.token })).body
check('13 history keeps comment', mine[0].decisionComment, 'Please narrow the scope')

const r1b = (await call('POST', `/api/topics/${t1.body.id}/reserve`, { token: s1.token })).body
check('14 the creator already approved in both of their seats', (await call('POST', `/api/reservations/${r1b.id}/approve`, { token: teacher })).body.code, 'approval.seatSatisfied')
check('14a the administration completes it', (await call('POST', `/api/reservations/${r1b.id}/approve`, { token: admin })).body.status, 'Approved')
const s1Profile = (await call('GET', `/api/students/${s1.id}`, { token: admin })).body
check('15 student topic set', s1Profile.topicTitle, `Topic One ${stamp}`)
check('16 student supervisor set', s1Profile.supervisorId, teacherId)
check('17 approved topic not editable by its teacher', (await call('PUT', `/api/topics/${t1.body.id}`, { token: teacher, json: { title: 'Changed', directionId } })).body.code, 'topic.notEditable')
check('17a admin edits an approved topic', (await call('PUT', `/api/topics/${t1.body.id}`, { token: admin, json: { title: `Topic One Amended ${stamp}`, directionId, supervisorId: teacher2Id } })).status, 200)
check('17b student supervisor moved with the topic', (await call('GET', `/api/students/${s1.id}`, { token: admin })).body.supervisorId, teacher2Id)
check('17c the approved request shows the current wording', (await call('GET', '/api/reservations/mine', { token: s1.token })).body[0].topicTitle, `Topic One Amended ${stamp}`)
check('17d approved topic cannot be deleted', (await call('DELETE', `/api/topics/${t1.body.id}`, { token: admin })).body.code, 'topic.notEditable')
await call('PUT', `/api/topics/${t1.body.id}`, { token: admin, json: { title: `Topic One ${stamp}`, directionId, supervisorId: teacherId } })
check('18 cancel approved refused', (await call('POST', `/api/reservations/${r1b.id}/cancel`, { token: s1.token })).body.code, 'reservation.invalidState')
check('19 release', (await call('POST', `/api/reservations/${r1b.id}/release`, { token: teacher, json: { comment: 'Changed plans' } })).body.status, 'Released')
check('20 student topic cleared', (await call('GET', `/api/students/${s1.id}`, { token: admin })).body.topicId, null)

// Proposals
const p1 = await call('POST', '/api/topics/proposals', { token: s1.token, json: { title: `Proposal ${stamp}`, description: 'Own idea', supervisorId: teacherId, directionId } })
check('21 propose', p1.status, 200)
check('22 teacher sees proposal', (await call('GET', '/api/topics', { token: teacher })).body.some((t) => t.id === p1.body.topicId && t.origin === 'StudentProposal'), true)
check('23 student cancels proposal', (await call('POST', `/api/reservations/${p1.body.id}/cancel`, { token: s1.token })).body.status, 'Cancelled')
check('24 proposal topic deleted', (await call('GET', `/api/topics/${p1.body.topicId}`, { token: admin })).status, 404)
check('25 history keeps title', (await call('GET', '/api/reservations/mine', { token: s1.token })).body[0].topicTitle, `Proposal ${stamp}`)
check('26 proposal to non-teacher refused', (await call('POST', '/api/topics/proposals', { token: s1.token, json: { title: 'X', supervisorId: s2.id, directionId } })).body.code, 'proposal.teacherInvalid')
const p2 = (await call('POST', '/api/topics/proposals', { token: s1.token, json: { title: `Proposal Two ${stamp}`, supervisorId: teacherId, directionId } })).body
check('27 the supervisor, also the manager, fills two seats', (await call('POST', `/api/reservations/${p2.id}/approve`, { token: teacher })).body.status, 'Pending')
check('27a the administration accepts the proposal', (await call('POST', `/api/reservations/${p2.id}/approve`, { token: admin })).body.status, 'Approved')
check('28 release proposal', (await call('POST', `/api/reservations/${p2.id}/release`, { token: admin, json: {} })).body.status, 'Released')
check('29 released proposal deleted', (await call('GET', `/api/topics/${p2.topicId}`, { token: admin })).status, 404)

// Deadline
await call('PUT', '/api/settings/topic-selection', { token: admin, json: { deadline: '2000-01-01T00:00:00Z' } })
check('30 closed selection refuses reserve', (await call('POST', `/api/topics/${t2.id}/reserve`, { token: s1.token })).body.code, 'selection.closed')
check('31 deadline returned', (await call('GET', '/api/settings/topic-selection', { token: s1.token })).body.deadline.startsWith('2000-01-01'), true)
await call('PUT', '/api/settings/topic-selection', { token: admin, json: { deadline: null } })

// Concurrency
const race = await Promise.all([
  call('POST', `/api/topics/${t2.id}/reserve`, { token: s2.token }),
  call('POST', `/api/topics/${t2.id}/reserve`, { token: s3.token })
])
const statuses = race.map((r) => r.status).sort().join(',')
check('32 concurrent reserve: one wins', statuses, '200,409')
const loser = race[0].status === 409 ? s2 : s3
const winner = loser === s2 ? s3 : s2
const winnerReservation = race.find((r) => r.status === 200).body

cleanup.add(`topic ${t2.title} (race winner's open reservation)`, async () => {
  await call('POST', `/api/reservations/${winnerReservation.id}/cancel`, { token: winner.token })
  return call('DELETE', `/api/topics/${t2.id}`, { token: admin })
})

// Assignment from the student form (design 2026-09-27 §5.3): it carries the administrator's
// approval; the creator's seats count as for any request; the rest still approve.
const assigned = (await call('PUT', `/api/students/${loser.id}/topic`, { token: admin, json: { topicId: t4.id } })).body
check('33 assigning an administrator\'s topic waits for the manager and the supervisor', assigned.status, 'Pending')
check('33a the teacher, supervisor and manager, completes it', (await call('POST', `/api/reservations/${assigned.id}/approve`, { token: teacher })).body.status, 'Approved')
const replacing = (await call('PUT', `/api/students/${loser.id}/topic`, { token: admin, json: { topicId: t5.id } })).body
check('34 assigning over a held topic waits', `${replacing.status} ${replacing.topicId === t5.id}`, 'Pending true')
check('34a the student still holds the first topic', (await call('GET', `/api/students/${loser.id}`, { token: admin })).body.topicId, t4.id)
check('34b the manager\'s approval completes the replacement', (await call('POST', `/api/reservations/${replacing.id}/approve`, { token: teacherAsManager })).body.status, 'Approved')
check('35 the displaced topic is available again', (await call('GET', `/api/topics/${t4.id}`, { token: admin })).body.status, 'Available')
check('36 assigning the topic already held refused', (await call('PUT', `/api/students/${loser.id}/topic`, { token: admin, json: { topicId: t5.id } })).body.code, 'topic.alreadyYours')
check('37 clearing the topic', (await call('PUT', `/api/students/${loser.id}/topic`, { token: admin, json: { topicId: null } })).status, 204)
check('38 student has no topic', (await call('GET', `/api/students/${loser.id}`, { token: admin })).body.topicId, null)
check('39 the cleared topic is available again', (await call('GET', `/api/topics/${t5.id}`, { token: admin })).body.status, 'Available')

// Task 7 bug 9: a student holding an approved topic can file no new request; reserve and propose
// are refused with reservation.topicHeld before any topic-specific rule.
const refused = (res) => `${res.status} ${res.body?.code}`
const ch1 = (await call('POST', `/api/topics/${t6.id}/reserve`, { token: s4.token })).body
await call('POST', `/api/reservations/${ch1.id}/approve`, { token: admin })
check('40 reserving another topic while holding one is refused', refused(await call('POST', `/api/topics/${t7.id}/reserve`, { token: s4.token })), '409 reservation.topicHeld')
check('41 the held topic is still approved', (await call('GET', `/api/topics/${t6.id}`, { token: admin })).body.status, 'Approved')
check('42 proposing while holding a topic is refused the same way', refused(await call('POST', '/api/topics/proposals', { token: s4.token, json: { title: 'Unreachable proposal', supervisorId: teacherId, directionId } })), '409 reservation.topicHeld')
check('43 reserving the topic already held gives topicHeld, not alreadyYours', refused(await call('POST', `/api/topics/${t6.id}/reserve`, { token: s4.token })), '409 reservation.topicHeld')
await call('PUT', '/api/settings/topic-selection', { token: admin, json: { deadline: '2000-01-01T00:00:00Z' } })
check('44 closed selection still gives topicHeld, not selection.closed', refused(await call('POST', `/api/topics/${t8.id}/reserve`, { token: s4.token })), '409 reservation.topicHeld')
await call('PUT', '/api/settings/topic-selection', { token: admin, json: { deadline: null } })
check('45 student still holds the original topic', (await call('GET', `/api/students/${s4.id}`, { token: admin })).body.topicId, t6.id)

// An administrator replaces the topic directly. The seeded teacher created t6 and t7 and holds
// both teacher seats, so each assignment completes at once. The two-phase save is repeated seven
// times to catch an ordering bug under IX_TopicReservations_ApprovedPerStudent.
let swapsOk = true
let held = t6.id
for (let i = 0; i < 7 && swapsOk; i++) {
  const wanted = held === t6.id ? t7.id : t6.id
  const result = await call('PUT', `/api/students/${s4.id}/topic`, { token: admin, json: { topicId: wanted } })
  if (result.body.topicId !== wanted || result.body.status !== 'Approved') {
    swapsOk = false
    console.log(`    swap ${i + 1} failed:`, JSON.stringify(result.body))
    break
  }
  held = wanted
}
check('46 seven consecutive admin-driven topic swaps all succeed', swapsOk, true)
check('47 student holds the last topic asked for', (await call('GET', `/api/students/${s4.id}`, { token: admin })).body.topicId, held)
check('48 the other topic returns to the catalogue', (await call('GET', `/api/topics/${held === t6.id ? t7.id : t6.id}`, { token: admin })).body.status, 'Available')

cleanup.add('topics six/seven/eight (task 7 bug 9)', async () => {
  await call('PUT', `/api/students/${s4.id}/topic`, { token: admin, json: { topicId: null } })
  await call('DELETE', `/api/topics/${t6.id}`, { token: admin })
  await call('DELETE', `/api/topics/${t7.id}`, { token: admin })
  return call('DELETE', `/api/topics/${t8.id}`, { token: admin })
})

// Teacher lists and deletion
check('51 open list for teacher', (await call('GET', '/api/reservations/pending', { token: teacher })).body.every((r) => r.status === 'Pending' || r.status === 'Returned'), true)
check('52 approved list for teacher', (await call('GET', '/api/reservations/pending?status=Approved', { token: teacher })).body.some((r) => r.topicId === t7.id || r.topicId === t6.id), true)
check('53 a teacher who neither supervises nor manages cannot delete', (await call('DELETE', `/api/topics/${t1.body.id}`, { token: teacher2 })).body.code, 'topic.notOwner')
check('54 teacher deletes own available topic', (await call('DELETE', `/api/topics/${t1.body.id}`, { token: teacher })).status, 204)

// Review fix wave regression checks (C1, I4): a displaced StudentProposal topic must never be
// deleted while StudentProfiles.TopicId still references it.
async function acceptProposal(student, title) {
  const proposal = (await call('POST', '/api/topics/proposals', { token: student.token, json: { title, supervisorId: teacherId, directionId } })).body
  await call('POST', `/api/reservations/${proposal.id}/approve`, { token: teacher })
  const accepted = (await call('POST', `/api/reservations/${proposal.id}/approve`, { token: admin })).body
  return { proposal, accepted }
}

const s5 = await createStudent('E')
const t9 = (await call('POST', '/api/topics', { token: teacher, json: { title: `Topic Nine ${stamp}`, directionId } })).body
const c1a = await acceptProposal(s5, `Proposal C1a ${stamp}`)
check('55 proposal approved as the student\'s topic', c1a.accepted.status, 'Approved')
check('56 reserving a catalogue topic while holding an approved proposal is refused', refused(await call('POST', `/api/topics/${t9.id}/reserve`, { token: s5.token })), '409 reservation.topicHeld')
check('57 proposing again while holding an approved proposal is refused', refused(await call('POST', '/api/topics/proposals', { token: s5.token, json: { title: 'Unreachable proposal', supervisorId: teacherId, directionId } })), '409 reservation.topicHeld')
check('58 the accepted proposal is still the student\'s topic', (await call('GET', `/api/students/${s5.id}`, { token: admin })).body.topicTitle, `Proposal C1a ${stamp}`)
cleanup.add(`topic ${t9.title} (C1a)`, async () => {
  await call('PUT', `/api/students/${s5.id}/topic`, { token: admin, json: { topicId: null } })
  return call('DELETE', `/api/topics/${t9.id}`, { token: admin })
})

// C1b: an administrator assigns a different topic over a student's approved proposal.
const s6 = await createStudent('F')
const t10 = (await call('POST', '/api/topics', { token: teacher, json: { title: `Topic Ten ${stamp}`, directionId } })).body
const c1b = await acceptProposal(s6, `Proposal C1b ${stamp}`)
check('59 admin assigns over an approved proposal', (await call('PUT', `/api/students/${s6.id}/topic`, { token: admin, json: { topicId: t10.id } })).body.status, 'Approved')
check('60 the old proposal topic is gone after assignment', (await call('GET', `/api/topics/${c1b.proposal.topicId}`, { token: admin })).status, 404)
cleanup.add(`topic ${t10.title} (C1b)`, async () => {
  const approved = (await call('GET', '/api/reservations/mine', { token: s6.token })).body.find((r) => r.status === 'Approved' && r.topicId === t10.id)
  if (approved) {
    await call('POST', `/api/reservations/${approved.id}/release`, { token: teacher, json: { comment: 'check cleanup' } })
  }
  return call('DELETE', `/api/topics/${t10.id}`, { token: admin })
})

// C1c: an administrator clears a student's approved proposal outright.
const s7 = await createStudent('G')
const c1c = await acceptProposal(s7, `Proposal C1c ${stamp}`)
check('61 admin clears an approved proposal', (await call('PUT', `/api/students/${s7.id}/topic`, { token: admin, json: { topicId: null } })).status, 204)
check('62 the cleared proposal topic is gone', (await call('GET', `/api/topics/${c1c.proposal.topicId}`, { token: admin })).status, 404)

// I4, as refined by design 2026-09-27 §5.2: an administrator may change a Reserved topic's
// supervisor, but the requesting student's profile is written only when the request completes.
const s8 = await createStudent('H')
const t11 = (await call('POST', '/api/topics', { token: teacher, json: { title: `Topic Eleven ${stamp}`, directionId } })).body
await call('POST', `/api/topics/${t11.id}/reserve`, { token: s8.token })
check('63 topic is Reserved, not yet Approved', (await call('GET', `/api/topics/${t11.id}`, { token: admin })).body.status, 'Reserved')
check('64 admin moves a Reserved topic to a new supervisor', (await call('PUT', `/api/topics/${t11.id}`, { token: admin, json: { title: t11.title, directionId, supervisorId: teacher2Id } })).status, 200)
check("65 the requester's supervisor waits for the request to complete", (await call('GET', `/api/students/${s8.id}`, { token: admin })).body.supervisorId ?? null, null)
cleanup.add(`topic ${t11.title} (I4)`, async () => {
  const open = (await call('GET', '/api/reservations/mine', { token: s8.token })).body.find((r) => (r.status === 'Pending' || r.status === 'Returned') && r.topicId === t11.id)
  if (open) {
    await call('POST', `/api/reservations/${open.id}/cancel`, { token: s8.token })
  }
  return call('DELETE', `/api/topics/${t11.id}`, { token: admin })
})
}

try {
  await runChecks()
} finally {
  await cleanup.run()
}

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
