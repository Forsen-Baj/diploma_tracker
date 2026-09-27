import { createCleanup, removeGroup } from './checkCleanup.mjs'

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
// Group.Name no longer exists; the seed group's identity is its Code alone.
const seedGroup = groups.find((g) => g.code === 'SEED-A')
const departmentId = seedGroup.departmentId
// Every student this script creates lives in a group of its own, removed with them at the end;
// any student-proposal topic they own goes with their account (Phase 8 §4.7).
const ownGroup = (await call('POST', '/api/groups', { token: admin, json: { departmentId, code: `TP${stamp}`, academicYear: '2026/2027', description: '' } })).body
cleanup.add(`group ${ownGroup.code}`, () => removeGroup(call, admin, ownGroup))
const teachers = (await call('GET', '/api/teachers', { token: admin })).body
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
const teacher2Id = (await call('POST', '/api/teachers', { token: admin, json: { firstName: 'Second', lastName: 'Teacher', email: teacher2Email, password: 'Teacher456!' } })).body.id
const teacher2 = await login(teacher2Email, 'Teacher456!')
cleanup.add(`teacher ${teacher2Email} -> deactivate`, () => call('PATCH', `/api/teachers/${teacher2Id}/deactivate`, { token: admin }))

// The deadline is shared state: read before it is changed so cleanup can restore the exact
// original value.
const originalDeadline = (await call('GET', '/api/settings/topic-selection', { token: admin })).body.deadline
cleanup.add('topic-selection deadline', () => call('PUT', '/api/settings/topic-selection', { token: admin, json: { deadline: originalDeadline } }))
await call('PUT', '/api/settings/topic-selection', { token: admin, json: { deadline: null } })

// Catalogue
const t1 = await call('POST', '/api/topics', { token: teacher, json: { title: `Topic One ${stamp}`, description: 'First', departmentId } })
check('01 teacher creates topic', t1.status, 201)
const t2 = (await call('POST', '/api/topics', { token: teacher, json: { title: `Topic Two ${stamp}`, departmentId } })).body
const t4 = (await call('POST', '/api/topics', { token: admin, json: { title: `Topic Four ${stamp}`, departmentId, supervisorId: teacherId } })).body
cleanup.add(`topic ${t4.title}`, () => call('DELETE', `/api/topics/${t4.id}`, { token: admin }))
const t5 = (await call('POST', '/api/topics', { token: teacher2, json: { title: `Topic Five ${stamp}`, departmentId } })).body
cleanup.add(`topic ${t5.title}`, () => call('DELETE', `/api/topics/${t5.id}`, { token: admin }))
// t6, t7 and t8 are all supervised by `teacher` so one token decides every change request
const t6 = (await call('POST', '/api/topics', { token: teacher, json: { title: `Topic Six ${stamp}`, departmentId } })).body
const t7 = (await call('POST', '/api/topics', { token: teacher, json: { title: `Topic Seven ${stamp}`, departmentId } })).body
const t8 = (await call('POST', '/api/topics', { token: teacher, json: { title: `Topic Eight ${stamp}`, departmentId } })).body
check('02 admin topic without supervisor refused', (await call('POST', '/api/topics', { token: admin, json: { title: 'X', departmentId } })).body.code, 'topic.supervisorInvalid')
check('03a supervisors list for student', (await call('GET', '/api/topics/supervisors', { token: s1.token })).body.some((t) => t.id === teacherId), true)
check('03 unknown department refused', (await call('POST', '/api/topics', { token: teacher, json: { title: 'X', departmentId: '00000000-0000-0000-0000-000000000001' } })).body.code, 'topic.departmentInvalid')

const otherFaculty = (await call('POST', '/api/faculties', { token: admin, json: { name: `Other Faculty ${stamp}`, shortName: `OF${stamp}` } })).body
cleanup.add(`faculty ${otherFaculty.shortName}`, () => call('DELETE', `/api/faculties/${otherFaculty.id}`, { token: admin }))
const otherDepartment = (await call('POST', '/api/departments', { token: admin, json: { facultyId: otherFaculty.id, name: `Other Department ${stamp}`, shortName: `OD${stamp}` } })).body
cleanup.add(`department ${otherDepartment.shortName}`, () => call('DELETE', `/api/departments/${otherDepartment.id}`, { token: admin }))
const t3 = (await call('POST', '/api/topics', { token: teacher, json: { title: `Topic Other ${stamp}`, departmentId: otherDepartment.id } })).body
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
check('10 teacher2 cannot decide', (await call('POST', `/api/reservations/${r1.body.id}/approve`, { token: teacher2 })).body.code, 'reservation.notSupervisor')
const rejected = await call('POST', `/api/reservations/${r1.body.id}/reject`, { token: teacher, json: { comment: 'Please narrow the scope' } })
check('11 reject', rejected.body.status, 'Rejected')
check('12 topic available again', (await call('GET', `/api/topics/${t1.body.id}`, { token: admin })).body.status, 'Available')
const mine = (await call('GET', '/api/reservations/mine', { token: s1.token })).body
check('13 history keeps comment', mine[0].decisionComment, 'Please narrow the scope')

const r1b = (await call('POST', `/api/topics/${t1.body.id}/reserve`, { token: s1.token })).body
check('14 approve', (await call('POST', `/api/reservations/${r1b.id}/approve`, { token: teacher })).body.status, 'Approved')
const s1Profile = (await call('GET', `/api/students/${s1.id}`, { token: admin })).body
check('15 student topic set', s1Profile.topicTitle, `Topic One ${stamp}`)
check('16 student supervisor set', s1Profile.supervisorId, teacherId)
check('17 approved topic not editable by its teacher', (await call('PUT', `/api/topics/${t1.body.id}`, { token: teacher, json: { title: 'Changed', departmentId } })).body.code, 'topic.notEditable')
check('17a admin edits an approved topic', (await call('PUT', `/api/topics/${t1.body.id}`, { token: admin, json: { title: `Topic One Amended ${stamp}`, departmentId, supervisorId: teacher2Id } })).status, 200)
check('17b student supervisor moved with the topic', (await call('GET', `/api/students/${s1.id}`, { token: admin })).body.supervisorId, teacher2Id)
check('17c history keeps the original title', (await call('GET', '/api/reservations/mine', { token: s1.token })).body[0].topicTitle, `Topic One ${stamp}`)
check('17d approved topic cannot be deleted', (await call('DELETE', `/api/topics/${t1.body.id}`, { token: admin })).body.code, 'topic.notEditable')
// put the supervisor back so the remaining checks read as before
await call('PUT', `/api/topics/${t1.body.id}`, { token: admin, json: { title: `Topic One ${stamp}`, departmentId, supervisorId: teacherId } })
check('18 cancel approved refused', (await call('POST', `/api/reservations/${r1b.id}/cancel`, { token: s1.token })).body.code, 'reservation.invalidState')
check('19 release', (await call('POST', `/api/reservations/${r1b.id}/release`, { token: teacher, json: { comment: 'Changed plans' } })).body.status, 'Released')
check('20 student topic cleared', (await call('GET', `/api/students/${s1.id}`, { token: admin })).body.topicId, null)

// Proposals
const p1 = await call('POST', '/api/topics/proposals', { token: s1.token, json: { title: `Proposal ${stamp}`, description: 'Own idea', supervisorId: teacherId } })
check('21 propose', p1.status, 200)
check('22 teacher sees proposal', (await call('GET', '/api/topics', { token: teacher })).body.some((t) => t.id === p1.body.topicId && t.origin === 'StudentProposal'), true)
check('23 student cancels proposal', (await call('POST', `/api/reservations/${p1.body.id}/cancel`, { token: s1.token })).body.status, 'Cancelled')
check('24 proposal topic deleted', (await call('GET', `/api/topics/${p1.body.topicId}`, { token: admin })).status, 404)
check('25 history keeps title', (await call('GET', '/api/reservations/mine', { token: s1.token })).body[0].topicTitle, `Proposal ${stamp}`)
check('26 proposal to non-teacher refused', (await call('POST', '/api/topics/proposals', { token: s1.token, json: { title: 'X', supervisorId: s2.id } })).body.code, 'proposal.teacherInvalid')
const p2 = (await call('POST', '/api/topics/proposals', { token: s1.token, json: { title: `Proposal Two ${stamp}`, supervisorId: teacherId } })).body
check('27 accept proposal', (await call('POST', `/api/reservations/${p2.id}/approve`, { token: teacher })).body.status, 'Approved')
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

// The race's winner is left holding a Pending reservation on t2 that nothing else in this script
// ever decides - cancel it before the topic can be deleted.
cleanup.add(`topic ${t2.title} (race winner's pending reservation)`, async () => {
  await call('POST', `/api/reservations/${winnerReservation.id}/cancel`, { token: winner.token })
  return call('DELETE', `/api/topics/${t2.id}`, { token: admin })
})

// Assignment from the student form
const assigned = await call('PUT', `/api/students/${loser.id}/topic`, { token: admin, json: { topicId: t4.id } })
check('33 admin assigns topic', assigned.body.status, 'Approved')
check('34 assigning again replaces the topic', (await call('PUT', `/api/students/${loser.id}/topic`, { token: admin, json: { topicId: t5.id } })).body.topicId, t5.id)
check('35 the displaced topic is available again', (await call('GET', `/api/topics/${t4.id}`, { token: admin })).body.status, 'Available')
check('36 assigning the topic already held refused', (await call('PUT', `/api/students/${loser.id}/topic`, { token: admin, json: { topicId: t5.id } })).body.code, 'topic.alreadyYours')
check('37 clearing the topic', (await call('PUT', `/api/students/${loser.id}/topic`, { token: admin, json: { topicId: null } })).status, 204)
check('38 student has no topic', (await call('GET', `/api/students/${loser.id}`, { token: admin })).body.topicId, null)
check('39 the cleared topic is available again', (await call('GET', `/api/topics/${t5.id}`, { token: admin })).body.status, 'Available')

// Bug 9 (task 7): a student holding an approved topic can no longer file ANY new request through
// the student-initiated flow - reserve and propose are both refused up front with
// reservation.topicHeld, checked before any topic-specific rule (even reserving the exact topic
// already held now gives topicHeld, not topic.alreadyYours - that code stays reachable only
// through the administrator's PUT /api/students/{id}/topic used below, which this bug leaves
// untouched).
// Review M9: assert the status too, not just body.code - a 200 response that happened to carry a
// stray "code" field could never fail a body.code-only comparison. refused() reads as "409
// reservation.topicHeld" or similar, composed from both fields in one check.
const refused = (res) => `${res.status} ${res.body?.code}`
const ch1 = (await call('POST', `/api/topics/${t6.id}/reserve`, { token: s4.token })).body
await call('POST', `/api/reservations/${ch1.id}/approve`, { token: teacher })
check('40 reserving another topic while holding one is refused', refused(await call('POST', `/api/topics/${t7.id}/reserve`, { token: s4.token })), '409 reservation.topicHeld')
check('41 the held topic is still approved', (await call('GET', `/api/topics/${t6.id}`, { token: admin })).body.status, 'Approved')
check('42 proposing while holding a topic is refused the same way', refused(await call('POST', '/api/topics/proposals', { token: s4.token, json: { title: 'Unreachable proposal', supervisorId: teacherId } })), '409 reservation.topicHeld')
check('43 reserving the topic already held gives topicHeld, not alreadyYours', refused(await call('POST', `/api/topics/${t6.id}/reserve`, { token: s4.token })), '409 reservation.topicHeld')
await call('PUT', '/api/settings/topic-selection', { token: admin, json: { deadline: '2000-01-01T00:00:00Z' } })
check('44 closed selection still gives topicHeld, not selection.closed', refused(await call('POST', `/api/topics/${t8.id}/reserve`, { token: s4.token })), '409 reservation.topicHeld')
await call('PUT', '/api/settings/topic-selection', { token: admin, json: { deadline: null } })
check('45 student still holds the original topic', (await call('GET', `/api/students/${s4.id}`, { token: admin })).body.topicId, t6.id)

// A change still happens the way it always did when someone else initiates it: the supervisor or
// an administrator replaces the topic directly (SetStudentTopicAsync) instead of through a
// competing Pending reservation, which reserve/propose can no longer create for this student.
// SetStudentTopicAsync carries "the same two-phase rule as ApproveAsync" per its own comment
// (the released row and the created row are both this student's under
// IX_TopicReservations_ApprovedPerStudent) - repeat the swap enough times to catch an ordering
// bug, the same way the old six-swap loop used to for the student-approved path this bug makes
// unreachable. An odd count (7) starting from t6 lands back on t7, matching what "52 approved
// list for teacher" below already expects.
let swapsOk = true
let held = t6.id
for (let i = 0; i < 7 && swapsOk; i++) {
  const wanted = held === t6.id ? t7.id : t6.id
  const result = await call('PUT', `/api/students/${s4.id}/topic`, { token: admin, json: { topicId: wanted } })
  if (result.body.topicId !== wanted) {
    swapsOk = false
    console.log(`    swap ${i + 1} failed:`, JSON.stringify(result.body))
    break
  }
  held = wanted
}
check('46 seven consecutive admin-driven topic swaps all succeed', swapsOk, true)
check('47 student holds the last topic asked for', (await call('GET', `/api/students/${s4.id}`, { token: admin })).body.topicId, held)
check('48 the other topic returns to the catalogue', (await call('GET', `/api/topics/${held === t6.id ? t7.id : t6.id}`, { token: admin })).body.status, 'Available')

// t6/t7/t8 are left in a tangle: s4 holds one of t6/t7 Approved (seven swaps back and forth) and
// t8 was never successfully reserved by anyone. All three must be resolved back to Available
// before any of them can be deleted.
cleanup.add('topics six/seven/eight (task 7 bug 9)', async () => {
  await call('PUT', `/api/students/${s4.id}/topic`, { token: admin, json: { topicId: null } })
  await call('DELETE', `/api/topics/${t6.id}`, { token: admin })
  await call('DELETE', `/api/topics/${t7.id}`, { token: admin })
  return call('DELETE', `/api/topics/${t8.id}`, { token: admin })
})

// Teacher lists and deletion
check('51 pending list for teacher', (await call('GET', '/api/reservations/pending', { token: teacher })).body.every((r) => r.status === 'Pending'), true)
check('52 approved list for teacher', (await call('GET', '/api/reservations/pending?status=Approved', { token: teacher })).body.some((r) => r.topicId === t7.id), true)
check('53 teacher cannot delete other teacher topic', (await call('DELETE', `/api/topics/${t5.id}`, { token: teacher })).body.code, 'topic.notOwner')
check('54 teacher deletes own available topic', (await call('DELETE', `/api/topics/${t1.body.id}`, { token: teacher })).status, 204)

// Review fix wave regression checks (C1, I4): the two-phase save used to delete a displaced
// StudentProposal topic while StudentProfiles.TopicId still referenced it, which is a
// DeleteBehavior.Restrict foreign key — every one of the three paths below 500'd before the fix.

// C1a (bug 9 update, task 7): this used to approve a change request away from an approved
// *proposal* - that specific path (ApproveAsync deciding a second Pending reservation for a
// student who already holds one) is no longer reachable at all: reserve/propose refuse before
// such a competing Pending row can ever exist. What remains meaningful here is confirming the
// same reservation.topicHeld refusal applies when the held topic is the student's own accepted
// proposal, not just a catalogue reservation (CheckStudentMayRequestAsync only looks at
// StudentProfile.TopicId, never the topic's origin). The original 500-on-delete regression this
// block guarded (a displaced StudentProposal topic deleted while a FK still pointed at it) is
// still covered below by C1b and C1c, both of which go through the still-reachable admin path.
const s5 = await createStudent('E')
const t9 = (await call('POST', '/api/topics', { token: teacher, json: { title: `Topic Nine ${stamp}`, departmentId } })).body
const propC1a = (await call('POST', '/api/topics/proposals', { token: s5.token, json: { title: `Proposal C1a ${stamp}`, supervisorId: teacherId } })).body
check('55 proposal approved as the student\'s topic', (await call('POST', `/api/reservations/${propC1a.id}/approve`, { token: teacher })).body.status, 'Approved')
check('56 reserving a catalogue topic while holding an approved proposal is refused', refused(await call('POST', `/api/topics/${t9.id}/reserve`, { token: s5.token })), '409 reservation.topicHeld')
check('57 proposing again while holding an approved proposal is refused', refused(await call('POST', '/api/topics/proposals', { token: s5.token, json: { title: 'Unreachable proposal', supervisorId: teacherId } })), '409 reservation.topicHeld')
check('58 the accepted proposal is still the student\'s topic', (await call('GET', `/api/students/${s5.id}`, { token: admin })).body.topicTitle, `Proposal C1a ${stamp}`)
cleanup.add(`topic ${t9.title} (C1a)`, async () => {
  await call('PUT', `/api/students/${s5.id}/topic`, { token: admin, json: { topicId: null } })
  return call('DELETE', `/api/topics/${t9.id}`, { token: admin })
})

// C1b: an administrator assigns a different topic over a student's approved proposal.
const s6 = await createStudent('F')
const t10 = (await call('POST', '/api/topics', { token: teacher, json: { title: `Topic Ten ${stamp}`, departmentId } })).body
const propC1b = (await call('POST', '/api/topics/proposals', { token: s6.token, json: { title: `Proposal C1b ${stamp}`, supervisorId: teacherId } })).body
await call('POST', `/api/reservations/${propC1b.id}/approve`, { token: teacher })
check('59 admin assigns over an approved proposal', (await call('PUT', `/api/students/${s6.id}/topic`, { token: admin, json: { topicId: t10.id } })).body.status, 'Approved')
check('60 the old proposal topic is gone after assignment', (await call('GET', `/api/topics/${propC1b.topicId}`, { token: admin })).status, 404)
cleanup.add(`topic ${t10.title} (C1b)`, async () => {
  const approved = (await call('GET', '/api/reservations/mine', { token: s6.token })).body.find((r) => r.status === 'Approved' && r.topicId === t10.id)
  if (approved) {
    await call('POST', `/api/reservations/${approved.id}/release`, { token: teacher, json: { comment: 'check cleanup' } })
  }
  return call('DELETE', `/api/topics/${t10.id}`, { token: admin })
})

// C1c: an administrator clears a student's approved proposal outright (the other half of the
// "clear it" escape hatch the spec offers, exercised separately from the assign-over case).
const s7 = await createStudent('G')
const propC1c = (await call('POST', '/api/topics/proposals', { token: s7.token, json: { title: `Proposal C1c ${stamp}`, supervisorId: teacherId } })).body
await call('POST', `/api/reservations/${propC1c.id}/approve`, { token: teacher })
check('61 admin clears an approved proposal', (await call('PUT', `/api/students/${s7.id}/topic`, { token: admin, json: { topicId: null } })).status, 204)
check('62 the cleared proposal topic is gone', (await call('GET', `/api/topics/${propC1c.topicId}`, { token: admin })).status, 404)

// I4: an administrator changing a Reserved (pending, not yet approved) topic's supervisor must
// move the student's supervisor with it, the same as it already does for an Approved topic
// (checks 17a/17b). StudentProfile.TopicId is only set on approval, so the holder of a Reserved
// topic must be found through its Pending reservation instead.
const s8 = await createStudent('H')
const t11 = (await call('POST', '/api/topics', { token: teacher, json: { title: `Topic Eleven ${stamp}`, departmentId } })).body
await call('POST', `/api/topics/${t11.id}/reserve`, { token: s8.token })
check('63 topic is Reserved, not yet Approved', (await call('GET', `/api/topics/${t11.id}`, { token: admin })).body.status, 'Reserved')
check('64 admin moves a Reserved topic to a new supervisor', (await call('PUT', `/api/topics/${t11.id}`, { token: admin, json: { title: t11.title, departmentId, supervisorId: teacher2Id } })).status, 200)
check("65 the student's supervisor moves with the Reserved topic", (await call('GET', `/api/students/${s8.id}`, { token: admin })).body.supervisorId, teacher2Id)
cleanup.add(`topic ${t11.title} (I4)`, async () => {
  const pending = (await call('GET', '/api/reservations/mine', { token: s8.token })).body.find((r) => r.status === 'Pending' && r.topicId === t11.id)
  if (pending) {
    await call('POST', `/api/reservations/${pending.id}/cancel`, { token: s8.token })
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
