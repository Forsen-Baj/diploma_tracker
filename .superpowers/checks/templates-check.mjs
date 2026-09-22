import { inflateRawSync } from 'node:zlib'
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

// ---------- minimal zip writer / reader ----------
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

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'

// Fix wave M17: every template built by this script now also carries a footer and a footnotes
// part by default (both with their own, known marker), so the ordinary upload/generate flow also
// proves a footer marker and a footnote marker are filled - not just the header, which was the
// only non-body part exercised before the fix wave.
function docx(bodyXml, { headerText = '{{date.year}}', footerText = '{{group.code}}', footnoteText = '{{student.number}}' } = {}) {
  return zip([
    { name: '[Content_Types].xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/></Types>' },
    { name: '_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: 'word/_rels/document.xml.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/></Relationships>' },
    { name: 'word/document.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${bodyXml}<w:sectPr><w:headerReference w:type="default" r:id="rId1"/><w:footerReference w:type="default" r:id="rId2"/></w:sectPr></w:body></w:document>` },
    { name: 'word/header1.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${W}><w:p><w:r><w:t>${headerText}</w:t></w:r></w:p></w:hdr>` },
    { name: 'word/footer1.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${W}><w:p><w:r><w:t>${footerText}</w:t></w:r></w:p></w:ftr>` },
    { name: 'word/footnotes.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:footnotes ${W}><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote><w:footnote w:id="1"><w:p><w:r><w:t>${footnoteText}</w:t></w:r></w:p></w:footnote></w:footnotes>` }
  ])
}

// Fix wave M1 (sec) / review M1: three packages that must be refused with template.invalidFile
// before any marker is ever read - a macro-enabled main part (a .docm renamed to .docx), an
// external relationship whose scheme is not http/https/mailto, and a field code that fetches
// external content (INCLUDEPICTURE). Each is its own minimal, single-part package rather than a
// variant of docx() so the offending shape is obvious and isolated.
const minimalTypes = (mainContentType) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${mainContentType}"/></Types>`
const packageRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
function macroEnabledDocx() {
  return zip([
    { name: '[Content_Types].xml', content: minimalTypes('application/vnd.ms-word.document.macroEnabled.main+xml') },
    { name: '_rels/.rels', content: packageRels },
    { name: 'word/document.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body><w:p><w:r><w:t>hi</w:t></w:r></w:p></w:body></w:document>` }
  ])
}
function externalRelationshipDocx() {
  return zip([
    { name: '[Content_Types].xml', content: minimalTypes('application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml') },
    { name: '_rels/.rels', content: packageRels },
    { name: 'word/_rels/document.xml.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="file://host/share/evil" TargetMode="External"/></Relationships>' },
    { name: 'word/document.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body><w:p><w:r><w:t>hi</w:t></w:r></w:p></w:body></w:document>` }
  ])
}
function includePictureDocx() {
  const body = `<w:p><w:fldSimple w:instr="INCLUDEPICTURE &quot;file.png&quot;"><w:r><w:t>x</w:t></w:r></w:fldSimple></w:p>`
  return zip([
    { name: '[Content_Types].xml', content: minimalTypes('application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml') },
    { name: '_rels/.rels', content: packageRels },
    { name: 'word/document.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}</w:body></w:document>` }
  ])
}

// Re-review new defect 1: an ordinary complex-field HYPERLINK - exactly what every Table of
// Contents entry is - must be accepted. "HYPERLINK" contains the substring "LINK", so a raw
// substring check on the field's instruction would wrongly refuse this legitimate, entirely
// internal-to-benign field; only the instruction's leading keyword may be judged.
function hyperlinkFieldDocx() {
  const field = '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve">HYPERLINK "https://example.org"</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>https://example.org</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>'
  return docx(validBody + field)
}

// Re-review new defect 2: the same INCLUDEPICTURE instruction as includePictureDocx() above, but
// spread across two <w:instrText> runs inside one complex field (w:fldChar begin -> instrText x2
// -> separate -> end) so neither run alone contains a blocked keyword - only reassembling the
// whole field's instruction before judging it catches this.
function splitIncludePictureDocx() {
  const body = `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve">INCLU</w:instrText></w:r><w:r><w:instrText xml:space="preserve">DEPICTURE "http://host/x.png"</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`
  return zip([
    { name: '[Content_Types].xml', content: minimalTypes('application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml') },
    { name: '_rels/.rels', content: packageRels },
    { name: 'word/document.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}</w:body></w:document>` }
  ])
}

const paragraph = (runs) => `<w:p>${runs.map(([text, bold]) => `<w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`).join('')}</w:p>`
const validBody =
  paragraph([['Student: ', false], ['{{stud', false], ['ent.fullName}}', true]]) +
  paragraph([['Short: {{ student.shortName }}; group {{group.code}}; dept {{department.shortName}}', false]]) +
  `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Topic: {{topic.title}}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Supervisor: {{supervisor.shortName}}</w:t></w:r></w:p></w:tc></w:tr></w:tbl>` +
  paragraph([['Description: {{topic.description}}', false]]) +
  '<w:p><w:r><w:footnoteReference w:id="1"/></w:r></w:p>'

// A zip with more entries than the server's zip-directory guard (1,000, before the package is
// ever opened - pre-flight A5) refuses with template.invalidFile. Kept small: 1,001 empty entries,
// no docx() wrapper needed since the entry count is checked before the file is parsed as Word.
function manyEntriesZip(count) {
  const files = []
  for (let i = 0; i < count; i++) files.push({ name: `f${i}.txt`, content: '' })
  return zip(files)
}

// ---------- http ----------
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
  const type = response.headers.get('content-type') ?? ''
  if (type.includes('json')) return { status: response.status, body: await response.json(), headers: response.headers }
  return { status: response.status, bytes: new Uint8Array(await response.arrayBuffer()), headers: response.headers }
}
const login = async (email, password) => (await call('POST', '/api/auth/login', { json: { email, password } })).body.token
function templateForm({ name, bytes, fileName = 'template.docx', allStudents = false, allTeachers = false, groupIds = [], teacherIds = [] }) {
  const form = new FormData()
  form.append('name', name)
  form.append('visibleToAllStudents', String(allStudents))
  form.append('visibleToAllTeachers', String(allTeachers))
  groupIds.forEach((id) => form.append('groupIds', id))
  teacherIds.forEach((id) => form.append('teacherIds', id))
  if (bytes) form.append('file', new Blob([bytes]), fileName)
  return form
}

// ---------- arrange ----------
const admin = await login('admin@diploma.local', 'Admin123!')
const teacher = await login('teacher@diploma.local', 'Teacher123!')
const groups = (await call('GET', '/api/groups', { token: admin })).body
const seedGroup = groups.find((g) => g.code === 'SEED-A')
const teacherId = (await call('GET', '/api/teachers', { token: admin })).body.find((t) => t.email === 'teacher@diploma.local').id

// The students this script creates live in two groups of its own, removed with them at the end;
// the seed teacher reviews the home group so it may share templates with it.
const homeGroup = (await call('POST', '/api/groups', { token: admin, json: { departmentId: seedGroup.departmentId, code: `DOCA${stamp}`, academicYear: '2026/2027', description: '' } })).body
cleanup.add(`group ${homeGroup.code}`, () => removeGroup(call, admin, homeGroup))
await call('POST', `/api/groups/${homeGroup.id}/reviewers`, { token: admin, json: { reviewerId: teacherId } })

const otherGroup = (await call('POST', '/api/groups', { token: admin, json: { departmentId: seedGroup.departmentId, code: `DOC${stamp}`, academicYear: '2026/2027', description: '' } })).body
cleanup.add(`group ${otherGroup.code}`, () => removeGroup(call, admin, otherGroup))
const otherTeacherEmail = `doc.teacher.${stamp}@diploma.local`
const otherTeacherId = (await call('POST', '/api/teachers', { token: admin, json: { firstName: 'Олег', lastName: 'Іншенко', email: otherTeacherEmail, password: 'Teacher456!' } })).body.id
// Fix wave M17: the teacher account this run creates was previously never deactivated, so it kept
// piling up in the teacher multi-select, in /api/topics/supervisors and in every "all teachers"
// audience across repeated runs.
cleanup.add(`teacher ${otherTeacherEmail} -> deactivate`, () => call('PATCH', `/api/teachers/${otherTeacherId}/deactivate`, { token: admin }))
const otherTeacher = await login(otherTeacherEmail, 'Teacher456!')

const studentEmail = `doc.${stamp}@student.local`
const student = (await call('POST', '/api/students', { token: admin, json: { firstName: 'Іван', lastName: 'Документенко', patronymic: 'Петрович', email: studentEmail, studentNumber: `D${stamp}`, password: 'Password1!', groupId: homeGroup.id } })).body
const studentToken = await login(studentEmail, 'Password1!')
const outsiderEmail = `outsider.${stamp}@student.local`
const outsider = (await call('POST', '/api/students', { token: admin, json: { firstName: 'Out', lastName: 'Sider', email: outsiderEmail, studentNumber: `O${stamp}`, password: 'Password1!', groupId: otherGroup.id } })).body
const outsiderToken = await login(outsiderEmail, 'Password1!')

const topicA = (await call('POST', '/api/topics', { token: teacher, json: { title: `Тема A ${stamp}`, departmentId: seedGroup.departmentId } })).body
cleanup.add(`topic ${topicA.title}`, () => call('DELETE', `/api/topics/${topicA.id}`, { token: teacher }))
const topicB = (await call('POST', '/api/topics', { token: teacher, json: { title: `Тема B ${stamp}`, departmentId: seedGroup.departmentId } })).body
cleanup.add(`topic ${topicB.title}`, () => call('DELETE', `/api/topics/${topicB.id}`, { token: teacher }))

// Fix wave I2 / M17: topicA's description carries a manual line break (\v), a C0 control
// character and a tab, set here while topicA is still Available - a teacher may only edit a
// catalogue topic in that state - so it carries through into the reservation below and proves,
// once generated, that a control character in a topic description generates fine (500 would
// mean I2 regressed) and that a multi-line value produces `<w:br/>` elements rather than a
// literal newline that Word would render as one glyph. topicA (not topicB) is used because a
// student may now only name their own topic - see check 22d below.
const multilineDescription = 'Перший рядок\nДругий рядоктретій\tТаб'
await call('PUT', `/api/topics/${topicA.id}`, { token: teacher, json: { title: topicA.title, description: multilineDescription, departmentId: seedGroup.departmentId } })

// The deadline is read before it is changed so cleanup can restore the exact original value.
const originalDeadline = (await call('GET', '/api/settings/topic-selection', { token: admin })).body.deadline
cleanup.add('topic-selection deadline', () => call('PUT', '/api/settings/topic-selection', { token: admin, json: { deadline: originalDeadline } }))
await call('PUT', '/api/settings/topic-selection', { token: admin, json: { deadline: null } })
const reservation = await call('POST', `/api/topics/${topicA.id}/reserve`, { token: studentToken })
// Topics can only be deleted while Available, so the reservation is cancelled first (returning
// topicA to Available); this undo is registered after the deadline's, so it runs first (LIFO) -
// required, since a cancel is refused once the selection window is closed.
cleanup.add('topicA reservation -> cancel', () => call('POST', `/api/reservations/${reservation.body.id}/cancel`, { token: studentToken }))

// The remaining checks are wrapped in one function so a genuinely unexpected response (a 500, or
// a shape the script did not plan for) is caught, reported as its own failing check with the
// response body for diagnosis, and does not crash before the summary line or before deciding
// whether cleanup is safe to run.
let templateId
async function runChecks() {
// ---------- upload rules ----------
check('01 markers vocabulary size', (await call('GET', '/api/templates/markers', { token: teacher })).body.length, 20)
const unknown = await call('POST', '/api/templates', { token: teacher, form: templateForm({ name: 'Bad', bytes: docx(paragraph([['{{student.nickname}} {{topic.title}}', false]])), groupIds: [homeGroup.id] }) })
check('02 unknown marker refused', unknown.body.code, 'template.unknownMarkers')
check('03 unknown markers listed', JSON.stringify(unknown.body.errors), JSON.stringify(['student.nickname']))

// Pre-flight A2: any {{ ... }} counts as a marker, including a non-ASCII key such as a Cyrillic
// typo - it must be refused as unknown rather than silently passed through.
const nonAscii = await call('POST', '/api/templates', { token: teacher, form: templateForm({ name: 'Bad', bytes: docx(paragraph([['{{студент.імя}}', false]])), groupIds: [homeGroup.id] }) })
check('03a non-ASCII marker refused and listed', JSON.stringify({ code: nonAscii.body.code, errors: nonAscii.body.errors }), JSON.stringify({ code: 'template.unknownMarkers', errors: ['студент.імя'] }))

check('04 not a Word document', (await call('POST', '/api/templates', { token: teacher, form: templateForm({ name: 'Bad', bytes: Buffer.from('plain text'), groupIds: [homeGroup.id] }) })).body.code, 'template.invalidFile')

// Pre-flight A5: a zip with more entries than the zip-directory guard (1,000) is refused before
// the package is ever opened as Word - kept small with 1,001 empty entries.
const zipBomb = await call('POST', '/api/templates', { token: teacher, form: templateForm({ name: 'Bad', bytes: manyEntriesZip(1001), groupIds: [homeGroup.id] }) })
check('04a zip with too many entries refused', zipBomb.body.code, 'template.invalidFile')

check('05 teacher cannot target all students', (await call('POST', '/api/templates', { token: teacher, form: templateForm({ name: 'Bad', bytes: docx(validBody), allStudents: true }) })).body.code, 'template.audienceNotAllowed')
check('06 teacher cannot target invisible group', (await call('POST', '/api/templates', { token: teacher, form: templateForm({ name: 'Bad', bytes: docx(validBody), groupIds: [otherGroup.id] }) })).body.code, 'template.audienceNotAllowed')

// Fix wave M1 (sec) / review M1: refused before any marker is ever read, each for its own reason -
// a macro-enabled main part, an external relationship whose scheme is not http/https/mailto, and a
// field code that fetches external content.
check('06a macro-enabled main part refused', (await call('POST', '/api/templates', { token: teacher, form: templateForm({ name: 'Bad', bytes: macroEnabledDocx(), groupIds: [homeGroup.id] }) })).body.code, 'template.invalidFile')
check('06b external relationship refused', (await call('POST', '/api/templates', { token: teacher, form: templateForm({ name: 'Bad', bytes: externalRelationshipDocx(), groupIds: [homeGroup.id] }) })).body.code, 'template.invalidFile')
check('06c INCLUDEPICTURE field refused', (await call('POST', '/api/templates', { token: teacher, form: templateForm({ name: 'Bad', bytes: includePictureDocx(), groupIds: [homeGroup.id] }) })).body.code, 'template.invalidFile')

// Re-review new defect 1: a legitimate HYPERLINK field code (a Table of Contents entry, or any
// hyperlink Word serialised as a field rather than a relationship) must be accepted, not refused
// as dangerous. Uploaded and immediately deleted so the script stays self-cleaning.
const hyperlinkUpload = await call('POST', '/api/templates', { token: teacher, form: templateForm({ name: `Hyperlink ${stamp}`, bytes: hyperlinkFieldDocx(), groupIds: [homeGroup.id] }) })
check('06d ordinary HYPERLINK field code accepted', hyperlinkUpload.status, 201)
if (hyperlinkUpload.status === 201) {
  await call('DELETE', `/api/templates/${hyperlinkUpload.body.id}`, { token: teacher })
}

// Re-review new defect 2: the same INCLUDEPICTURE instruction split across two <w:instrText> runs
// inside one complex field must still be refused - checking each run in isolation would let it
// through.
check('06e split INCLUDEPICTURE field refused', (await call('POST', '/api/templates', { token: teacher, form: templateForm({ name: 'Bad', bytes: splitIncludePictureDocx(), groupIds: [homeGroup.id] }) })).body.code, 'template.invalidFile')

const created = await call('POST', '/api/templates', { token: teacher, form: templateForm({ name: `Заява ${stamp}`, bytes: docx(validBody), groupIds: [homeGroup.id], allTeachers: true }) })
check('07 teacher uploads template', created.status, 201)
templateId = created.body.id
// The template is deleted by the run itself at check 31 - this undo is a safety net for a run that
// fails before reaching that check, so it checks the template still exists before deleting it.
cleanup.add(`template ${templateId}`, async () => {
  const stillThere = await call('GET', `/api/templates/${templateId}`, { token: admin })
  if (stillThere.body?.code !== 'template.notFound') {
    await call('DELETE', `/api/templates/${templateId}`, { token: teacher })
  }
})

// ---------- visibility ----------
check('08 student in group sees template', (await call('GET', '/api/templates', { token: studentToken })).body.some((t) => t.id === templateId), true)
check('09 student outside group does not', (await call('GET', '/api/templates', { token: outsiderToken })).body.some((t) => t.id === templateId), false)
check('10 audience hidden from student', (await call('GET', `/api/templates/${templateId}`, { token: studentToken })).body.audience, null)
check('11 other teacher sees (all teachers)', (await call('GET', '/api/templates', { token: otherTeacher })).body.some((t) => t.id === templateId), true)
check('12 other teacher cannot edit', (await call('PUT', `/api/templates/${templateId}`, { token: otherTeacher, json: { name: 'X', groupIds: [], teacherIds: [] } })).body.code, 'template.notOwner')
check('13 outsider generate refused', (await call('POST', `/api/templates/${templateId}/generate`, { token: outsiderToken, json: {} })).body.code, 'template.notFound')

// ---------- generation ----------
const own = await call('POST', `/api/templates/${templateId}/generate`, { token: studentToken, json: {} })
check('14 student generates', own.status, 200)
if (own.status !== 200) throw new Error(`generate returned ${own.status}: ${JSON.stringify(own.body)}`)
const ownParts = unzip(own.bytes)
const ownDocXml = ownParts.get('word/document.xml')
const ownText = textOf(ownDocXml)
check('15 split-run marker filled', ownText.includes('Student: Документенко Іван Петрович'), true)

// Fix wave M17 / review "test gaps": the marker started in the plain run ('{{stud') and ended in
// the bold one ('ent.fullName}}' - ReplaceRange keeps the *starting* run's formatting, so the run
// that now holds the filled name must not be bold.
const filledRun = ownDocXml.match(/<w:r>(?:(?!<\/w:r>)[\s\S])*?Документенко Іван Петрович[\s\S]*?<\/w:r>/)
check('15a starting run formatting kept (fill is not bold)', filledRun ? /<w:b\s*\/>/.test(filledRun[0]) : 'no run matched', false)

check('16 spaced marker and short name', ownText.includes(`Short: Документенко І. П.; group ${homeGroup.code}; dept SE`), true)
check('17 table marker with pending topic', ownText.includes(`Topic: Тема A ${stamp}`), true)
check('18 supervisor short name', ownText.includes('Supervisor: Teacher D.'), true)
check('19 header year filled', textOf(ownParts.get('word/header1.xml')), String(new Date().getFullYear()))

// Fix wave M2 (review) / M17: footnotes, endnotes and comments are scanned and filled too, not
// just the body and header - and the footer marker added to docx() proves the same for footers.
check('19a footer marker filled', textOf(ownParts.get('word/footer1.xml')), homeGroup.code)
check('19b footnote marker filled', textOf(ownParts.get('word/footnotes.xml')).includes(`D${stamp}`), true)

check('20 no markers left', /\{\{/.test(ownText), false)
check('21 file name with last name', decodeURIComponent((own.headers.get('content-disposition') ?? '').split("''")[1] ?? '').endsWith('Документенко.docx'), true)

const chosenResponse = await call('POST', `/api/templates/${templateId}/generate`, { token: studentToken, json: { topicId: topicA.id } })
check('22 student names own pending-reservation topic explicitly (control-char description generates fine, I2)', chosenResponse.status, 200)
const chosenXml = chosenResponse.status === 200 ? unzip(chosenResponse.bytes).get('word/document.xml') : ''
const chosenText = textOf(chosenXml)
check('22a topic title from picked topic', chosenText.includes(`Topic: Тема A ${stamp}`), true)
// The SDK's writer serialises a self-closing empty element with a space before the slash
// (<w:br />), not <w:br/>, so the count must tolerate either.
check('22b multi-line description produces exactly two <w:br/>', (chosenXml.match(/<w:br\s*\/>/g) ?? []).length, 2)
check('22c multi-line description text kept, control char dropped, tab kept', chosenText.includes('Перший рядок') && chosenText.includes('Другий рядок') && chosenText.includes('третій') && chosenText.includes('Таб'), true)

// A student naming topicB - a catalogue topic they have never reserved, and which is otherwise
// fully visible in the catalogue - must be refused exactly like an unknown id, not honoured just
// because the catalogue makes it visible.
const unreservedTopic = await call('POST', `/api/templates/${templateId}/generate`, { token: studentToken, json: { topicId: topicB.id } })
check('22d student naming an unreserved catalogue topic refused', unreservedTopic.body.code, 'topic.notFound')

const forStudent = unzip((await call('POST', `/api/templates/${templateId}/generate`, { token: teacher, json: { studentId: student.id } })).bytes)
check('23 reviewer generates for student', textOf(forStudent.get('word/document.xml')).includes('Документенко Іван Петрович'), true)
const blank = unzip((await call('POST', `/api/templates/${templateId}/generate`, { token: teacher, json: {} })).bytes)
check('24 blank form has no student', textOf(blank.get('word/document.xml')).includes('Документенко'), false)
check('25 unrelated teacher cannot generate for student', (await call('POST', `/api/templates/${templateId}/generate`, { token: otherTeacher, json: { studentId: student.id } })).body.code, 'student.notFound')
check('26 eligible students for reviewer', (await call('GET', '/api/templates/students', { token: teacher })).body.some((s) => s.id === student.id), true)

// ---------- management ----------
const source = await call('GET', `/api/templates/${templateId}/source`, { token: teacher })
check('27 owner downloads source with markers', textOf(unzip(source.bytes).get('word/document.xml')).includes('{{topic.title}}'), true)
check('28 replace file with unknown marker refused', (await call('PUT', `/api/templates/${templateId}/file`, { token: teacher, form: (() => { const f = new FormData(); f.append('file', new Blob([docx(paragraph([['{{oops}}', false]]))]), 'v2.docx'); return f })() })).body.code, 'template.unknownMarkers')

// Fix wave A3 / M17: an admin update that keeps the group the template already had (homeGroup) and
// adds another (otherGroup) in the same request must succeed and result in both being saved -
// proving the audience is updated by difference rather than replaced wholesale.
const keepAndAdd = await call('PUT', `/api/templates/${templateId}`, { token: admin, json: { name: `Заява ${stamp}`, visibleToAllStudents: false, visibleToAllTeachers: true, groupIds: [homeGroup.id, otherGroup.id], teacherIds: [] } })
check('28a admin keeps one group and adds another (A3)', keepAndAdd.status === 200 && keepAndAdd.body.audience.groups.length === 2, true)

// Fix wave M17: a successful file replacement, then generation from the new file, so a replace is
// proven to work end to end and not just refused on an unknown marker (check 28).
const replaced = await call('PUT', `/api/templates/${templateId}/file`, { token: teacher, form: (() => { const f = new FormData(); f.append('file', new Blob([docx(validBody)]), 'v3.docx'); return f })() })
check('28b successful file replacement', replaced.status, 200)
const afterReplace = unzip((await call('POST', `/api/templates/${templateId}/generate`, { token: studentToken, json: {} })).bytes)
check('28c generation from the replaced file works', textOf(afterReplace.get('word/document.xml')).includes('Документенко Іван Петрович'), true)

check('29 admin updates audience to all students', (await call('PUT', `/api/templates/${templateId}`, { token: admin, json: { name: `Заява ${stamp}`, visibleToAllStudents: true, visibleToAllTeachers: true, groupIds: [], teacherIds: [] } })).body.audience.visibleToAllStudents, true)

// Fix wave I1 (backend half) / M17: once the audience is *All students*, the owning teacher's own
// edit (which - like the real editor - sends the template's own current value back unchanged)
// must not be refused and must not silently turn the administrator's choice off; only turning it
// from false to true is refused for a teacher.
const teacherKeepsAllStudents = await call('PUT', `/api/templates/${templateId}`, { token: teacher, json: { name: `Заява ${stamp} (v2)`, visibleToAllStudents: true, visibleToAllTeachers: true, groupIds: [], teacherIds: [] } })
check('29a teacher-owner edit keeps admin-set all-students (I1)', teacherKeepsAllStudents.status === 200 && teacherKeepsAllStudents.body.audience.visibleToAllStudents, true)

check('30 outsider now sees template', (await call('GET', '/api/templates', { token: outsiderToken })).body.some((t) => t.id === templateId), true)
check('31 owner deletes', (await call('DELETE', `/api/templates/${templateId}`, { token: teacher })).status, 204)
check('32 deleted template gone', (await call('GET', `/api/templates/${templateId}`, { token: admin })).body.code, 'template.notFound')
}

try {
  await runChecks()
} catch (error) {
  console.log(`\nUnexpected script error (not a plain check failure): ${error.message}`)
  results.push(false)
} finally {
  await cleanup.run()
}

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
