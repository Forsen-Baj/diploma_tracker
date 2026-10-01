// Design 2026-09-27 (phase 12): scoped staff roles - assignments, the acting role, coverage when
// work is taken on, removal while in use, what each role sees, and the archive by supervisor. Also
// the phase 11 follow-up O1: completing an administrator's topic replacement refreshes the student's
// unfinished steps. Runs against the live local API on :5000 and leaves nothing behind.
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

async function call(method, path, { token, json, form } = {}) {
  if (path === '/api/auth/login') await paceAuth()
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (json !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(API + path, { method, headers, body: form ?? (json === undefined ? undefined : JSON.stringify(json)) })
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('json')) {
    return { status: response.status, headers: response.headers, bytes: new Uint8Array(await response.arrayBuffer()) }
  }
  return { status: response.status, headers: response.headers, body: await response.json() }
}

const signIn = async (email, password) => (await call('POST', '/api/auth/login', { json: { email, password } })).body
const login = async (email, password) => (await signIn(email, password)).token

// ---------- minimal genuine .docx (same shape as workflow-check.mjs) ----------
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(bytes) {
  let c = 0xffffffff
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function zip(files) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const data = Buffer.from(file.content, 'utf8')
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42)
    locals.push(local, name, data)
    centrals.push(central, name)
    offset += local.length + name.length + data.length
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, ...centrals, end])
}
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const docx = new Uint8Array(zip([
  { name: '[Content_Types].xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
  { name: '_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
  { name: 'word/document.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body><w:p><w:r><w:t>Work</w:t></w:r></w:p></w:body></w:document>` }
]))

function form() {
  const data = new FormData()
  data.append('mainFile', new Blob([docx]), 'work.docx')
  return data
}

async function runChecks() {
  const admin = await login('admin@diploma.local', 'Admin123!')
  const teacher = await login('teacher@diploma.local', 'Teacher123!')
  const teacherId = (await call('GET', '/api/auth/me', { token: teacher })).body.id
  const teacherAsManager = await actAs(call, teacher, 'DirectionManager')

  const seedGroup = (await call('GET', '/api/groups', { token: admin })).body.find((g) => g.code === 'SEED-A')
  const seedDepartmentId = seedGroup.departmentId
  const seedDirection = (await call('GET', `/api/directions?departmentId=${seedDepartmentId}`, { token: admin })).body.find((d) => d.name === 'Software Engineering')

  const originalDeadline = (await call('GET', '/api/settings/topic-selection', { token: admin })).body.deadline
  cleanup.add('topic-selection deadline', () => call('PUT', '/api/settings/topic-selection', { token: admin, json: { deadline: originalDeadline } }))
  await call('PUT', '/api/settings/topic-selection', { token: admin, json: { deadline: null } })

  // A group in the seeded department, and a faculty, department and group of this script's own.
  const g1 = (await call('POST', '/api/groups', { token: admin, json: { departmentId: seedDepartmentId, code: `SR1${stamp}`, academicYear: '2026/2027', description: '' } })).body
  cleanup.add(`group ${g1.code}`, () => removeGroup(call, admin, g1))
  const faculty2 = (await call('POST', '/api/faculties', { token: admin, json: { name: `Scoped Faculty ${stamp}`, shortName: `SF${stamp}` } })).body
  cleanup.addLast(`faculty ${faculty2.shortName}`, () => call('DELETE', `/api/faculties/${faculty2.id}`, { token: admin }))
  const department2 = (await call('POST', '/api/departments', { token: admin, json: { facultyId: faculty2.id, name: `Scoped Department ${stamp}`, shortName: `SD${stamp}` } })).body
  cleanup.addLast(`department ${department2.shortName}`, () => call('DELETE', `/api/departments/${department2.id}`, { token: admin }))
  const g2 = (await call('POST', '/api/groups', { token: admin, json: { departmentId: department2.id, code: `SR2${stamp}`, academicYear: '2026/2027', description: '' } })).body
  cleanup.add(`group ${g2.code}`, () => removeGroup(call, admin, g2))

  // A teaches one group. B teaches the new faculty and manages directions in its department. C holds no role.
  const staffEmail = (key) => `scoped.${key}.${stamp}@diploma.local`
  const aId = await makeStaff(call, cleanup, admin, {
    email: staffEmail('a'), firstName: 'Anna', lastName: `ScopedA${stamp}`,
    roles: [{ role: 'Teacher', scopeKind: 'Group', scopeId: g1.id }]
  })
  const bId = await makeStaff(call, cleanup, admin, {
    email: staffEmail('b'), firstName: 'Bohdan', lastName: `ScopedB${stamp}`,
    roles: [
      { role: 'Teacher', scopeKind: 'Faculty', scopeId: faculty2.id },
      { role: 'DirectionManager', scopeKind: 'Department', scopeId: department2.id }
    ]
  })
  const cId = await makeStaff(call, cleanup, admin, { email: staffEmail('c'), firstName: 'Cyril', lastName: `ScopedC${stamp}` })

  async function makeStudent(key, group) {
    const email = `scoped.${key.toLowerCase()}.${stamp}@student.local`
    const id = (await call('POST', '/api/students', { token: admin, json: { firstName: 'Scoped', lastName: `Student${key}`, email, studentNumber: `SR${key}${stamp}`, password: 'Password1!', groupId: group.id } })).body.id
    return { id, token: await login(email, 'Password1!') }
  }
  const s1 = await makeStudent('A', g1)
  const s2 = await makeStudent('B', g2)
  const s3 = await makeStudent('C', g1)

  // ---------- signing in and the acting role (§5) ----------
  const cSession = await signIn(staffEmail('c'), 'Teacher456!')
  check('R01 a staff member with no role acts as none', `${cSession.user.role} ${cSession.user.accountRole} ${cSession.user.assignments.length}`, 'Staff Staff 0')
  check('R02 and is refused the staff pages', (await call('GET', '/api/review/queue', { token: cSession.token })).status, 403)
  check('R03 but keeps the documents', (await call('GET', '/api/documents?box=mine', { token: cSession.token })).status, 200)

  const aSession = await signIn(staffEmail('a'), 'Teacher456!')
  const aToken = aSession.token
  check('R04 a teacher of one group acts as teacher there', `${aSession.user.role} ${aSession.user.assignments[0]?.scopeKind} ${aSession.user.assignments[0]?.scopeName}`, `Teacher Group ${g1.code}`)
  check('R05 a role not held cannot be taken', (await call('POST', '/api/auth/acting-role', { token: aToken, json: { role: 'DirectionManager' } })).body.code, 'actingRole.notHeld')

  const bSession = await signIn(staffEmail('b'), 'Teacher456!')
  const bTeacher = bSession.token
  check('R06 a staff member starts in their first role', bSession.user.role, 'Teacher')
  const switched = (await call('POST', '/api/auth/acting-role', { token: bTeacher, json: { role: 'DirectionManager' } })).body
  const bManager = switched.token
  check('R07 switching issues a token in the new role', switched.user.role, 'DirectionManager')
  check('R08 the old token still works while its role is held', (await call('GET', '/api/review/queue', { token: bTeacher })).status, 200)

  // ---------- administration (§6) ----------
  const addRole = (userId, json, token = admin) => call('POST', `/api/staff/${userId}/roles`, { token, json })
  check('A01 a direction manager is not assigned to a group', (await addRole(cId, { role: 'DirectionManager', scopeKind: 'Group', scopeId: g1.id })).body.code, 'roleAssignment.scopeNotAllowed')
  check('A02 the place must exist', (await addRole(cId, { role: 'Teacher', scopeKind: 'Department', scopeId: crypto.randomUUID() })).body.code, 'roleAssignment.scopeInvalid')
  check('A03 a role is held once per place', (await addRole(aId, { role: 'Teacher', scopeKind: 'Group', scopeId: g1.id })).body.code, 'roleAssignment.exists')
  check('A04 an unknown role name is refused', (await addRole(cId, { role: 'Principal', scopeKind: 'Group', scopeId: g1.id })).body.code, 'validation.failed')
  check('A05 only an administrator assigns roles', (await addRole(cId, { role: 'Teacher', scopeKind: 'Group', scopeId: g1.id }, teacher)).status, 403)
  const teachersOf = async (groupId) => (await call('GET', `/api/staff?role=Teacher&groupId=${groupId}`, { token: admin })).body.map((s) => s.id)
  const g1Teachers = await teachersOf(g1.id)
  check('A06 the teachers of a group are those whose role covers it', `${g1Teachers.includes(aId)} ${g1Teachers.includes(teacherId)} ${g1Teachers.includes(bId)}`, 'true true false')
  const g2Teachers = await teachersOf(g2.id)
  check('A07 a faculty assignment covers the faculty\'s groups', `${g2Teachers.includes(bId)} ${g2Teachers.includes(aId)}`, 'true false')

  // ---------- coverage when work is taken on (§4) ----------
  check('C01 a teacher of one group publishes no catalogue topic', (await call('POST', '/api/topics', { token: aToken, json: { title: `Nope ${stamp}`, directionId: seedDirection.id } })).body.code, 'scope.notCovered')
  const s1Supervisors = (await call('GET', '/api/topics/supervisors', { token: s1.token })).body.map((t) => t.id)
  const s2Supervisors = (await call('GET', '/api/topics/supervisors', { token: s2.token })).body.map((t) => t.id)
  check('C02 a student is offered the teachers who cover their group', `${s1Supervisors.includes(aId)} ${s1Supervisors.includes(bId)} ${s2Supervisors.includes(bId)} ${s2Supervisors.includes(aId)}`, 'true false true false')
  check('C03 a direction manager opens no direction outside their role', (await call('POST', '/api/directions', { token: bManager, json: { departmentId: seedDepartmentId, name: `Outside ${stamp}` } })).body.code, 'scope.notCovered')
  const directionB = await call('POST', '/api/directions', { token: bManager, json: { departmentId: department2.id, name: `Scoped ${stamp}` } })
  check('C04 but opens one inside it', directionB.status, 201)
  cleanup.addLast(`direction Scoped ${stamp}`, () => call('DELETE', `/api/directions/${directionB.body.id}`, { token: admin }))
  check('C05 an administrator names a manager whose role covers the department', (await call('POST', '/api/directions', { token: admin, json: { departmentId: seedDepartmentId, name: `Named ${stamp}`, managerId: bId } })).body.code, 'direction.managerInvalid')
  check('C06 a proposal names a teacher who covers the student\'s group', (await call('POST', '/api/topics/proposals', { token: s2.token, json: { title: `Proposal ${stamp}`, supervisorId: aId, directionId: directionB.body.id } })).body.code, 'proposal.teacherInvalid')
  check('C07 the student form names a supervisor who covers the group', (await call('PUT', `/api/students/${s2.id}/supervisor`, { token: admin, json: { supervisorId: aId } })).body.code, 'student.supervisorInvalid')
  check('C08 and accepts one who does', (await call('PUT', `/api/students/${s2.id}/supervisor`, { token: admin, json: { supervisorId: bId } })).status, 200)

  const templates = (await call('GET', '/api/task-templates', { token: admin })).body
    .filter((t) => t.isActive && t.facultyId === seedGroup.facultyId)
    .sort((a, b) => a.order - b.order)
  await call('POST', `/api/groups/${g1.id}/assign-all-task-templates`, { token: admin, json: { items: [{ taskTemplateId: templates[0].id, deadline: '2099-01-01T00:00:00Z' }] } })
  const g1Step = (await call('GET', `/api/groups/${g1.id}/tasks`, { token: admin })).body[0]
  check('C09 group steps are the administrators\' to change', (await call('PUT', `/api/group-tasks/${g1Step.id}`, { token: teacher, json: { deadline: '2099-02-01T00:00:00Z' } })).status, 403)
  const s1Step = (await call('GET', '/api/student-tasks/mine', { token: s1.token })).body[0]
  check('C10 an extra reviewer covers the student\'s group', (await call('POST', `/api/student-tasks/${s1Step.id}/reviewers`, { token: admin, json: { reviewerId: bId } })).body.code, 'panel.reviewerInvalid')
  check('C11 a teacher of that group can sit on the panel', (await call('POST', `/api/student-tasks/${s1Step.id}/reviewers`, { token: admin, json: { reviewerId: aId } })).status, 200)
  const extraOptions = (await call('GET', `/api/staff/options?studentTaskId=${s1Step.id}&search=${stamp}`, { token: admin })).body.map((o) => o.id)
  check('C12 the extra-reviewer picker offers only those teachers', `${extraOptions.includes(aId)} ${extraOptions.includes(bId)}`, 'true false')

  // ---------- what each role sees (§4.2) ----------
  const listed = async (token) => (await call('GET', '/api/review/students?pageSize=100', { token })).body.items.map((i) => i.studentProfileId)
  check('V01 acting as teacher, a supervisor lists their student', (await listed(bTeacher)).includes(s2.id), true)
  check('V02 acting as direction manager, the same person does not', (await listed(bManager)).includes(s2.id), false)
  check('V03 an extra reviewer sees the group of the student they review', (await call('GET', `/api/groups/${g1.id}`, { token: aToken })).status, 200)
  check('V04 group reviewers are gone', (await call('GET', `/api/groups/${g1.id}/reviewers`, { token: admin })).status, 404)

  // ---------- removing a role in use (§6) ----------
  const assignmentsOf = async (userId) => (await call('GET', `/api/staff/${userId}`, { token: admin })).body.assignments
  const removeRole = (userId, assignmentId) => call('DELETE', `/api/staff/${userId}/roles/${assignmentId}`, { token: admin })
  const bRoles = await assignmentsOf(bId)
  const refusedTeach = (await removeRole(bId, bRoles.find((a) => a.role === 'Teacher').id)).body
  check('U01 a teacher role is kept while its holder supervises there', `${refusedTeach.code} ${refusedTeach.errors?.map((e) => e.kind).join(',')}`, 'roleAssignment.inUse supervisedStudent')
  const refusedManage = (await removeRole(bId, bRoles.find((a) => a.role === 'DirectionManager').id)).body
  check('U02 a manager role is kept while a direction is managed there', `${refusedManage.code} ${refusedManage.errors?.[0]?.kind}`, 'roleAssignment.inUse managedDirection')
  const aGroupRole = (await assignmentsOf(aId))[0]
  check('U03 a teacher role is kept while its holder sits on a panel there', (await removeRole(aId, aGroupRole.id)).body.errors?.[0]?.kind, 'panelSeat')
  await grantRoles(call, cleanup, admin, aId, [{ role: 'Teacher', scopeKind: 'Department', scopeId: seedDepartmentId }])
  check('U04 another assignment covering the same place frees it', (await removeRole(aId, aGroupRole.id)).status, 204)
  check('U05 the session goes on under the wider role', (await call('GET', '/api/auth/me', { token: aToken })).status, 200)

  // ---------- a withdrawn role ends its sessions (§5) ----------
  await grantRoles(call, cleanup, admin, cId, [{ role: 'Teacher', scopeKind: 'Group', scopeId: g2.id }])
  const cTeacher = await login(staffEmail('c'), 'Teacher456!')
  check('S01 a new role is taken at the next sign-in', (await call('GET', '/api/auth/me', { token: cTeacher })).body.role, 'Teacher')
  check('S02 an unused role can be removed', (await removeRole(cId, (await assignmentsOf(cId))[0].id)).status, 204)
  check('S03 the session acting in it ends at once', (await call('GET', '/api/auth/me', { token: cTeacher })).status, 401)
  const cAgain = await signIn(staffEmail('c'), 'Teacher456!')
  check('S04 signing in again acts as none', cAgain.user.role, 'Staff')
  check('S05 a staff member acting in no role has no dashboard', (await call('GET', '/api/dashboard/teacher', { token: cAgain.token })).status, 403)
  check('S06 every staff role has one', (await call('GET', '/api/dashboard/teacher', { token: await actAs(call, teacher, 'StandardsController') })).status, 200)

  // ---------- O1: a replacement that completes refreshes the student's steps ----------
  // s3's first topic is A's, in the seeded direction the seeded teacher manages, so its step panel
  // has a supervisor seat and a separate direction-manager seat.
  const first = (await call('POST', '/api/topics', { token: teacherAsManager, json: { title: `First ${stamp}`, directionId: seedDirection.id, supervisorId: aId } })).body
  cleanup.addLast(`topic First ${stamp}`, () => call('DELETE', `/api/topics/${first.id}`, { token: admin }))
  const request = (await call('POST', `/api/topics/${first.id}/reserve`, { token: s3.token })).body
  await call('POST', `/api/reservations/${request.id}/approve`, { token: aToken })
  check('O01 the first topic is approved', (await call('POST', `/api/reservations/${request.id}/approve`, { token: admin })).body.status, 'Approved')
  const s3Step = (await call('GET', '/api/student-tasks/mine', { token: s3.token })).body[0]
  await call('POST', `/api/student-tasks/${s3Step.id}/submissions`, { token: s3.token, form: form() })
  const pending = (await call('GET', `/api/student-tasks/${s3Step.id}`, { token: admin })).body
  const standIn = (await call('POST', `/api/submissions/${pending.pendingSubmissionId}/approve`, { token: admin, json: { mark: 80 } })).body
  check('O02 the administrator stands in for the supervisor; the manager still has to decide', `${standIn.status} ${standIn.panelApproved}/${standIn.panelSize}`, 'Submitted 1/2')
  // The replacement is the seeded teacher's own topic in their own direction: its supervisor is its
  // manager, so the new panel is one supervisor seat - already filled by the stand-in approval.
  const second = (await call('POST', '/api/topics', { token: teacher, json: { title: `Second ${stamp}`, directionId: seedDirection.id } })).body
  cleanup.addLast(`topic Second ${stamp}`, () => call('DELETE', `/api/topics/${second.id}`, { token: admin }))
  check('O03 the replacement completes at once', (await call('PUT', `/api/students/${s3.id}/topic`, { token: admin, json: { topicId: second.id } })).body.status, 'Approved')
  const refreshed = (await call('GET', `/api/student-tasks/${s3Step.id}`, { token: admin })).body
  check('O04 the step that waited for the old manager is approved with it', `${refreshed.status} ${refreshed.mark}`, 'Approved 80')

  // ---------- the archive, by supervisor (§4.1) ----------
  await call('POST', '/api/students/archive', { token: admin, json: { studentIds: [s3.id] } })
  const archiveCodes = async (token) => {
    const response = await call('GET', `/api/archive/groups?search=${encodeURIComponent(g1.code)}`, { token })
    return response.status === 200 ? response.body.map((a) => a.groupCode) : response.status
  }
  check('H01 the supervisor recorded in the archive reads it', (await archiveCodes(teacher)).includes(g1.code), true)
  check('H02 another teacher does not', (await archiveCodes(aToken)).length, 0)
  check('H03 nor does the same supervisor acting as direction manager', await archiveCodes(teacherAsManager), 403)
}

try {
  await runChecks()
} catch (error) {
  results.push(false)
  console.log(`FAIL  unexpected error: ${error?.stack ?? error}`)
} finally {
  await cleanup.run()
}

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
