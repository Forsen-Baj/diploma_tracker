// Design 2026-09-24 §4: document routing. Runs against the live local API on :5000 and leaves
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

const pdf = new TextEncoder().encode('%PDF-1.4\n%routing\n')

function docForm(fields, file) {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) data.append(key, String(value))
  }
  if (file) data.append('file', new Blob([file.bytes]), file.name)
  return data
}

const docxFile = { bytes: docx, name: 'letter.docx' }
const signedFile = { bytes: pdf, name: 'signed.pdf' }

async function runChecks() {
  const admin = await login('admin@diploma.local', 'Admin123!')
  const teacher = await login('teacher@diploma.local', 'Teacher123!')

  const department = (await call('GET', '/api/departments', { token: admin })).body[0]
  async function makeGroup(code) {
    const group = (await call('POST', '/api/groups', { token: admin, json: { departmentId: department.id, code, academicYear: '2026/2027', description: '' } })).body
    cleanup.add(`group ${group.code}`, () => removeGroup(call, admin, group))
    return group
  }
  async function makeStudent(group, key) {
    const email = `doc.${key}.${stamp}@student.local`
    const created = (await call('POST', '/api/students', { token: admin, json: { firstName: key, lastName: `Doc${key}${stamp}`, email, studentNumber: `D${key}${stamp}`, password: 'Password1!', groupId: group.id } })).body
    return { id: created.id, token: await login(email, 'Password1!') }
  }
  // These accounts keep no role: documents are every staff member's.
  async function makeTeacher(key) {
    const email = `doc.${key.toLowerCase()}.${stamp}@diploma.local`
    const id = (await call('POST', '/api/staff', { token: admin, json: { firstName: key, lastName: `Doc${key}${stamp}`, email, password: 'Teacher456!' } })).body.id
    cleanup.add(`teacher ${email} -> deactivate`, () => call('PATCH', `/api/staff/${id}/deactivate`, { token: admin }))
    return { id, token: await login(email, 'Teacher456!') }
  }
  const userIdOf = async (token, search) => (await call('GET', `/api/documents/recipients?search=${encodeURIComponent(search)}`, { token })).body[0]?.id

  const groupA = await makeGroup(`DA${stamp}`)
  const groupB = await makeGroup(`DB${stamp}`)
  const s1 = await makeStudent(groupA, 'One')
  const s2 = await makeStudent(groupA, 'Two')
  const s3 = await makeStudent(groupB, 'Three')
  const tA = await makeTeacher('Alpha')
  const tB = await makeTeacher('Beta')
  const s1UserId = await userIdOf(tA.token, `DocOne${stamp}`)
  const s2UserId = await userIdOf(tA.token, `DocTwo${stamp}`)
  const adminUserId = await userIdOf(teacher, 'admin@diploma.local')

  const detail = async (token, id) => (await call('GET', `/api/documents/${id}`, { token })).body
  const act = async (token, id, action, fields = {}, file) => {
    const { sequence } = await detail(token, id)
    const multipart = ['forward', 'done', 'versions'].includes(action)
    return call('POST', `/api/documents/${id}/${action}`, multipart
      ? { token, form: docForm({ ...fields, expectedSequence: sequence }, file) }
      : { token, json: { ...fields, expectedSequence: sequence } })
  }

  // ---------- creating ----------
  const created = await call('POST', '/api/documents', { token: s1.token, form: docForm({ title: 'Application', description: 'For the dean' }, docxFile) })
  check('01 a student creates a document', `${created.status} ${created.body.state} ${created.body.versions?.length}`, '200 WithOwner 1')
  const d1 = created.body.id
  check('02 a file is required', (await call('POST', '/api/documents', { token: s1.token, form: docForm({ title: 'No file' }) })).body.code, 'document.fileMissing')
  check('03 the file allowlist applies', (await call('POST', '/api/documents', { token: s1.token, form: docForm({ title: 'Bad' }, { bytes: docx, name: 'tool.exe' }) })).body.code, 'file.typeNotAllowed')
  check('04 a title is required', (await call('POST', '/api/documents', { token: s1.token, form: docForm({ title: ' ' }, docxFile) })).body.code, 'validation.failed')
  check('05 a stranger cannot open it', (await call('GET', `/api/documents/${d1}`, { token: tA.token })).body.code, 'document.notFound')
  const renamed = await call('PUT', `/api/documents/${d1}`, { token: s1.token, json: { title: 'Application to the dean', description: 'Signed by two', expectedSequence: created.body.sequence } })
  check('06 the owner edits it while it is theirs', renamed.body.title, 'Application to the dean')

  // ---------- sending and passing on ----------
  check('07 a student cannot send to a student', (await act(s1.token, d1, 'send', { recipientId: s2UserId, purpose: 'Review' })).body.code, 'document.recipientInvalid')
  const sent = await act(s1.token, d1, 'send', { recipientId: tA.id, purpose: 'Review', comment: 'Please check' })
  check('08 sent for review', `${sent.body.state} ${sent.body.purpose} ${sent.body.canRecall}`, 'InCirculation Review true')
  check('09 it waits in the reviewer\'s review box', (await call('GET', '/api/documents?box=review', { token: tA.token })).body.some((d) => d.id === d1), true)
  check('09a and counts there', (await call('GET', '/api/documents/counts', { token: tA.token })).body.review >= 1, true)
  const stale = (await detail(tA.token, d1)).sequence - 1
  check('10 a stale view is refused', (await call('POST', `/api/documents/${d1}/reject`, { token: tA.token, json: { comment: 'x', expectedSequence: stale } })).body.code, 'document.changed')
  check('11 only the holder passes it on', (await act(s1.token, d1, 'forward', { recipientId: tB.id, purpose: 'Signing' })).body.code, 'document.notHolder')
  const forwarded = await act(tA.token, d1, 'forward', { recipientId: tB.id, purpose: 'Signing', comment: 'Please sign' })
  check('12 passed on for signing', `${forwarded.status} ${forwarded.body.purpose}`, '200 Signing')

  // ---------- signing ----------
  check('13 done needs the signed copy', (await act(tB.token, d1, 'done')).body.code, 'document.signedCopyRequired')
  check('13a so does passing it on', (await act(tB.token, d1, 'forward', { recipientId: adminUserId, purpose: 'Review' })).body.code, 'document.signedCopyRequired')
  const rejected = await act(tB.token, d1, 'reject', { comment: 'Wrong form' })
  check('14 sent back by default to whoever handed it over', `${rejected.body.state} ${rejected.body.holderName?.includes(`DocAlpha${stamp}`)}`, 'InCirculation true')
  const backAtA = await detail(tA.token, d1)
  check('14a with the purpose they had', backAtA.purpose, 'Review')
  check('14b and the rejection shown to them', Boolean(backAtA.rejection), true)
  check('15 a rejection goes only to earlier participants', (await act(tA.token, d1, 'reject', { targetId: crypto.randomUUID(), comment: 'x' })).body.code, 'document.rejectTargetInvalid')
  await act(tA.token, d1, 'forward', { recipientId: tB.id, purpose: 'Signing' })
  const versioned = await act(tB.token, d1, 'versions', { comment: 'Signed' }, signedFile)
  check('16 the signer uploads the signed copy', versioned.body.signedCopyRequired, false)
  const done = await act(tB.token, d1, 'done', { comment: 'Signed and done' })
  check('17 then marks it as done', `${done.body.state} ${done.body.versions.length}`, 'Completed 2')
  check('18 the owner sees it completed', (await detail(s1.token, d1)).state, 'Completed')
  check('18a it is in the reviewer\'s handled box', (await call('GET', '/api/documents?box=handled', { token: tA.token })).body.some((d) => d.id === d1), true)
  // Fix wave I2: DELETE now carries expectedSequence, like every other write.
  const d1Sequence = (await detail(s1.token, d1)).sequence
  check('19 a sent document cannot be deleted', (await call('DELETE', `/api/documents/${d1}?expectedSequence=${d1Sequence}`, { token: s1.token })).body.code, 'document.alreadySent')
  check('19a a delete with no expectedSequence is refused', (await call('DELETE', `/api/documents/${d1}`, { token: s1.token })).body.code, 'validation.failed')

  // ---------- back to the owner, recall ----------
  await act(s1.token, d1, 'send', { recipientId: tA.id, purpose: 'Review' })
  const toOwner = await act(tA.token, d1, 'reject', { targetId: s1UserId, comment: 'Add the date' })
  check('20 sent back to the owner', toOwner.body.state, 'WithOwner')
  check('20a the owner sees why', (await detail(s1.token, d1)).rejection?.comment, 'Add the date')
  await act(s1.token, d1, 'send', { recipientId: tA.id, purpose: 'Review' })
  check('21 the owner takes it back', (await act(s1.token, d1, 'recall')).body.state, 'WithOwner')

  // ---------- files and search ----------
  const versionId = (await detail(s1.token, d1)).versions[1].id
  const download = await call('GET', `/api/document-versions/${versionId}`, { token: tA.token })
  check('22 a participant downloads a version', `${download.status} ${download.headers.get('x-content-type-options')}`, '200 nosniff')
  check('22a as an attachment', (download.headers.get('content-disposition') ?? '').startsWith('attachment'), true)
  check('22b a non-participant cannot', (await call('GET', `/api/document-versions/${versionId}`, { token: s2.token })).status, 404)
  check('23 a student is offered only staff', (await call('GET', '/api/documents/recipients', { token: s1.token })).body.every((r) => r.role !== 'Student'), true)
  check('23a staff are offered students', (await call('GET', `/api/documents/recipients?search=DocTwo${stamp}`, { token: tA.token })).body.some((r) => r.id === s2UserId), true)
  const draft = await call('POST', '/api/documents', { token: s1.token, form: docForm({ title: 'Draft' }, docxFile) })
  check('24 a stale delete is refused', (await call('DELETE', `/api/documents/${draft.body.id}?expectedSequence=${draft.body.sequence - 1}`, { token: s1.token })).body.code, 'document.changed')
  check('24a a never-sent document can be deleted', (await call('DELETE', `/api/documents/${draft.body.id}?expectedSequence=${draft.body.sequence}`, { token: s1.token })).status, 204)

  // ---------- account deletion (§4.5) ----------
  const d2 = (await call('POST', '/api/documents', { token: s2.token, form: docForm({ title: 'Own of Two' }, docxFile) })).body.id
  await act(s2.token, d2, 'send', { recipientId: tA.id, purpose: 'Review' })
  const d5 = (await call('POST', '/api/documents', { token: s3.token, form: docForm({ title: 'Own of Three' }, docxFile) })).body.id
  await act(s3.token, d5, 'send', { recipientId: tA.id, purpose: 'Signing' })
  await act(tA.token, d5, 'versions', {}, signedFile)
  await act(tA.token, d5, 'forward', { recipientId: s2UserId, purpose: 'Signing' })

  await call('POST', '/api/students/archive', { token: admin, json: { studentIds: [s1.id, s2.id] } })
  const preview = (await call('GET', `/api/groups/${groupA.id}/deletion-preview`, { token: admin })).body
  check('25 the deletion preview counts their documents', preview.documentCount, 2) // d1 and d2
  await removeGroup(call, admin, groupA)
  check('26 their own documents are gone', (await call('GET', `/api/documents/${d2}`, { token: tA.token })).body.code, 'document.notFound')
  const returned = await detail(s3.token, d5)
  check('27 a document they held returns to its owner', returned.state, 'WithOwner')
  check('27a with a line that says why', `${returned.events.at(-1).kind} ${returned.events.at(-1).actorRemoved}`, 'Recalled true')
  check('27b their name stays in the timeline', returned.events.some((e) => e.recipientName?.includes(`DocTwo${stamp}`)), true)
}

try {
  await runChecks()
} finally {
  await cleanup.run()
}

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
