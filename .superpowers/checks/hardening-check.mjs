import { inflateRawSync } from 'node:zlib'
import { createCleanup, giveTopic, removeGroup } from './checkCleanup.mjs'

// Phase 8 §9 verification script (Task 17 step 3): the 35 checks enumerated in the task-17 brief,
// covering sessions/passwords (§2), uploads (§3), identity (§5), archive (§4), queue/progress/
// dashboards (§7, §8), reordering (§6) and templates (§4.6). Same shape as templates-check.mjs:
// global fetch, a check(name, actual, expected) helper, a six-digit stamp, and the shared cleanup
// registry from checkCleanup.mjs.

const API = 'http://localhost:5000'
const stamp = Date.now().toString().slice(-6)
const results = []
const cleanup = createCleanup()

function check(name, actual, expected) {
  const ok = actual === expected
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`)
}

// ---------- minimal zip writer / reader (same shape as templates-check.mjs) ----------
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
function unzip(bytes) {
  const buf = Buffer.from(bytes)
  let eocd = buf.length - 22
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--
  const count = buf.readUInt16LE(eocd + 10)
  let ptr = buf.readUInt32LE(eocd + 16)
  const out = new Map()
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(ptr + 10)
    const compressedSize = buf.readUInt32LE(ptr + 20)
    const nameLength = buf.readUInt16LE(ptr + 28)
    const extraLength = buf.readUInt16LE(ptr + 30)
    const commentLength = buf.readUInt16LE(ptr + 32)
    const localOffset = buf.readUInt32LE(ptr + 42)
    const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLength)
    const start = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28)
    const raw = buf.subarray(start, start + compressedSize)
    out.set(name, (method === 8 ? inflateRawSync(raw) : raw).toString('utf8'))
    ptr += 46 + nameLength + extraLength + commentLength
  }
  return out
}
const textOf = (xml) => [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('')

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const paragraph = (text) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`

// A minimal, genuine .docx: [Content_Types].xml, the package relationship and a non-empty
// word/document.xml. OfficePackageInspector needs the first and last; a template upload opens the
// file with the OpenXML SDK, which also needs _rels/.rels to find the main part. No
// header/footer/markers, since this script never uploads a document with `{{...}}` placeholders.
function docx(bodyXml) {
  return zip([
    { name: '[Content_Types].xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { name: '_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: 'word/document.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${bodyXml}</w:body></w:document>` }
  ])
}

// A well-formed zip with neither [Content_Types].xml nor a word/ part: opens fine as a zip, fails
// OfficePackageInspector.Inspect, so a .docx main file made of these bytes answers
// file.contentMismatch rather than file.typeNotAllowed (the extension is fine; the content is not).
function bogusZip() {
  return zip([{ name: 'hello.txt', content: 'not a Word document' }])
}

// Only the first 8 bytes are ever inspected for a supporting PNG (SubmissionFileRules.
// StartsWithAsync), so a genuine PNG for this script's purposes is just a correct signature.
const pngSignature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
function genuinePng() {
  const bytes = new Uint8Array(16)
  bytes.set(pngSignature)
  return bytes
}
const notAPng = new TextEncoder().encode('this is not a png')

// ---------- http ----------
async function call(method, path, { token, json, form } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (json !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(API + path, { method, headers, body: form ?? (json === undefined ? undefined : JSON.stringify(json)) })
  const type = response.headers.get('content-type') ?? ''
  if (type.includes('json')) return { status: response.status, body: await response.json(), headers: response.headers }
  return { status: response.status, bytes: new Uint8Array(await response.arrayBuffer()), headers: response.headers }
}
const login = async (email, password) => call('POST', '/api/auth/login', { json: { email, password } })
const loginToken = async (email, password) => (await login(email, password)).body.token

function submissionForm({ main, mainName = 'work.docx', supporting = [] } = {}) {
  const form = new FormData()
  if (main) form.append('mainFile', new Blob([main]), mainName)
  supporting.forEach(([bytes, name]) => form.append('supportingFiles', new Blob([bytes]), name))
  return form
}
function templateForm({ name, bytes, fileName = 'template.docx', groupIds = [] }) {
  const form = new FormData()
  form.append('name', name)
  form.append('visibleToAllStudents', 'false')
  form.append('visibleToAllTeachers', 'false')
  groupIds.forEach((id) => form.append('groupIds', id))
  if (bytes) form.append('file', new Blob([bytes]), fileName)
  return form
}
function fileForm(bytes, fileName) {
  const form = new FormData()
  form.append('file', new Blob([bytes]), fileName)
  return form
}

// ---------- arrange: shared fixtures ----------
const admin = await loginToken('admin@diploma.local', 'Admin123!')
const teacher = await loginToken('teacher@diploma.local', 'Teacher123!')

// A single faculty/department hosts every group this script creates (except the reorder section's
// own faculty, which must stay isolated - see below). A faculty that has ever held a task template
// can never be deleted (FacultyService.DeleteFacultyAsync checks DiplomaTaskTemplates by FacultyId
// alone, active or not), so this faculty is a deliberate, permanent, minimal leftover - the same
// shape as refinements-check.mjs's own faculty B. The department itself has no such restriction and
// is deleted once every group under it is gone.
const hardeningFaculty = (await call('POST', '/api/faculties', { token: admin, json: { name: `Hardening Faculty ${stamp}`, shortName: `HF${stamp}` } })).body
cleanup.addLast(`faculty ${hardeningFaculty.shortName}`, () => call('DELETE', `/api/faculties/${hardeningFaculty.id}`, { token: admin }))
const hardeningDepartment = (await call('POST', '/api/departments', { token: admin, json: { facultyId: hardeningFaculty.id, name: `Hardening Department ${stamp}`, shortName: `HD${stamp}` } })).body
cleanup.addLast(`department ${hardeningDepartment.shortName}`, () => call('DELETE', `/api/departments/${hardeningDepartment.id}`, { token: admin }))

let templateOrder = 0
async function makeStepTemplate(title) {
  templateOrder += 1
  const created = await call('POST', '/api/task-templates', { token: admin, json: { facultyId: hardeningFaculty.id, title: `${title} ${stamp}`, order: templateOrder } })
  cleanup.addLast(`task template ${created.body.title}`, () => call('DELETE', `/api/task-templates/${created.body.id}`, { token: admin }))
  return created.body
}

// One shared throwaway group for the sections that only need a place to put students (§2 uploads,
// §5 identity) plus the session/password students (§2 of the brief's own numbering) and the
// audience group for the templates check (§4.6). Archived students are permanently deleted when
// their group is deleted (GroupService.DeleteGroupAsync), so removeGroup - archive every active
// student, delete the group, purge its archive - leaves nothing behind.
const commonGroup = (await call('POST', '/api/groups', { token: admin, json: { departmentId: hardeningDepartment.id, code: `HCOMMON${stamp}`, academicYear: '2026/2027', description: '' } })).body
cleanup.add(`group ${commonGroup.code}`, () => removeGroup(call, admin, commonGroup))

async function runChecks() {

// ===========================================================================
// Sessions and passwords (§2)
// ===========================================================================

const shortAdmin = await call('POST', '/api/admins', { token: admin, json: { firstName: 'HA', lastName: 'Short', email: `ha.short.${stamp}@x.local`, password: 'Short11Char' } })
check('01 admin 11-char password refused', shortAdmin.body.code, 'password.policyElevated')

const okAdmin = await call('POST', '/api/admins', { token: admin, json: { firstName: 'HA', lastName: 'Ok', email: `ha.ok.${stamp}@x.local`, password: 'TwelveChars1' } })
check('02 admin 12-char password succeeds', okAdmin.status, 201)
if (okAdmin.status === 201) {
  cleanup.add(`admin ${okAdmin.body.email} -> deactivate`, () => call('POST', `/api/admins/${okAdmin.body.id}/deactivate`, { token: admin }))
}

const okTeacher = await call('POST', '/api/teachers', { token: admin, json: { firstName: 'HT', lastName: 'Ok', email: `ht.ok.${stamp}@x.local`, password: 'Eight8ch' } })
check('03 teacher 8-char password succeeds', okTeacher.status, 201)
if (okTeacher.status === 201) {
  cleanup.add(`teacher ${okTeacher.body.email} -> deactivate`, () => call('PATCH', `/api/teachers/${okTeacher.body.id}/deactivate`, { token: admin }))
}

const sessionAEmail = `session.a.${stamp}@student.local`
const sessionA = (await call('POST', '/api/students', { token: admin, json: { firstName: 'Session', lastName: 'A', email: sessionAEmail, studentNumber: `SA${stamp}`, password: 'Password1!', groupId: commonGroup.id } })).body
const sessionAToken = await loginToken(sessionAEmail, 'Password1!')
await call('POST', '/api/students/archive', { token: admin, json: { studentIds: [sessionA.id] } })
check('04 archived student token refused on /me', (await call('GET', '/api/auth/me', { token: sessionAToken })).status, 401)

const sessionBEmail = `session.b.${stamp}@student.local`
const sessionB = (await call('POST', '/api/students', { token: admin, json: { firstName: 'Session', lastName: 'B', email: sessionBEmail, studentNumber: `SB${stamp}`, password: 'Password1!', groupId: commonGroup.id } })).body
const sessionBToken = await loginToken(sessionBEmail, 'Password1!')
check('05 reset access', (await call('POST', `/api/students/${sessionB.id}/reset-access`, { token: admin })).status, 204)
check('05a reset student token refused on /me', (await call('GET', '/api/auth/me', { token: sessionBToken })).status, 401)
check('05b sign-in with old password fails after reset', (await login(sessionBEmail, 'Password1!')).status, 401)

// Registration is shared state: read the value this run found it in and restore it, rather than
// assuming a fixed end state.
const originalRegistration = (await call('GET', '/api/registration')).body.open
cleanup.add('registration switch', () => call('PUT', '/api/registration', { token: admin, json: { open: originalRegistration } }))
if (!originalRegistration) {
  await call('PUT', '/api/registration', { token: admin, json: { open: true } })
}
const reclaim = await call('POST', '/api/auth/claim', { json: { email: sessionBEmail, studentNumber: `SB${stamp}`, password: 'Password2!' } })
check('06 re-claim succeeds', reclaim.status, 200)
check('06a re-claimed token works on /me', (await call('GET', '/api/auth/me', { token: reclaim.body.token })).status, 200)

// ===========================================================================
// Uploads (§3)
// ===========================================================================

const uploadsTemplate = await makeStepTemplate('Uploads Step')
const uploadsGroupTask = (await call('POST', '/api/group-tasks', { token: admin, json: { groupId: commonGroup.id, taskTemplateId: uploadsTemplate.id, deadline: '2099-01-01T00:00:00Z' } })).body

const uploaderEmail = `uploader.${stamp}@student.local`
const uploader = (await call('POST', '/api/students', { token: admin, json: { firstName: 'Upload', lastName: 'Er', email: uploaderEmail, studentNumber: `UP${stamp}`, password: 'Password1!', groupId: commonGroup.id } })).body
const uploaderToken = await loginToken(uploaderEmail, 'Password1!')
// Work on the steps starts only once a student holds a topic (every submitting student gets one).
await giveTopic(call, cleanup, { admin, teacher, departmentId: hardeningDepartment.id, studentId: uploader.id, title: `Upload Topic ${stamp}` })
const uploaderSteps = (await call('GET', '/api/student-tasks/mine', { token: uploaderToken })).body
const uploadStepId = uploaderSteps.find((s) => s.groupTaskId === uploadsGroupTask.id).id

check('07 bogus zip main file -> content mismatch', (await call('POST', `/api/student-tasks/${uploadStepId}/submissions`, { token: uploaderToken, form: submissionForm({ main: bogusZip() }) })).body.code, 'file.contentMismatch')
check('09 .txt supporting file -> type not allowed', (await call('POST', `/api/student-tasks/${uploadStepId}/submissions`, { token: uploaderToken, form: submissionForm({ main: docx(paragraph('hi')), supporting: [[new TextEncoder().encode('notes'), 'notes.txt']] }) })).body.code, 'file.typeNotAllowed')
check('10 .png supporting with wrong bytes -> content mismatch', (await call('POST', `/api/student-tasks/${uploadStepId}/submissions`, { token: uploaderToken, form: submissionForm({ main: docx(paragraph('hi')), supporting: [[notAPng, 'scan.png']] }) })).body.code, 'file.contentMismatch')
const genuineUpload = await call('POST', `/api/student-tasks/${uploadStepId}/submissions`, { token: uploaderToken, form: submissionForm({ main: docx(paragraph('hi')), supporting: [[genuinePng(), 'scan.png']] }) })
check('08/11 genuine docx + genuine png succeed', genuineUpload.status, 200)

// ===========================================================================
// Identity (§5)
// ===========================================================================

const numberLatin = `AB${stamp}`
const numberCyrillic = `АВ ${stamp}` // Cyrillic А, В, a space, then the stamp
const identity1 = await call('POST', '/api/students', { token: admin, json: { firstName: 'Id', lastName: 'One', email: `id.one.${stamp}@student.local`, studentNumber: numberLatin, password: 'Password1!', groupId: commonGroup.id } })
check('13 first student number returned exactly as entered', identity1.body.studentNumber, numberLatin)
const identity2 = await call('POST', '/api/students', { token: admin, json: { firstName: 'Id', lastName: 'Two', email: `id.two.${stamp}@student.local`, studentNumber: numberCyrillic, password: 'Password1!', groupId: commonGroup.id } })
check('12 Cyrillic lookalike number collides', identity2.body.code, 'student.numberTaken')

const identityFacultyName = `Identity Faculty ${stamp}`
const identityFacultyShort = `IF${stamp}`
const identityFaculty = (await call('POST', '/api/faculties', { token: admin, json: { name: identityFacultyName, shortName: identityFacultyShort } })).body
cleanup.addLast(`faculty ${identityFaculty.shortName}`, () => call('DELETE', `/api/faculties/${identityFaculty.id}`, { token: admin }))
check('14a faculty name-only collision', (await call('POST', '/api/faculties', { token: admin, json: { name: identityFacultyName, shortName: `IF2${stamp}` } })).body.code, 'faculty.nameTaken')
check('14b faculty short-name-only collision', (await call('POST', '/api/faculties', { token: admin, json: { name: `Identity Faculty B ${stamp}`, shortName: identityFacultyShort } })).body.code, 'faculty.shortNameTaken')

// ===========================================================================
// Archive (§4)
// ===========================================================================

const archiveGroup = (await call('POST', '/api/groups', { token: admin, json: { departmentId: hardeningDepartment.id, code: `HARCH${stamp}`, academicYear: '2026/2027', description: '' } })).body
// Safety net: if a check below throws before the group is deliberately deleted (check 18) and
// purged (check 24), this still leaves nothing behind.
cleanup.add(`group ${archiveGroup.code}`, () => removeGroup(call, admin, archiveGroup))

const archiveTemplate = await makeStepTemplate('Archive Step')
const archiveGroupTask = (await call('POST', '/api/group-tasks', { token: admin, json: { groupId: archiveGroup.id, taskTemplateId: archiveTemplate.id, deadline: '2099-01-01T00:00:00Z' } })).body

const studentXEmail = `archive.x.${stamp}@student.local`
const studentX = (await call('POST', '/api/students', { token: admin, json: { firstName: 'Archive', lastName: 'X', email: studentXEmail, studentNumber: `AX${stamp}`, password: 'Password1!', groupId: archiveGroup.id } })).body
const studentXToken = await loginToken(studentXEmail, 'Password1!')
await giveTopic(call, cleanup, { admin, teacher, departmentId: hardeningDepartment.id, studentId: studentX.id, title: `Archive Topic ${stamp}` })
const studentYEmail = `archive.y.${stamp}@student.local`
const studentY = (await call('POST', '/api/students', { token: admin, json: { firstName: 'Archive', lastName: 'Y', email: studentYEmail, studentNumber: `AY${stamp}`, password: 'Password1!', groupId: archiveGroup.id } })).body

const studentXSteps = (await call('GET', '/api/student-tasks/mine', { token: studentXToken })).body
const archiveStepId = studentXSteps.find((s) => s.groupTaskId === archiveGroupTask.id).id
const uploadedBytes = docx(paragraph(`Archived content ${stamp}`))
await call('POST', `/api/student-tasks/${archiveStepId}/submissions`, { token: studentXToken, form: submissionForm({ main: uploadedBytes }) })

check('archive-arrange: archive studentX', (await call('POST', '/api/students/archive', { token: admin, json: { studentIds: [studentX.id] } })).status, 200)
check('15 archived student progress still readable', (await call('GET', `/api/students/${studentX.id}/progress`, { token: admin })).body.total, 1)

const archiveListBefore = (await call('GET', '/api/archive/groups', { token: admin })).body
const archiveEntryBefore = archiveListBefore.find((g) => g.groupCode === archiveGroup.code)
check('16 archive listing has the group with files', Boolean(archiveEntryBefore) && archiveEntryBefore.fileCount > 0, true)

check('17 deleting group with an active student refused', (await call('DELETE', `/api/groups/${archiveGroup.id}`, { token: admin })).body.code, 'group.hasStudents')

check('archive-arrange: archive studentY', (await call('POST', '/api/students/archive', { token: admin, json: { studentIds: [studentY.id] } })).status, 200)
check('18 deleting group with only archived students succeeds', (await call('DELETE', `/api/groups/${archiveGroup.id}`, { token: admin })).status, 204)

const archiveListAfter = (await call('GET', '/api/archive/groups', { token: admin })).body
const archiveEntry = archiveListAfter.find((g) => g.groupCode === archiveGroup.code)
check('19 archived group now has groupDeletedAt', Boolean(archiveEntry) && typeof archiveEntry.groupDeletedAt === 'string', true)

check('20a deleted group not found', (await call('GET', `/api/groups/${archiveGroup.id}`, { token: admin })).body.code, 'group.notFound')
check('20b archived and deleted student cannot sign in', (await login(studentXEmail, 'Password1!')).status, 401)

const archiveDetails = (await call('GET', `/api/archive/groups/${archiveEntry.id}`, { token: admin })).body
const archivedMainFile = archiveDetails.files.find((f) => f.kind === 'Main')
const download = await call('GET', `/api/archive/files/${archivedMainFile.id}`, { token: admin })
check('21 downloaded archived file matches uploaded bytes', Buffer.from(download.bytes).equals(Buffer.from(uploadedBytes)), true)

check('22 unrelated teacher sees no such archive', (await call('GET', `/api/archive/groups/${archiveEntry.id}`, { token: teacher })).body.code, 'archive.notFound')

const seedStudentToken = await loginToken('student@diploma.local', 'Student123!')
check('23 student forbidden from archive listing', (await call('GET', '/api/archive/groups', { token: seedStudentToken })).status, 403)

check('24 purge succeeds', (await call('DELETE', `/api/archive/groups/${archiveEntry.id}`, { token: admin })).status, 204)
const archiveListAfterPurge = (await call('GET', '/api/archive/groups', { token: admin })).body
check('24a purged archive is empty of that group', archiveListAfterPurge.some((g) => g.id === archiveEntry.id), false)

// Group deletion archives every file it removes (§4.3), including work that crossed groups: a
// student who moved out of the deleted group, and an archived student whose earlier group's work
// goes with their account. The deletion preview (§4.7) counts by the same rule.
const makeMoveGroup = async (suffix) => {
  const group = (await call('POST', '/api/groups', { token: admin, json: { departmentId: hardeningDepartment.id, code: `HMV${suffix}${stamp}`, academicYear: '2026/2027', description: '' } })).body
  cleanup.add(`group ${group.code}`, () => removeGroup(call, admin, group))
  return group
}
const moveA = await makeMoveGroup('A')
const moveB = await makeMoveGroup('B')
const moveC = await makeMoveGroup('C')
const moveStep = await makeStepTemplate('Move Step')
await call('POST', '/api/group-tasks', { token: admin, json: { groupId: moveA.id, taskTemplateId: moveStep.id, deadline: '2099-01-01T00:00:00Z' } })

async function submitInMoveA(suffix) {
  const email = `move.${suffix}.${stamp}@student.local`
  const created = (await call('POST', '/api/students', { token: admin, json: { firstName: 'Move', lastName: suffix, email, studentNumber: `MV${suffix}${stamp}`, password: 'Password1!', groupId: moveA.id } })).body
  const token = await loginToken(email, 'Password1!')
  await giveTopic(call, cleanup, { admin, teacher, departmentId: hardeningDepartment.id, studentId: created.id, title: `Move Topic ${suffix} ${stamp}` })
  const step = (await call('GET', '/api/student-tasks/mine', { token })).body[0]
  await call('POST', `/api/student-tasks/${step.id}/submissions`, { token, form: submissionForm({ main: docx(paragraph(`Moved work ${suffix} ${stamp}`)) }) })
  return { ...created, email, token }
}
const archiveCount = async (group) => (await call('GET', `/api/archive/groups?search=${group.code}`, { token: admin })).body.find((g) => g.groupCode === group.code)?.fileCount ?? 0

// An archived student whose current group is deleted takes their earlier group's work along.
const moverP = await submitInMoveA('P')
await call('PUT', `/api/students/${moverP.id}/group`, { token: admin, json: { groupId: moveB.id } })
await call('POST', '/api/students/archive', { token: admin, json: { studentIds: [moverP.id] } })
const previewB = (await call('GET', `/api/groups/${moveB.id}/deletion-preview`, { token: admin })).body
check('24b preview names the archived account and its earlier work', JSON.stringify(previewB), JSON.stringify({ activeStudentCount: 0, archivedStudentCount: 1, fileCount: 1 }))
check('24c deleting that group succeeds', (await call('DELETE', `/api/groups/${moveB.id}`, { token: admin })).status, 204)
check('24d the earlier group\'s work is in the deleted group\'s archive', await archiveCount(moveB), 1)

// A student who moved out keeps an account; the work left in the old group is archived with it.
const moverR = await submitInMoveA('R')
await call('PUT', `/api/students/${moverR.id}/group`, { token: admin, json: { groupId: moveC.id } })
const previewA = (await call('GET', `/api/groups/${moveA.id}/deletion-preview`, { token: admin })).body
check('24e preview of the old group counts the moved student\'s work', JSON.stringify(previewA), JSON.stringify({ activeStudentCount: 0, archivedStudentCount: 0, fileCount: 1 }))
check('24f deleting the old group succeeds', (await call('DELETE', `/api/groups/${moveA.id}`, { token: admin })).status, 204)
check('24g the moved student\'s old work is archived', await archiveCount(moveA), 1)
check('24h the moved student still signs in', (await login(moverR.email, 'Password1!')).status, 200)
check('24i preview reports the active student', (await call('GET', `/api/groups/${moveC.id}/deletion-preview`, { token: admin })).body.activeStudentCount, 1)

// Archiving every student of a group settles their reservations, as archiving one does.
const reservedTopic = (await call('POST', '/api/topics', { token: teacher, json: { title: `Hardening Topic ${stamp}`, departmentId: hardeningDepartment.id } })).body
cleanup.add(`topic ${reservedTopic.title}`, () => call('DELETE', `/api/topics/${reservedTopic.id}`, { token: admin }))
check('24j reservation pending', (await call('POST', `/api/topics/${reservedTopic.id}/reserve`, { token: moverR.token })).body.status, 'Pending')
check('24k archiving the whole group', (await call('POST', `/api/groups/${moveC.id}/students/archive`, { token: admin })).status, 200)
check('24l the reserved topic is available again', (await call('GET', `/api/topics/${reservedTopic.id}`, { token: admin })).body.status, 'Available')

// ===========================================================================
// Queue, progress and dashboards (§7, §8)
// ===========================================================================

const queueGroup = (await call('POST', '/api/groups', { token: admin, json: { departmentId: hardeningDepartment.id, code: `HQUEUE${stamp}`, academicYear: '2026/2027', description: '' } })).body
cleanup.add(`group ${queueGroup.code}`, () => removeGroup(call, admin, queueGroup))

const queueTeacherEmail = `queue.teacher.${stamp}@diploma.local`
const queueTeacherId = (await call('POST', '/api/teachers', { token: admin, json: { firstName: 'Queue', lastName: 'Teacher', email: queueTeacherEmail, password: 'Teacher456!' } })).body.id
cleanup.add(`teacher ${queueTeacherEmail} -> deactivate`, () => call('PATCH', `/api/teachers/${queueTeacherId}/deactivate`, { token: admin }))
const queueTeacherToken = await loginToken(queueTeacherEmail, 'Teacher456!')
await call('POST', `/api/groups/${queueGroup.id}/reviewers`, { token: admin, json: { reviewerId: queueTeacherId } })

async function makeQueueStudent(suffix) {
  const email = `queue.${suffix}.${stamp}@student.local`
  const created = (await call('POST', '/api/students', { token: admin, json: { firstName: 'Queue', lastName: suffix, email, studentNumber: `Q${suffix}${stamp}`, password: 'Password1!', groupId: queueGroup.id } })).body
  await giveTopic(call, cleanup, { admin, teacher, departmentId: hardeningDepartment.id, studentId: created.id, title: `Queue Topic ${suffix} ${stamp}` })
  return { id: created.id, token: await loginToken(email, 'Password1!') }
}

const pastStep = await makeStepTemplate('Queue Past Step')
const futureStep = await makeStepTemplate('Queue Future Step')
const pastGroupTask = (await call('POST', '/api/group-tasks', { token: admin, json: { groupId: queueGroup.id, taskTemplateId: pastStep.id, deadline: '2000-01-01T00:00:00Z' } })).body
const futureGroupTask = (await call('POST', '/api/group-tasks', { token: admin, json: { groupId: queueGroup.id, taskTemplateId: futureStep.id, deadline: '2099-01-01T00:00:00Z' } })).body

const q1 = await makeQueueStudent('S1')
const q2 = await makeQueueStudent('S2')
const q3 = await makeQueueStudent('S3')
const q4 = await makeQueueStudent('S4') // never submits: used for the overdue/not-due checks
const q5 = await makeQueueStudent('S5') // submits and is decided: used for the dashboard-student check

async function stepIdFor(studentToken, groupTaskId) {
  const steps = (await call('GET', '/api/student-tasks/mine', { token: studentToken })).body
  return steps.find((s) => s.groupTaskId === groupTaskId).id
}

// q1's step is submitted late, returned, then resubmitted late again - two late submissions of one
// step, which must count once in lateSteps (§7.2).
const q1Step = await stepIdFor(q1.token, pastGroupTask.id)
const q1First = await call('POST', `/api/student-tasks/${q1Step}/submissions`, { token: q1.token, form: submissionForm({ main: docx(paragraph('v1')) }) })
const q1SubmissionId = q1First.body.timeline[0].id
await call('POST', `/api/submissions/${q1SubmissionId}/return`, { token: queueTeacherToken, json: { comment: 'try again' } })
await call('POST', `/api/student-tasks/${q1Step}/submissions`, { token: q1.token, form: submissionForm({ main: docx(paragraph('v2')) }) })
check('28 two late submissions of one step count once', (await call('GET', `/api/students/${q1.id}/progress`, { token: admin })).body.lateSteps, 1)

const q2Step = await stepIdFor(q2.token, pastGroupTask.id)
await call('POST', `/api/student-tasks/${q2Step}/submissions`, { token: q2.token, form: submissionForm({ main: docx(paragraph('v1')) }) })
const q3Step = await stepIdFor(q3.token, pastGroupTask.id)
await call('POST', `/api/student-tasks/${q3Step}/submissions`, { token: q3.token, form: submissionForm({ main: docx(paragraph('v1')) }) })

const q5Step = await stepIdFor(q5.token, pastGroupTask.id)
const q5Submission = await call('POST', `/api/student-tasks/${q5Step}/submissions`, { token: q5.token, form: submissionForm({ main: docx(paragraph('v1')) }) })
const q5SubmissionId = q5Submission.body.timeline[0].id
const q5Decision = await call('POST', `/api/submissions/${q5SubmissionId}/approve`, { token: queueTeacherToken, json: { mark: 77 } })
check('29-arrange: decide q5 submission', q5Decision.status, 200)

// q1, q2 and q3 are the three still-pending submissions the queue and the teacher dashboard count.
const queuePage1 = (await call('GET', `/api/review/queue?groupId=${queueGroup.id}&pageSize=2`, { token: queueTeacherToken })).body
check('25 queue page size', queuePage1.items.length, 2)
check('25a queue total greater than page size', queuePage1.total > 2, true)
const queuePage2 = (await call('GET', `/api/review/queue?groupId=${queueGroup.id}&pageSize=2&page=2`, { token: queueTeacherToken })).body
const page1Ids = new Set(queuePage1.items.map((i) => i.submissionId))
check('26 page 2 has different submission ids', queuePage2.items.every((i) => !page1Ids.has(i.submissionId)) && queuePage2.items.length > 0, true)

const groupProgress = (await call('GET', `/api/groups/${queueGroup.id}/progress`, { token: queueTeacherToken })).body
const q4Row = groupProgress.students.find((s) => s.studentProfileId === q4.id)
const q4PastCell = q4Row.cells.find((c) => c.groupTaskId === pastGroupTask.id)
const q4FutureCell = q4Row.cells.find((c) => c.groupTaskId === futureGroupTask.id)
check('27a overdue step with nothing submitted', q4PastCell.isOverdue, true)
check('27b step not yet due', q4FutureCell.isOverdue, false)

const studentDashboard = (await call('GET', '/api/dashboard/student', { token: q5.token })).body
check('29 student dashboard shows the most recent decision', studentDashboard.latestDecision?.submissionId, q5SubmissionId)

const teacherDashboard = (await call('GET', '/api/dashboard/teacher', { token: queueTeacherToken })).body
const teacherQueueTotal = (await call('GET', `/api/review/queue?groupId=${queueGroup.id}`, { token: queueTeacherToken })).body.total
check('30 teacher dashboard waitingReviews matches queue total', teacherDashboard.waitingReviews, teacherQueueTotal)
check('30a teacher dashboard latestForReview capped at five', teacherDashboard.latestForReview.length <= 5, true)
// §7.4: the group table lists the groups a teacher reviews. The seed teacher supervises the queue
// students (their topics are hers) but does not review their group, so it is not in her table.
check('30b reviewer sees the group in the dashboard table', teacherDashboard.groups.some((g) => g.groupId === queueGroup.id), true)
check('30c a supervisor who does not review it does not', (await call('GET', '/api/dashboard/teacher', { token: teacher })).body.groups.some((g) => g.groupId === queueGroup.id), false)

const adminDashboard = (await call('GET', '/api/dashboard/admin', { token: admin })).body
const ts = adminDashboard.topicSelection
check('31 admin dashboard topic-selection figures sum to active students', ts.withApprovedTopic + ts.withPendingRequest + ts.withoutTopic, ts.totalStudents)

// ===========================================================================
// Reordering (§6)
// ===========================================================================

// A dedicated faculty, isolated from hardeningFaculty: ReorderAsync requires the *complete* set of
// a faculty's templates in every request, so this stays simple only if nothing else ever creates a
// template under it. Like hardeningFaculty, it can never be deleted once it holds a template.
const reorderFaculty = (await call('POST', '/api/faculties', { token: admin, json: { name: `Reorder Faculty ${stamp}`, shortName: `RO${stamp}` } })).body
cleanup.addLast(`faculty ${reorderFaculty.shortName}`, () => call('DELETE', `/api/faculties/${reorderFaculty.id}`, { token: admin }))

const r1 = (await call('POST', '/api/task-templates', { token: admin, json: { facultyId: reorderFaculty.id, title: `Reorder One ${stamp}`, order: 1 } })).body
const r2 = (await call('POST', '/api/task-templates', { token: admin, json: { facultyId: reorderFaculty.id, title: `Reorder Two ${stamp}`, order: 2 } })).body
const r3 = (await call('POST', '/api/task-templates', { token: admin, json: { facultyId: reorderFaculty.id, title: `Reorder Three ${stamp}`, order: 3 } })).body
for (const t of [r1, r2, r3]) {
  cleanup.addLast(`task template ${t.title}`, () => call('DELETE', `/api/task-templates/${t.id}`, { token: admin }))
}

const reversed = await call('PUT', '/api/task-templates/order', { token: admin, json: { facultyId: reorderFaculty.id, templateIds: [r3.id, r2.id, r1.id] } })
const reversedById = new Map(reversed.body.map((t) => [t.id, t.order]))
check('32 reversed order renumbers 1..n', JSON.stringify([reversedById.get(r3.id), reversedById.get(r2.id), reversedById.get(r1.id)]), JSON.stringify([1, 2, 3]))

const missing = await call('PUT', '/api/task-templates/order', { token: admin, json: { facultyId: reorderFaculty.id, templateIds: [r3.id, r2.id] } })
check('33 missing id refused', missing.body.code, 'taskTemplate.orderMismatch')
const afterMissing = (await call('GET', `/api/task-templates?facultyId=${reorderFaculty.id}`, { token: admin })).body
const afterMissingById = new Map(afterMissing.map((t) => [t.id, t.order]))
check('33a order unchanged after refused reorder', JSON.stringify([afterMissingById.get(r3.id), afterMissingById.get(r2.id), afterMissingById.get(r1.id)]), JSON.stringify([1, 2, 3]))

const duplicate = await call('PUT', '/api/task-templates/order', { token: admin, json: { facultyId: reorderFaculty.id, templateIds: [r3.id, r3.id, r1.id] } })
check('34 duplicate id refused', duplicate.body.code, 'taskTemplate.orderMismatch')

// ===========================================================================
// Templates (§4.6)
// ===========================================================================

const templateV1 = docx(paragraph(`Version One ${stamp}`))
const templateV2 = docx(paragraph(`Version Two ${stamp}`))
// A teacher may share a template only with a group they can see, so the seed teacher reviews the
// common group first. The reviewer row goes with the group when it is deleted.
const seedTeacherId = (await call('GET', '/api/teachers', { token: admin })).body.find((t) => t.email === 'teacher@diploma.local').id
await call('POST', `/api/groups/${commonGroup.id}/reviewers`, { token: admin, json: { reviewerId: seedTeacherId } })
const templateCreated = await call('POST', '/api/templates', { token: teacher, form: templateForm({ name: `Hardening Template ${stamp}`, bytes: templateV1, groupIds: [commonGroup.id] }) })
check('35 template created', templateCreated.status, 201)
const hardeningTemplateId = templateCreated.body.id
if (hardeningTemplateId) cleanup.add(`template ${hardeningTemplateId}`, async () => {
  const stillThere = await call('GET', `/api/templates/${hardeningTemplateId}`, { token: admin })
  if (stillThere.body?.code !== 'template.notFound') {
    await call('DELETE', `/api/templates/${hardeningTemplateId}`, { token: teacher })
  }
})

const replaceResult = await call('PUT', `/api/templates/${hardeningTemplateId}/file`, { token: teacher, form: fileForm(templateV2, 'v2.docx') })
check('35 replacing the file succeeds', replaceResult.status, 200)
const sourceAfterReplace = await call('GET', `/api/templates/${hardeningTemplateId}/source`, { token: teacher })
const sourceText = textOf(unzip(sourceAfterReplace.bytes).get('word/document.xml'))
check('35a new content present after replace', sourceText.includes(`Version Two ${stamp}`), true)
check('35b old content no longer downloadable', sourceText.includes(`Version One ${stamp}`), false)

}

let unexpectedError = null
try {
  await runChecks()
} catch (error) {
  unexpectedError = error
  console.log(`\nUnexpected script error (not a plain check failure): ${error.message}`)
  results.push(false)
} finally {
  await cleanup.run()
}

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
