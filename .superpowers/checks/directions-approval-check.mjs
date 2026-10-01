// Design 2026-09-27: directions, topic approval and standards control. Runs against the live
// local API on :5000 and leaves nothing behind (checkCleanup.mjs).
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

const login = async (email, password) => (await call('POST', '/api/auth/login', { json: { email, password } })).body.token

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

  const seedGroup = (await call('GET', '/api/groups', { token: admin })).body.find((g) => g.code === 'SEED-A')
  const departmentId = seedGroup.departmentId
  const seedDirection = (await call('GET', `/api/directions?departmentId=${departmentId}`, { token: admin })).body.find((d) => d.name === 'Software Engineering')
  const teacherAsManager = await actAs(call, teacher, 'DirectionManager')

  // Staff this script creates, with roles for the seeded department. Their deactivation and their
  // roles are late undos, so they run after every direction they manage and every group step they
  // control is gone. The manager also teaches: a topic is moved to them in S01, and P07 names them.
  async function makeTeacher(key, roles = ['Teacher']) {
    const email = `dir.${key.toLowerCase()}.${stamp}@diploma.local`
    const id = await makeStaff(call, cleanup, admin, {
      email,
      firstName: key,
      lastName: `Dir${key}${stamp}`,
      roles: roles.map((role) => ({ role, scopeKind: 'Department', scopeId: departmentId }))
    })
    return { id, email, token: await login(email, 'Teacher456!') }
  }
  const manager = await makeTeacher('Manager', ['Teacher', 'DirectionManager'])
  // Every manager check below acts as direction manager (design phase 12 §5).
  manager.token = await actAs(call, manager.token, 'DirectionManager')
  const supervisor = await makeTeacher('Supervisor')
  const controller = await makeTeacher('Controller', ['StandardsController'])

  const group = (await call('POST', '/api/groups', { token: admin, json: { departmentId, code: `DA${stamp}`, academicYear: '2026/2027', description: '' } })).body
  cleanup.add(`group ${group.code}`, () => removeGroup(call, admin, group))

  const originalDeadline = (await call('GET', '/api/settings/topic-selection', { token: admin })).body.deadline
  cleanup.add('topic-selection deadline', () => call('PUT', '/api/settings/topic-selection', { token: admin, json: { deadline: originalDeadline } }))
  await call('PUT', '/api/settings/topic-selection', { token: admin, json: { deadline: null } })

  async function makeStudent(key) {
    const email = `dir.${key.toLowerCase()}.${stamp}@student.local`
    const id = (await call('POST', '/api/students', { token: admin, json: { firstName: 'Dir', lastName: `Student${key}`, email, studentNumber: `DA${key}${stamp}`, password: 'Password1!', groupId: group.id } })).body.id
    return { id, token: await login(email, 'Password1!') }
  }
  const s1 = await makeStudent('A')
  const s2 = await makeStudent('B')
  const s3 = await makeStudent('C')
  const s4 = await makeStudent('D')
  const s5 = await makeStudent('E')

  // ---------- directions (§4) ----------
  check('D01 a teacher without the capability cannot open a direction', (await call('POST', '/api/directions', { token: supervisor.token, json: { departmentId, name: `Nope ${stamp}` } })).body.code, 'access.forbidden')
  const created = await call('POST', '/api/directions', { token: manager.token, json: { departmentId, name: `Direction A ${stamp}`, description: 'Machine learning' } })
  check('D02 a direction manager opens a direction and manages it', `${created.status} ${created.body.managerId === manager.id}`, '201 true')
  const directionA = created.body
  cleanup.addLast(`direction ${directionA.name}`, () => call('DELETE', `/api/directions/${directionA.id}`, { token: admin }))
  check('D03 the name is unique within the department', (await call('POST', '/api/directions', { token: manager.token, json: { departmentId, name: `Direction A ${stamp}` } })).body.code, 'direction.nameTaken')
  check('D04 an unknown department is refused', (await call('POST', '/api/directions', { token: manager.token, json: { departmentId: '00000000-0000-0000-0000-000000000001', name: `X ${stamp}` } })).body.code, 'direction.departmentInvalid')
  check('D05 an administrator must name a direction manager', (await call('POST', '/api/directions', { token: admin, json: { departmentId, name: `Y ${stamp}`, managerId: supervisor.id } })).body.code, 'direction.managerInvalid')
  check('D06 another manager cannot edit it', (await call('PUT', `/api/directions/${directionA.id}`, { token: teacherAsManager, json: { departmentId, name: 'Taken over' } })).body.code, 'direction.notManager')
  check('D07 a student lists their department\'s directions', (await call('GET', '/api/directions', { token: s1.token })).body.some((d) => d.id === directionA.id), true)
  const managerPicker = (await call('GET', `/api/staff/options?role=directionManager&search=${stamp}`, { token: admin })).body
  check('D08 the manager picker lists only direction managers', managerPicker.map((o) => o.id).join(','), manager.id)
  const managerRole = (await call('GET', `/api/staff/${manager.id}`, { token: admin })).body.assignments.find((a) => a.role === 'DirectionManager')
  const managerRemoval = (await call('DELETE', `/api/staff/${manager.id}/roles/${managerRole.id}`, { token: admin })).body
  check('D09 the manager\'s role cannot be removed while in use', `${managerRemoval.code} ${managerRemoval.errors?.[0]?.kind}`, 'roleAssignment.inUse managedDirection')
  check('D10 nor can the manager be deactivated', (await call('PATCH', `/api/staff/${manager.id}/deactivate`, { token: admin })).body.code, 'staff.managesDirections')

  const spareDepartment = (await call('POST', '/api/departments', { token: admin, json: { facultyId: group.facultyId, name: `Spare ${stamp}`, shortName: `SP${stamp}` } })).body
  cleanup.addLast(`department ${spareDepartment.shortName}`, () => call('DELETE', `/api/departments/${spareDepartment.id}`, { token: admin }))
  // Phase 12 §4: the manager named for the spare direction covers its department.
  await grantRoles(call, cleanup, admin, manager.id, [{ role: 'DirectionManager', scopeKind: 'Department', scopeId: spareDepartment.id }])
  const spareDirection = (await call('POST', '/api/directions', { token: admin, json: { departmentId: spareDepartment.id, name: `Spare ${stamp}`, managerId: manager.id } })).body
  cleanup.addLast(`direction ${spareDirection.name}`, () => call('DELETE', `/api/directions/${spareDirection.id}`, { token: admin }))
  check('D11 a department with directions cannot be deleted', (await call('DELETE', `/api/departments/${spareDepartment.id}`, { token: admin })).body.code, 'department.hasDirections')

  // ---------- topics under directions (§4.3) ----------
  async function makeTopic(token, title, json) {
    const response = await call('POST', '/api/topics', { token, json: { title, ...json } })
    if (response.status === 201) {
      cleanup.addLast(`topic ${title}`, () => call('DELETE', `/api/topics/${response.body.id}`, { token: admin }))
    }
    return response
  }
  const byManager = await makeTopic(manager.token, `Manager for supervisor ${stamp}`, { directionId: directionA.id, supervisorId: supervisor.id })
  check('T01 a manager publishes a topic for another teacher', `${byManager.status} ${byManager.body.supervisorId === supervisor.id}`, '201 true')
  check('T02 a teacher cannot name another supervisor', (await makeTopic(supervisor.token, `Not mine ${stamp}`, { directionId: directionA.id, supervisorId: manager.id })).body.code, 'direction.notManager')
  const bySupervisor = (await makeTopic(supervisor.token, `Supervisor own ${stamp}`, { directionId: directionA.id, description: 'Original description' })).body
  check('T03 a teacher publishes under a direction of a department their role covers', bySupervisor.directionId, directionA.id)
  check('T04 a teacher cannot move a topic to another direction', (await call('PUT', `/api/topics/${bySupervisor.id}`, { token: supervisor.token, json: { title: bySupervisor.title, directionId: seedDirection.id } })).body.code, 'access.forbidden')
  check('T05 the manager sees the topics of their direction', (await call('GET', '/api/topics', { token: manager.token })).body.some((t) => t.id === bySupervisor.id), true)
  check('T06 a direction with topics cannot be deleted', (await call('DELETE', `/api/directions/${directionA.id}`, { token: manager.token })).body.code, 'direction.hasTopics')
  check('T07 a proposal names a direction of the student\'s department', (await call('POST', '/api/topics/proposals', { token: s5.token, json: { title: 'Elsewhere', supervisorId: supervisor.id, directionId: spareDirection.id } })).body.code, 'direction.invalid')

  const satisfied = (reservation) => reservation.seats.filter((s) => s.isSatisfied).map((s) => s.seat).join(',')
  const proposal = (await call('POST', '/api/topics/proposals', { token: s5.token, json: { title: `Proposal ${stamp}`, supervisorId: supervisor.id, directionId: directionA.id } })).body
  check('T08 a proposal starts with no approvals', `${proposal.status}|${satisfied(proposal)}`, 'Pending|')

  // ---------- three approvals (§5.2) ----------
  const r1 = (await call('POST', `/api/topics/${byManager.body.id}/reserve`, { token: s1.token })).body
  check('A01 a reservation waits for approvals', r1.status, 'Pending')
  check('A02 the creator\'s seat starts approved', satisfied(r1), 'Direction')
  check('A03 a teacher without a seat cannot approve', (await call('POST', `/api/reservations/${r1.id}/approve`, { token: teacher })).body.code, 'approval.notApprover')
  check('A04 an approved seat cannot approve again', (await call('POST', `/api/reservations/${r1.id}/approve`, { token: manager.token })).body.code, 'approval.seatSatisfied')
  const afterSupervisor = (await call('POST', `/api/reservations/${r1.id}/approve`, { token: supervisor.token })).body
  check('A05 two of three approvals', `${afterSupervisor.status}|${satisfied(afterSupervisor)}`, 'Pending|Direction,Supervision')
  check('A06 the student holds no topic yet', (await call('GET', `/api/students/${s1.id}`, { token: admin })).body.topicId, null)
  check('A07 the administrator sees it waiting for them', (await call('GET', '/api/reservations/pending?waitingForMe=true', { token: admin })).body.some((r) => r.id === r1.id), true)
  check('A08 the supervisor no longer does', (await call('GET', '/api/reservations/pending?waitingForMe=true', { token: supervisor.token })).body.some((r) => r.id === r1.id), false)
  check('A09 the third approval completes it', (await call('POST', `/api/reservations/${r1.id}/approve`, { token: admin })).body.status, 'Approved')
  const s1Profile = (await call('GET', `/api/students/${s1.id}`, { token: admin })).body
  check('A10 the topic and the supervisor are the student\'s', `${s1Profile.topicId === byManager.body.id} ${s1Profile.supervisorId === supervisor.id}`, 'true true')

  // ---------- return, resubmit, edits, rejection (§5.3) ----------
  const r2 = (await call('POST', `/api/topics/${bySupervisor.id}/reserve`, { token: s2.token })).body
  check('R01 the supervisor\'s own topic starts with their approval', satisfied(r2), 'Supervision')
  await call('POST', `/api/reservations/${r2.id}/approve`, { token: admin })
  check('R02 a return needs a comment', (await call('POST', `/api/reservations/${r2.id}/return`, { token: manager.token, json: { comment: ' ' } })).body.code, 'validation.failed')
  const returned = (await call('POST', `/api/reservations/${r2.id}/return`, { token: manager.token, json: { comment: 'Narrow the scope' } })).body
  check('R03 the manager returns it', `${returned.status}|${returned.returnComment}|${returned.canResubmit}`, 'Returned|Narrow the scope|false')
  check('R04 a returned request cannot be approved', (await call('POST', `/api/reservations/${r2.id}/approve`, { token: manager.token })).body.code, 'reservation.invalidState')
  check('R05 another student cannot resubmit it', (await call('POST', `/api/reservations/${r2.id}/resubmit`, { token: s1.token, json: { title: 'Mine now' } })).body.code, 'reservation.notYours')
  check('R05a the student may resubmit', (await call('GET', `/api/reservations/${r2.id}`, { token: s2.token })).body.canResubmit, true)
  const resubmitted = (await call('POST', `/api/reservations/${r2.id}/resubmit`, { token: s2.token, json: { title: `Narrowed ${stamp}`, description: 'Narrower' } })).body
  check('R06 resubmitting clears every approval', `${resubmitted.status}|${satisfied(resubmitted)}`, 'Pending|')
  check('R07 the catalogue topic carries the new wording while the request is open', (await call('GET', `/api/topics/${bySupervisor.id}`, { token: admin })).body.title, `Narrowed ${stamp}`)
  await call('POST', `/api/reservations/${r2.id}/approve`, { token: admin })
  await call('POST', `/api/reservations/${r2.id}/approve`, { token: supervisor.token })
  const edited = (await call('PUT', `/api/reservations/${r2.id}/wording`, { token: manager.token, json: { title: `Edited ${stamp}` } })).body
  check('R08 an approver\'s edit is their approval and reopens the others', `${edited.status}|${satisfied(edited)}`, 'Pending|Direction')
  check('R09 the timeline records every decision', edited.timeline.map((d) => d.kind).join(','), 'Approved,Approved,Returned,Approved,Approved,Edited')
  check('R10 any approver can reject', (await call('POST', `/api/reservations/${r2.id}/reject`, { token: admin, json: { comment: 'Not this year' } })).body.status, 'Rejected')
  const restored = (await call('GET', `/api/topics/${bySupervisor.id}`, { token: admin })).body
  check('R11 the catalogue topic gets its original wording back', `${restored.status}|${restored.title}|${restored.description}`, `Available|Supervisor own ${stamp}|Original description`)
  check('R12 the history keeps the wording asked for', (await call('GET', '/api/reservations/mine', { token: s2.token })).body[0].topicTitle, `Supervisor own ${stamp}`)

  const r2b = (await call('POST', `/api/topics/${bySupervisor.id}/reserve`, { token: s2.token })).body
  await call('POST', `/api/reservations/${r2b.id}/approve`, { token: manager.token })
  const formEdit = await call('PUT', `/api/topics/${bySupervisor.id}`, { token: admin, json: { title: `Admin wording ${stamp}`, directionId: directionA.id, supervisorId: supervisor.id } })
  check('R13 an administrator\'s form edit reopens the other seats', `${formEdit.status}|${satisfied((await call('GET', `/api/reservations/${r2b.id}`, { token: admin })).body)}`, '200|Administration')
  await call('POST', `/api/reservations/${r2b.id}/cancel`, { token: s2.token })
  check('R14 a cancelled request gives the wording back too', (await call('GET', `/api/topics/${bySupervisor.id}`, { token: admin })).body.title, `Supervisor own ${stamp}`)

  // ---------- the administrator's assignment (§5.3) ----------
  const teacherTopic = (await makeTopic(teacher, `Seed manager topic ${stamp}`, { directionId: seedDirection.id })).body
  check('C01 the creator\'s two seats and the assignment complete it at once', (await call('PUT', `/api/students/${s3.id}/topic`, { token: admin, json: { topicId: teacherTopic.id } })).body.status, 'Approved')
  const replacement = (await call('PUT', `/api/students/${s3.id}/topic`, { token: admin, json: { topicId: bySupervisor.id } })).body
  check('C02 an assignment over a held topic waits', `${replacement.status}|${satisfied(replacement)}`, 'Pending|Administration,Supervision')
  check('C03 the held topic stays the student\'s meanwhile', (await call('GET', `/api/students/${s3.id}`, { token: admin })).body.topicId, teacherTopic.id)
  check('C04 the manager\'s approval completes the replacement', (await call('POST', `/api/reservations/${replacement.id}/approve`, { token: manager.token })).body.status, 'Approved')
  check('C05 the old topic returns to the catalogue', (await call('GET', `/api/topics/${teacherTopic.id}`, { token: admin })).body.status, 'Available')

  // ---------- a change of supervisor can complete a request (§5.2) ----------
  const forSupervisor = (await makeTopic(manager.token, `For the supervisor ${stamp}`, { directionId: directionA.id, supervisorId: supervisor.id })).body
  const r4 = (await call('POST', `/api/topics/${forSupervisor.id}/reserve`, { token: s4.token })).body
  await call('POST', `/api/reservations/${r4.id}/approve`, { token: admin })
  const moved = await call('PUT', `/api/topics/${forSupervisor.id}`, { token: admin, json: { title: forSupervisor.title, directionId: directionA.id, supervisorId: manager.id } })
  check('S01 moving the topic to a supervisor who already approved completes it', `${moved.status}|${moved.body.status}`, '200|Approved')
  check('S02 the student\'s supervisor is the new one', (await call('GET', `/api/students/${s4.id}`, { token: admin })).body.supervisorId, manager.id)

  // ---------- the panel seats (§6) ----------
  const templates = (await call('GET', '/api/task-templates', { token: admin })).body
    .filter((t) => t.isActive && t.facultyId === group.facultyId)
    .sort((a, b) => a.order - b.order)
  await call('POST', `/api/groups/${group.id}/assign-all-task-templates`, { token: admin, json: { items: [{ taskTemplateId: templates[0].id, deadline: '2099-01-01T00:00:00Z' }] } })
  const groupStep = (await call('GET', `/api/groups/${group.id}/tasks`, { token: admin })).body[0]
  const s1Step = (await call('GET', '/api/student-tasks/mine', { token: s1.token })).body[0]
  const seatsOf = (step) => step.panel.map((s) => s.seat).join(',')
  check('P01 the direction manager sits beside the supervisor', seatsOf((await call('GET', `/api/student-tasks/${s1Step.id}`, { token: supervisor.token })).body), 'Supervisor,DirectionManager')
  check('P02 only a standards controller can be assigned', (await call('PUT', `/api/group-tasks/${groupStep.id}/standards-controller`, { token: admin, json: { userId: supervisor.id } })).body.code, 'groupTask.controllerInvalid')
  check('P03 a teacher cannot assign one', (await call('PUT', `/api/group-tasks/${groupStep.id}/standards-controller`, { token: teacher, json: { userId: controller.id } })).status, 403)
  const assignedControl = (await call('PUT', `/api/group-tasks/${groupStep.id}/standards-controller`, { token: admin, json: { userId: controller.id } })).body
  check('P04 the controller reaches every student of the step', assignedControl.affectedSteps, 5)
  const controllerRole = (await call('GET', `/api/staff/${controller.id}`, { token: admin })).body.assignments[0]
  const controllerRemoval = (await call('DELETE', `/api/staff/${controller.id}/roles/${controllerRole.id}`, { token: admin })).body
  check('P05 the controller\'s role cannot be removed while in use', `${controllerRemoval.code} ${controllerRemoval.errors?.[0]?.kind}`, 'roleAssignment.inUse controlledStep')
  check('P06 the standards control seat joins the panel', seatsOf((await call('GET', `/api/student-tasks/${s1Step.id}`, { token: supervisor.token })).body), 'Supervisor,DirectionManager,StandardsControl')
  check('P07 the manager cannot be added as an extra reviewer', (await call('POST', `/api/student-tasks/${s1Step.id}/reviewers`, { token: admin, json: { reviewerId: manager.id } })).body.code, 'panel.reviewerExists')

  check('P08 the student submits', (await call('POST', `/api/student-tasks/${s1Step.id}/submissions`, { token: s1.token, form: form() })).status, 200)
  const controllerView = (await call('GET', `/api/student-tasks/${s1Step.id}`, { token: controller.token })).body
  check('P09 the controller opens the step and decides in their own seat', `${controllerView.canDecide} ${controllerView.mySeat}`, 'true StandardsControl')
  const controllerProgress = await call('GET', `/api/groups/${group.id}/progress`, { token: controller.token })
  check('P10 the controller sees the group but opens no student in full', `${controllerProgress.status} ${controllerProgress.body.students?.some((s) => s.canOpen)}`, '200 false')
  check('P11 the step waits in the controller\'s queue', (await call('GET', '/api/review/queue', { token: controller.token })).body.items.some((i) => i.studentTaskId === s1Step.id), true)
  check('P12 and in the manager\'s', (await call('GET', '/api/review/queue', { token: manager.token })).body.items.some((i) => i.studentTaskId === s1Step.id), true)
  const pendingId = controllerView.pendingSubmissionId
  check('P13 the controller approves without a mark', (await call('POST', `/api/submissions/${pendingId}/approve`, { token: controller.token, json: {} })).body.panelApproved, 1)
  check('P14 the manager\'s seat needs a mark', (await call('POST', `/api/submissions/${pendingId}/approve`, { token: manager.token, json: {} })).body.code, 'review.markRequired')
  await call('POST', `/api/submissions/${pendingId}/approve`, { token: manager.token, json: { mark: 80 } })
  const done = (await call('POST', `/api/submissions/${pendingId}/approve`, { token: supervisor.token, json: { mark: 91 } })).body
  check('P15 the step completes with the average of the marked seats', `${done.status} ${done.mark}`, 'Approved 86')
  check('P16 the group step counts one student through standards control', (await call('GET', `/api/groups/${group.id}/tasks`, { token: admin })).body[0].standardsControlApproved, 1)

  // A student who joins later has the controller's seat at once: it is derived from the group step.
  const late = await makeStudent('F')
  const lateStep = (await call('GET', '/api/student-tasks/mine', { token: late.token })).body[0]
  check('P17 a late joiner has the standards control seat', (await call('GET', `/api/student-tasks/${lateStep.id}`, { token: admin })).body.panel.some((s) => s.seat === 'StandardsControl' && s.reviewerId === controller.id), true)
  check('P18 removing the controller', (await call('PUT', `/api/group-tasks/${groupStep.id}/standards-controller`, { token: admin, json: { userId: null } })).status, 200)
  check('P19 the group step has no controller', (await call('GET', `/api/groups/${group.id}/tasks`, { token: admin })).body[0].standardsControllerId, null)
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
