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

// ---------- minimal zip writer (same shape as hardening-check.mjs) ----------
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

// A minimal, genuine .docx (same parts as hardening-check.mjs): [Content_Types].xml, the package
// relationship and a non-empty word/document.xml, which OfficePackageInspector requires of a file
// named .docx. A PDF is matched on its signature only, so the stub below is a valid .pdf.
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const docx = new Uint8Array(zip([
  { name: '[Content_Types].xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
  { name: '_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
  { name: 'word/document.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body><w:p><w:r><w:t>Work</w:t></w:r></w:p></w:body></w:document>` }
]))
const pdf = new TextEncoder().encode('%PDF-1.4\n%fake\n')
const fakeDocx = new TextEncoder().encode('not a zip file')
const big = new Uint8Array(21 * 1024 * 1024)
big.set(docx)

function form({ main, mainName = 'work.docx', supporting = [], message } = {}) {
  const data = new FormData()
  if (main) data.append('mainFile', new Blob([main]), mainName)
  supporting.forEach(([bytes, name]) => data.append('supportingFiles', new Blob([bytes]), name))
  if (message) data.append('message', message)
  return data
}

async function runChecks() {
const admin = await login('admin@diploma.local', 'Admin123!')
const teacher = await login('teacher@diploma.local', 'Teacher123!')

// Arrange: group with two steps, a student, the seed teacher as reviewer, a second teacher unrelated
const department = (await call('GET', '/api/departments', { token: admin })).body[0]
const group = (await call('POST', '/api/groups', { token: admin, json: { departmentId: department.id, code: `WF${stamp}`, academicYear: '2026/2027', description: '' } })).body
cleanup.add(`group ${group.code}`, () => removeGroup(call, admin, group))
const teachers = (await call('GET', '/api/teachers', { token: admin })).body
const teacherId = teachers.find((t) => t.email === 'teacher@diploma.local').id
await call('POST', `/api/groups/${group.id}/reviewers`, { token: admin, json: { reviewerId: teacherId } })
const otherTeacherEmail = `other.${stamp}@diploma.local`
const otherTeacherId = (await call('POST', '/api/teachers', { token: admin, json: { firstName: 'Other', lastName: 'Teacher', email: otherTeacherEmail, password: 'Teacher456!' } })).body.id
cleanup.add(`teacher ${otherTeacherEmail} -> deactivate`, () => call('PATCH', `/api/teachers/${otherTeacherId}/deactivate`, { token: admin }))
const otherTeacher = await login(otherTeacherEmail, 'Teacher456!')

// Step templates are per faculty (Order is unique per faculty); a template from a different
// faculty than the group's own department fails assignment with groupTask.templateFacultyMismatch.
const templates = (await call('GET', '/api/task-templates', { token: admin })).body
  .filter((t) => t.isActive && t.facultyId === department.facultyId)
  .sort((a, b) => a.order - b.order)
const past = '2000-01-01T00:00:00Z'
const future = '2099-01-01T00:00:00Z'
await call('POST', `/api/groups/${group.id}/assign-all-task-templates`, { token: admin, json: { items: [{ taskTemplateId: templates[0].id, deadline: past }, { taskTemplateId: templates[1].id, deadline: future }] } })

const studentEmail = `flow.${stamp}@student.local`
const student = (await call('POST', '/api/students', { token: admin, json: { firstName: 'Flow', lastName: 'Student', email: studentEmail, studentNumber: `F${stamp}`, password: 'Password1!', groupId: group.id } })).body
const studentToken = await login(studentEmail, 'Password1!')

// The student is added to the group after its steps are assigned, so LateJoinerTaskAssigner
// creates the StudentTask rows at membership time (Services/LateJoinerTaskAssigner.cs) - nothing
// creates them lazily on read.
const steps = (await call('GET', '/api/student-tasks/mine', { token: studentToken })).body
check('01 steps exist on join', steps.length, 2)
check('02 first step can submit', steps[0].canSubmit, true)
check('03 second step blocked', steps[1].blockReason, 'step.previousNotApproved')
check('04 submit second step refused', (await call('POST', `/api/student-tasks/${steps[1].id}/submissions`, { token: studentToken, form: form({ main: docx }) })).body.code, 'step.previousNotApproved')

// File rules
check('05 main missing', (await call('POST', `/api/student-tasks/${steps[0].id}/submissions`, { token: studentToken, form: form({}) })).body.code, 'file.mainMissing')
check('06 wrong main type', (await call('POST', `/api/student-tasks/${steps[0].id}/submissions`, { token: studentToken, form: form({ main: docx, mainName: 'work.txt' }) })).body.code, 'file.typeNotAllowed')
check('07 content mismatch', (await call('POST', `/api/student-tasks/${steps[0].id}/submissions`, { token: studentToken, form: form({ main: fakeDocx }) })).body.code, 'file.contentMismatch')
check('08 blocked supporting type', (await call('POST', `/api/student-tasks/${steps[0].id}/submissions`, { token: studentToken, form: form({ main: docx, supporting: [[docx, 'tool.exe']] }) })).body.code, 'file.typeNotAllowed')
// A trailing dot or space is stripped by Windows (and by a browser writing a download to disk)
// before the name reaches the filesystem, so "tool.exe." and "tool.exe " are the same file as
// "tool.exe" - Path.GetExtension alone does not see that and previously let both through.
check('08a trailing-dot supporting file refused', (await call('POST', `/api/student-tasks/${steps[0].id}/submissions`, { token: studentToken, form: form({ main: docx, supporting: [[docx, 'tool.exe.']] }) })).body.code, 'file.typeNotAllowed')
check('08b trailing-space supporting file refused', (await call('POST', `/api/student-tasks/${steps[0].id}/submissions`, { token: studentToken, form: form({ main: docx, supporting: [[docx, 'tool.exe ']] }) })).body.code, 'file.typeNotAllowed')
check('09 too many supporting', (await call('POST', `/api/student-tasks/${steps[0].id}/submissions`, { token: studentToken, form: form({ main: docx, supporting: [[docx, 'a.zip'], [docx, 'b.zip'], [docx, 'c.zip'], [docx, 'd.zip']] }) })).body.code, 'file.tooMany')
check('10 file too large', (await call('POST', `/api/student-tasks/${steps[0].id}/submissions`, { token: studentToken, form: form({ main: big }) })).body.code, 'file.tooLarge')

// Submit -> return -> resubmit -> approve
const first = await call('POST', `/api/student-tasks/${steps[0].id}/submissions`, { token: studentToken, form: form({ main: docx, supporting: [[pdf, 'slides.pdf']], message: 'First version' }) })
check('11 submit', first.status, 200)
check('12 late flag', first.body.timeline[0].isLate, true)
check('13 awaiting review blocks resubmit', (await call('POST', `/api/student-tasks/${steps[0].id}/submissions`, { token: studentToken, form: form({ main: docx }) })).body.code, 'step.awaitingReview')

const queue = (await call('GET', '/api/review/queue', { token: teacher })).body.items
const queued = queue.find((item) => item.studentTaskId === steps[0].id)
check('14 queue contains submission', Boolean(queued), true)
check('15 unrelated teacher queue empty for it', (await call('GET', '/api/review/queue', { token: otherTeacher })).body.items.some((item) => item.studentTaskId === steps[0].id), false)
check('16 unrelated teacher cannot decide', (await call('POST', `/api/submissions/${queued.submissionId}/return`, { token: otherTeacher, json: { comment: 'x' } })).body.code, 'submission.notReviewer')
check('17 return requires comment', (await call('POST', `/api/submissions/${queued.submissionId}/return`, { token: teacher, json: {} })).body.code, 'review.commentRequired')
const returned = await call('POST', `/api/submissions/${queued.submissionId}/return`, { token: teacher, json: { comment: 'Add references' } })
check('18 returned', returned.body.status, 'Returned')
check('19 decided twice refused', (await call('POST', `/api/submissions/${queued.submissionId}/approve`, { token: teacher, json: { mark: 90 } })).body.code, 'submission.alreadyDecided')

const second = await call('POST', `/api/student-tasks/${steps[0].id}/submissions`, { token: studentToken, form: form({ main: pdf, mainName: 'work.pdf', message: 'Fixed' }) })
check('20 resubmit version 2', second.body.timeline.at(-1).version, 2)
const secondId = second.body.timeline.at(-1).id
check('21 approve requires mark', (await call('POST', `/api/submissions/${secondId}/approve`, { token: teacher, json: {} })).body.code, 'review.markRequired')
check('22 mark out of range', (await call('POST', `/api/submissions/${secondId}/approve`, { token: teacher, json: { mark: 101 } })).body.code, 'review.markOutOfRange')
const approved = await call('POST', `/api/submissions/${secondId}/approve`, { token: teacher, json: { mark: 88, comment: 'Good' } })
check('23 approved with mark', approved.body.mark, 88)
check('23a fractional mark refused', (await call('POST', `/api/submissions/${secondId}/approve`, { token: teacher, json: { mark: 88.5 } })).body.code, 'review.markOutOfRange')
check('23b submit against already-approved step refused', (await call('POST', `/api/student-tasks/${steps[0].id}/submissions`, { token: studentToken, form: form({ main: docx }) })).body.code, 'step.alreadyApproved')
check('24 next step unlocked', (await call('GET', '/api/student-tasks/mine', { token: studentToken })).body[1].canSubmit, true)

// Downloads
const fileId = first.body.timeline[0].files.find((f) => f.kind === 'Supporting').id
const download = await call('GET', `/api/submission-files/${fileId}`, { token: teacher })
check('25 reviewer downloads', download.status, 200)
check('26 attachment disposition', (download.headers.get('content-disposition') ?? '').startsWith('attachment'), true)
check('27 supporting served as octet-stream', download.headers.get('content-type'), 'application/octet-stream')
check('28 nosniff header', download.headers.get('x-content-type-options'), 'nosniff')
check('29 unrelated teacher cannot download', (await call('GET', `/api/submission-files/${fileId}`, { token: otherTeacher })).status, 404)
check('30 student downloads own file', (await call('GET', `/api/submission-files/${fileId}`, { token: studentToken })).status, 200)

// Main-file downloads must carry their real MIME type; only the supporting branch was covered above.
const mainFileId = first.body.timeline[0].files.find((f) => f.kind === 'Main').id
const mainDownload = await call('GET', `/api/submission-files/${mainFileId}`, { token: teacher })
check('30a main file served with real content type', mainDownload.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')

// Visibility and progress
check('31 unrelated teacher cannot see group', (await call('GET', `/api/groups/${group.id}`, { token: otherTeacher })).body.code, 'group.notFound')
const groupDetails = await call('GET', `/api/groups/${group.id}`, { token: teacher })
check('32 reviewer sees group', groupDetails.status, 200)
// EF hands back DateTimeKind.Unspecified from datetime2; without a UTC marker, a browser parses
// an offset-less date-time as local and every date in the app is shifted by the viewer's offset.
check('32a timestamp carries a UTC marker', typeof groupDetails.body.createdAt === 'string' && groupDetails.body.createdAt.endsWith('Z'), true)
const progress = (await call('GET', `/api/groups/${group.id}/progress`, { token: teacher })).body
check('33 progress approved count', progress.steps[0].approvedCount, 1)
check('34 progress cell status', progress.students[0].cells[0].status, 'Approved')
check('35 unrelated teacher progress', (await call('GET', `/api/groups/${group.id}/progress`, { token: otherTeacher })).body.code, 'group.notFound')
const mine = (await call('GET', '/api/students/me/progress', { token: studentToken })).body
check('36 student progress approved', `${mine.approved}/${mine.total}`, '1/2')
// Both submissions on this step (v1 and its resubmit v2) land against the same past-deadline
// group task (templates[0]'s deadline is `past`), so both are late - but Task 10 redefined this
// count to be per-step, not per-submission-version: one step submitted late twice is late on ONE
// step, not two (DTOs/Workflow/StudentProgressResponse.cs's own doc comment says as much). Only
// steps[0] is ever submitted in this script - steps[1] is unlocked at check 24 but never submitted -
// so the correct count under the new semantics is 1.
check('37 student progress late count', mine.lateSteps, 1)
check('38 student progress for reviewer', (await call('GET', `/api/students/${student.id}/progress`, { token: teacher })).body.averageMark, 88)
check('39 other student cannot open step', (await call('GET', `/api/student-tasks/${steps[0].id}`, { token: await login('student@diploma.local', 'Student123!') })).body.code, 'studentTask.notYours')
}

try {
  await runChecks()
} finally {
  await cleanup.run()
}

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
