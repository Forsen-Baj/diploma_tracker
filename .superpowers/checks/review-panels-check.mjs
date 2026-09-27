// Design 2026-09-24 §3 and §5: review panels. Runs against the live local API on :5000 and leaves
// nothing behind (checkCleanup.mjs).
import { createCleanup, giveTopic, removeGroup } from './checkCleanup.mjs'

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
  const teacherId = (await call('GET', '/api/teachers', { token: admin })).body.find((t) => t.email === 'teacher@diploma.local').id

  // Arrange: a group with two steps, one student whose topic (and so supervisor) is the seed
  // teacher's, a teacher who reviews the group, two extra reviewers and an outsider.
  const department = (await call('GET', '/api/departments', { token: admin })).body[0]
  const group = (await call('POST', '/api/groups', { token: admin, json: { departmentId: department.id, code: `RP${stamp}`, academicYear: '2026/2027', description: '' } })).body
  cleanup.add(`group ${group.code}`, () => removeGroup(call, admin, group))

  async function makeTeacher(key) {
    const email = `panel.${key.toLowerCase()}.${stamp}@diploma.local`
    const id = (await call('POST', '/api/teachers', { token: admin, json: { firstName: key, lastName: `Panel${key}${stamp}`, email, password: 'Teacher456!' } })).body.id
    cleanup.add(`teacher ${email} -> deactivate`, () => call('PATCH', `/api/teachers/${id}/deactivate`, { token: admin }))
    return { id, token: await login(email, 'Teacher456!') }
  }
  const watcher = await makeTeacher('Watcher')
  const extraA = await makeTeacher('Alpha')
  const extraB = await makeTeacher('Beta')
  const outsider = await makeTeacher('Outsider')
  await call('POST', `/api/groups/${group.id}/reviewers`, { token: admin, json: { reviewerId: watcher.id } })

  const templates = (await call('GET', '/api/task-templates', { token: admin })).body
    .filter((t) => t.isActive && t.facultyId === department.facultyId)
    .sort((a, b) => a.order - b.order)
  const future = '2099-01-01T00:00:00Z'
  await call('POST', `/api/groups/${group.id}/assign-all-task-templates`, { token: admin, json: { items: [{ taskTemplateId: templates[0].id, deadline: future }, { taskTemplateId: templates[1].id, deadline: future }] } })

  const studentEmail = `panel.${stamp}@student.local`
  const student = (await call('POST', '/api/students', { token: admin, json: { firstName: 'Panel', lastName: 'Student', email: studentEmail, studentNumber: `P${stamp}`, password: 'Password1!', groupId: group.id } })).body
  const studentToken = await login(studentEmail, 'Password1!')
  await giveTopic(call, cleanup, { admin, teacher, departmentId: department.id, studentId: student.id, title: `Panel Topic ${stamp}` })
  const steps = (await call('GET', '/api/student-tasks/mine', { token: studentToken })).body.sort((a, b) => a.order - b.order)
  const step1 = steps[0].id
  const step2 = steps[1].id

  // ---------- the panel and who may change it ----------
  const fresh = (await call('GET', `/api/student-tasks/${step1}`, { token: teacher })).body
  check('01 a fresh step has the supervisor seat only', fresh.panel.length, 1)
  check('01a that seat is the supervisor', `${fresh.panel[0].seat}:${fresh.panel[0].reviewerId}`, `Supervisor:${teacherId}`)
  check('01b my work counts one seat', steps[0].panelSize, 1)

  const options = (await call('GET', `/api/staff/options?search=PanelAlpha${stamp}`, { token: watcher.token })).body
  check('02 the staff search finds a teacher', options.some((o) => o.id === extraA.id), true)
  check('03 a student cannot search staff', (await call('GET', '/api/staff/options', { token: studentToken })).status, 403)

  check('04 an unrelated teacher cannot change the panel', (await call('POST', `/api/student-tasks/${step1}/reviewers`, { token: outsider.token, json: { reviewerId: extraA.id } })).body.code, 'studentTask.notFound')
  const addedA = await call('POST', `/api/student-tasks/${step1}/reviewers`, { token: watcher.token, json: { reviewerId: extraA.id } })
  check('05 a group reviewer adds an extra reviewer', addedA.body.panel?.length, 2)
  const addedB = await call('POST', `/api/student-tasks/${step1}/reviewers`, { token: teacher, json: { reviewerId: extraB.id } })
  check('06 the supervisor adds another', addedB.body.panel?.length, 3)
  check('07 the supervisor cannot be an extra reviewer', (await call('POST', `/api/student-tasks/${step1}/reviewers`, { token: admin, json: { reviewerId: teacherId } })).body.code, 'panel.reviewerIsSupervisor')
  check('08 nobody sits twice', (await call('POST', `/api/student-tasks/${step1}/reviewers`, { token: admin, json: { reviewerId: extraA.id } })).body.code, 'panel.reviewerExists')
  check('09 an unknown person is refused', (await call('POST', `/api/student-tasks/${step1}/reviewers`, { token: admin, json: { reviewerId: crypto.randomUUID() } })).body.code, 'panel.reviewerInvalid')

  check('10 an extra reviewer opens the step', (await call('GET', `/api/student-tasks/${step1}`, { token: extraA.token })).status, 200)
  check('10a but not the group', (await call('GET', `/api/groups/${group.id}`, { token: extraA.token })).body.code, 'group.notFound')
  check('10b nor the student\'s other step', (await call('GET', `/api/student-tasks/${step2}`, { token: extraA.token })).body.code, 'studentTask.notFound')
  check('11 an extra reviewer cannot change the panel', (await call('POST', `/api/student-tasks/${step1}/reviewers`, { token: extraA.token, json: { reviewerId: outsider.id } })).body.code, 'panel.notAllowed')

  // ---------- version 1: one approval, then a return ----------
  const v1 = (await call('POST', `/api/student-tasks/${step1}/submissions`, { token: studentToken, form: form() })).body
  const v1Id = v1.timeline[0].id
  const inQueue = async (token, stepId = step1) =>
    (await call('GET', `/api/review/queue?groupId=${group.id}&pageSize=100`, { token })).body.items.some((i) => i.studentTaskId === stepId)

  check('12 an extra reviewer\'s queue has it', await inQueue(extraA.token), true)
  check('12a a group reviewer only watches', await inQueue(watcher.token), false)
  check('13 a group reviewer cannot decide', (await call('POST', `/api/submissions/${v1Id}/approve`, { token: watcher.token, json: { mark: 90 } })).body.code, 'review.notOnPanel')
  const afterA = (await call('POST', `/api/submissions/${v1Id}/approve`, { token: extraA.token, json: { mark: 90 } })).body
  check('14 one approval keeps the step under review', `${afterA.status} ${afterA.panelApproved}/${afterA.panelSize}`, 'Submitted 1/3')
  check('15 a satisfied seat cannot decide again', (await call('POST', `/api/submissions/${v1Id}/approve`, { token: extraA.token, json: { mark: 95 } })).body.code, 'review.seatSatisfied')
  check('16 it leaves that reviewer\'s queue', await inQueue(extraA.token), false)
  const afterReturn = (await call('POST', `/api/submissions/${v1Id}/return`, { token: extraB.token, json: { comment: 'Fix the formatting' } })).body
  check('17 one return sends the step back', afterReturn.status, 'Returned')
  check('17a the returning seat shows it', afterReturn.panel.find((s) => s.reviewerId === extraB.id)?.state, 'Returned')

  // ---------- version 2: the approval of version 1 still counts ----------
  const v2 = (await call('POST', `/api/student-tasks/${step1}/submissions`, { token: studentToken, form: form() })).body
  const v2Id = v2.timeline.at(-1).id
  check('18 approvals stick across versions', `${v2.panelApproved}/${v2.panelSize}`, '1/3')
  check('18a the earlier approver is not asked again', await inQueue(extraA.token), false)
  check('18b the reviewer who returned it is', await inQueue(extraB.token), true)
  const afterSupervisor = (await call('POST', `/api/submissions/${v2Id}/approve`, { token: teacher, json: { mark: 81 } })).body
  check('19 the supervisor approves, one seat still open', `${afterSupervisor.status} ${afterSupervisor.panelApproved}/${afterSupervisor.panelSize}`, 'Submitted 2/3')
  const done = (await call('POST', `/api/submissions/${v2Id}/approve`, { token: extraB.token, json: { mark: 86, comment: 'Good now' } })).body
  check('20 the last open seat approves the step', done.status, 'Approved')
  check('21 the mark is the rounded panel average', done.mark, 86) // (90 + 81 + 86) / 3 = 85.67
  check('22 an approved step keeps its panel', (await call('POST', `/api/student-tasks/${step1}/reviewers`, { token: admin, json: { reviewerId: outsider.id } })).body.code, 'step.alreadyApproved')
  const studentView = (await call('GET', `/api/student-tasks/${step1}`, { token: studentToken })).body
  check('23 the student sees every seat', studentView.panel.length, 3)
  check('23a and every reviewer\'s decision per version', studentView.timeline.map((s) => s.reviews.length).join(','), '2,2')

  // ---------- downloads follow the step ----------
  const fileId = v1.timeline[0].files[0].id
  check('24 an extra reviewer downloads the step\'s file', (await call('GET', `/api/submission-files/${fileId}`, { token: extraA.token })).status, 200)
  check('24a an outsider does not', (await call('GET', `/api/submission-files/${fileId}`, { token: outsider.token })).status, 404)

  // ---------- step 2: an administrator stands in, and a removal completes the panel ----------
  await call('POST', `/api/student-tasks/${step2}/reviewers`, { token: teacher, json: { reviewerId: extraA.id } })
  const s2 = (await call('POST', `/api/student-tasks/${step2}/submissions`, { token: studentToken, form: form() })).body
  const s2Id = s2.timeline[0].id
  const standIn = (await call('POST', `/api/submissions/${s2Id}/approve`, { token: admin, json: { mark: 70 } })).body
  check('25 an administrator fills the supervisor seat', `${standIn.status} ${standIn.panelApproved}/${standIn.panelSize}`, 'Submitted 1/2')
  check('25a the supervisor has nothing left to decide', (await call('POST', `/api/submissions/${s2Id}/approve`, { token: teacher, json: { mark: 99 } })).body.code, 'review.seatSatisfied')
  check('26 removing someone who is not on the panel', (await call('DELETE', `/api/student-tasks/${step2}/reviewers/${outsider.id}`, { token: teacher })).body.code, 'panel.reviewerNotFound')
  const removed = (await call('DELETE', `/api/student-tasks/${step2}/reviewers/${extraA.id}`, { token: watcher.token })).body
  check('27 a removal that leaves every seat approved approves the step', `${removed.status} ${removed.mark}`, 'Approved 70')
}

try {
  await runChecks()
} finally {
  await cleanup.run()
}

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
