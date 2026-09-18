const API = 'http://localhost:5000'
const stamp = Date.now().toString().slice(-6)
const results = []

function check(name, actual, expected) {
  const ok = actual === expected
  results.push({ name, ok, actual, expected })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`)
}

async function call(method, path, { token, json } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  let body
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(json)
  }
  const response = await fetch(API + path, { method, headers, body })
  const text = await response.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  return { status: response.status, data }
}

const login = (email, password) => call('POST', '/api/auth/login', { json: { email, password } })

const admin = (await login('admin@diploma.local', 'Admin123!')).data.token

// ---------------------------------------------------------------------------
// Group code uniqueness per academic year
// ---------------------------------------------------------------------------

const faculties = (await call('GET', '/api/faculties', { token: admin })).data
const facultyA = faculties.find((f) => f.shortName === 'FICS')
const departmentsA = (await call('GET', `/api/departments?facultyId=${facultyA.id}`, { token: admin })).data
const departmentA = departmentsA[0]

const facultyB = (await call('POST', '/api/faculties', { token: admin, json: { name: `RF Faculty ${stamp}`, shortName: `RF${stamp}` } })).data
const departmentB = (await call('POST', '/api/departments', { token: admin, json: { facultyId: facultyB.id, name: `RF Department ${stamp}`, shortName: `RFD${stamp}` } })).data

const groupCode = `RFCODE${stamp}`
const yearA = `RF-${stamp}-A`
const yearB = `RF-${stamp}-B`

const group1 = await call('POST', '/api/groups', { token: admin, json: { departmentId: departmentB.id, code: groupCode, academicYear: yearA } })
check('01 create group', group1.status, 201)
check('02 group code duplicate same year', (await call('POST', '/api/groups', { token: admin, json: { departmentId: departmentB.id, code: groupCode, academicYear: yearA } })).status, 409)
check('03 group code duplicate same year -> code', (await call('POST', '/api/groups', { token: admin, json: { departmentId: departmentB.id, code: groupCode, academicYear: yearA } })).data.code, 'group.codeTaken')
check('04 same code, different year allowed', (await call('POST', '/api/groups', { token: admin, json: { departmentId: departmentB.id, code: groupCode, academicYear: yearB } })).status, 201)

const groupMismatch = group1.data

const groupMatch = await call('POST', '/api/groups', { token: admin, json: { departmentId: departmentA.id, code: `RFMATCH${stamp}`, academicYear: yearA } })
check('05 create matching-faculty group', groupMatch.status, 201)

// ---------------------------------------------------------------------------
// Task templates per faculty
// ---------------------------------------------------------------------------

const templateA = await call('POST', '/api/task-templates', { token: admin, json: { facultyId: facultyA.id, title: `RF Step ${stamp}`, order: 999 } })
check('06 create task template', templateA.status, 201)

const listByFacultyA = (await call('GET', `/api/task-templates?facultyId=${facultyA.id}`, { token: admin })).data
check('07 faculty filter includes own template', listByFacultyA.some((t) => t.id === templateA.data.id), true)
const listByFacultyB = (await call('GET', `/api/task-templates?facultyId=${facultyB.id}`, { token: admin })).data
check('08 faculty filter excludes other faculty template', listByFacultyB.some((t) => t.id === templateA.data.id), false)

// B1: the same active title is allowed in a different faculty (per-faculty uniqueness)
const templateBSameTitle = await call('POST', '/api/task-templates', { token: admin, json: { facultyId: facultyB.id, title: templateA.data.title, order: 999 } })
check('B1 same active title allowed in a different faculty', templateBSameTitle.status, 201)

// B7: task-template writes are Admin-only; a teacher gets 403
const teacherToken = (await login('teacher@diploma.local', 'Teacher123!')).data.token
const teacherCreateAttempt = await call('POST', '/api/task-templates', { token: teacherToken, json: { facultyId: facultyA.id, title: `RF Teacher Attempt ${stamp}`, order: 999 } })
check('B7 teacher cannot create task template', teacherCreateAttempt.status, 403)

const future1 = new Date(Date.now() + 30 * 86400000).toISOString()
const future2 = new Date(Date.now() + 60 * 86400000).toISOString()

const mismatch = await call('POST', '/api/group-tasks', { token: admin, json: { groupId: groupMismatch.id, taskTemplateId: templateA.data.id, deadline: future1 } })
check('09 template faculty mismatch', mismatch.status, 400)
check('10 template faculty mismatch code', mismatch.data.code, 'groupTask.templateFacultyMismatch')

const badTimeline = await call('POST', '/api/group-tasks', { token: admin, json: { groupId: groupMatch.data.id, taskTemplateId: templateA.data.id, startDate: future2, deadline: future1 } })
check('11 start after deadline', badTimeline.status, 400)
check('12 start after deadline code', badTimeline.data.code, 'groupTask.startAfterDeadline')

const groupTask = await call('POST', '/api/group-tasks', { token: admin, json: { groupId: groupMatch.data.id, taskTemplateId: templateA.data.id, startDate: future1, deadline: future2 } })
check('13 create group task', groupTask.status, 201)

// ---------------------------------------------------------------------------
// Steps for a student who joins a group that already has assigned steps
// ---------------------------------------------------------------------------

const lateJoinerEmail = `latejoiner.${stamp}@student.local`
const lateJoinerPassword = 'Password1!'
const lateJoiner = await call('POST', '/api/students', { token: admin, json: { firstName: 'Late', lastName: 'Joiner', email: lateJoinerEmail, studentNumber: `LJ${stamp}`, groupId: groupMatch.data.id, password: lateJoinerPassword } })
check('14 create late joiner', lateJoiner.status, 201)

const lateJoinerToken = (await login(lateJoinerEmail, lateJoinerPassword)).data.token
const myTasks = (await call('GET', '/api/student/my-tasks', { token: lateJoinerToken })).data
check('15 late joiner receives existing group step', myTasks.some((t) => t.groupTaskId === groupTask.data.id), true)

// ---------------------------------------------------------------------------
// Administrators
// ---------------------------------------------------------------------------

const admin1Email = `rfadmin1.${stamp}@x.local`
const admin1 = await call('POST', '/api/admins', { token: admin, json: { firstName: 'RF', lastName: 'AdminOne', email: admin1Email, password: 'Admin1Pass!' } })
check('16 create admin', admin1.status, 201)
check('17 create admin duplicate email', (await call('POST', '/api/admins', { token: admin, json: { firstName: 'RF', lastName: 'Dup', email: admin1Email, password: 'Admin1Pass!' } })).status, 409)

check('18 set admin password', (await call('PUT', `/api/admins/${admin1.data.id}/password`, { token: admin, json: { password: 'Admin1Pass2!' } })).status, 204)
const admin1Token = (await login(admin1Email, 'Admin1Pass2!')).data.token
check('19 admin1 signs in with new password', typeof admin1Token, 'string')

check('20 deactivate self', (await call('POST', `/api/admins/${admin1.data.id}/deactivate`, { token: admin1Token })).status, 400)

const admin2Email = `rfadmin2.${stamp}@x.local`
const admin2 = await call('POST', '/api/admins', { token: admin, json: { firstName: 'RF', lastName: 'AdminTwo', email: admin2Email, password: 'Admin2Pass!' } })
check('21 create second admin', admin2.status, 201)
check('22 deactivate admin2', (await call('POST', `/api/admins/${admin2.data.id}/deactivate`, { token: admin })).status, 204)
check('23 deactivate admin1', (await call('POST', `/api/admins/${admin1.data.id}/deactivate`, { token: admin })).status, 204)

// Only the seed admin remains active now. Use admin1's still-valid token (issued before it was
// deactivated) to attempt deactivating the seed admin: not a self-deactivation (different id), so
// this exercises the "last active administrator" guard rather than the self-guard.
const seedAdminId = (await call('GET', '/api/admins', { token: admin })).data.find((a) => a.email === 'admin@diploma.local').id
const lastActive = await call('POST', `/api/admins/${seedAdminId}/deactivate`, { token: admin1Token })
check('24 deactivate last active administrator', lastActive.status, 409)
check('25 deactivate last active administrator code', lastActive.data.code, 'admin.lastActive')

check('26 reactivate admin1', (await call('POST', `/api/admins/${admin1.data.id}/activate`, { token: admin })).status, 204)
// Restore invariant for future runs: only the seed admin stays active among admins this script creates.
check('27 deactivate admin1 again', (await call('POST', `/api/admins/${admin1.data.id}/deactivate`, { token: admin })).status, 204)

// ---------------------------------------------------------------------------
// Archiving students
// ---------------------------------------------------------------------------

const arch1Email = `rfarchive1.${stamp}@student.local`
const arch2Email = `rfarchive2.${stamp}@student.local`
const archPassword = 'Password1!'
const arch1 = (await call('POST', '/api/students', { token: admin, json: { firstName: 'Arch', lastName: 'One', email: arch1Email, studentNumber: `RFA1${stamp}`, groupId: groupMatch.data.id, password: archPassword } })).data
const arch2 = (await call('POST', '/api/students', { token: admin, json: { firstName: 'Arch', lastName: 'Two', email: arch2Email, studentNumber: `RFA2${stamp}`, groupId: groupMatch.data.id, password: archPassword } })).data

const archiveResult = await call('POST', '/api/students/archive', { token: admin, json: { studentIds: [arch1.id, arch2.id] } })
check('28 archive two students', archiveResult.status, 200)
check('29 archive count', archiveResult.data.archived, 2)

const activeList = (await call('GET', '/api/students', { token: admin })).data
check('30 archived student hidden from default list', activeList.some((s) => s.email === arch1Email), false)

const archivedList = (await call('GET', '/api/students?archived=true', { token: admin })).data
const archivedEntry = archivedList.find((s) => s.email === arch1Email)
check('31 archived student appears in archived list', Boolean(archivedEntry), true)
check('32 archived student has archivedAt', typeof archivedEntry?.archivedAt, 'string')

check('33 archived student login refused', (await login(arch1Email, archPassword)).status, 401)

const editArchived = await call('PUT', `/api/students/${arch1.id}`, { token: admin, json: { firstName: 'Arch', lastName: 'One', email: arch1Email, studentNumber: `RFA1${stamp}`, groupId: groupMatch.data.id } })
check('34 edit archived student refused', editArchived.status, 409)
check('35 edit archived student code', editArchived.data.code, 'student.archived')

const restoreResult = await call('POST', '/api/students/restore', { token: admin, json: { studentIds: [arch1.id, arch2.id] } })
check('36 restore two students', restoreResult.status, 200)
check('37 restore count', restoreResult.data.restored, 2)

const listAfterRestore = (await call('GET', '/api/students', { token: admin })).data
check('38 restored student visible again', listAfterRestore.some((s) => s.email === arch1Email), true)
check('39 restored student signs in', (await login(arch1Email, archPassword)).status, 200)

// ---------------------------------------------------------------------------
// Group archive
// ---------------------------------------------------------------------------

const groupG = await call('POST', '/api/groups', { token: admin, json: { departmentId: departmentA.id, code: `RFGROUP${stamp}`, academicYear: yearA } })
const gStudent1Email = `rfgroup1.${stamp}@student.local`
const gStudent2Email = `rfgroup2.${stamp}@student.local`
await call('POST', '/api/students', { token: admin, json: { firstName: 'G', lastName: 'One', email: gStudent1Email, studentNumber: `RFG1${stamp}`, groupId: groupG.data.id, password: 'Password1!' } })
await call('POST', '/api/students', { token: admin, json: { firstName: 'G', lastName: 'Two', email: gStudent2Email, studentNumber: `RFG2${stamp}`, groupId: groupG.data.id, password: 'Password1!' } })

const groupArchive = await call('POST', `/api/groups/${groupG.data.id}/students/archive`, { token: admin })
check('40 group archive', groupArchive.status, 200)
check('41 group archive count', groupArchive.data.archived, 2)
check('42 group students list excludes archived', (await call('GET', `/api/groups/${groupG.data.id}/students`, { token: admin })).data.length, 0)
check('43 group archive unknown group', (await call('POST', '/api/groups/00000000-0000-0000-0000-000000000001/students/archive', { token: admin })).status, 404)

// ---------------------------------------------------------------------------
// B2: deadline edit and the following GET must agree on student-task count
// when an archived student is in the group
// ---------------------------------------------------------------------------

const groupH = await call('POST', '/api/groups', { token: admin, json: { departmentId: departmentA.id, code: `RFCOUNT${stamp}`, academicYear: yearA } })
const hStudent1Email = `rfcount1.${stamp}@student.local`
const hStudent2Email = `rfcount2.${stamp}@student.local`
const hStudent1 = (await call('POST', '/api/students', { token: admin, json: { firstName: 'H', lastName: 'One', email: hStudent1Email, studentNumber: `RFH1${stamp}`, groupId: groupH.data.id, password: 'Password1!' } })).data
await call('POST', '/api/students', { token: admin, json: { firstName: 'H', lastName: 'Two', email: hStudent2Email, studentNumber: `RFH2${stamp}`, groupId: groupH.data.id, password: 'Password1!' } })

const templateH = (await call('POST', '/api/task-templates', { token: admin, json: { facultyId: facultyA.id, title: `RF Count Step ${stamp}`, order: 999 } })).data
const groupTaskH = (await call('POST', '/api/group-tasks', { token: admin, json: { groupId: groupH.data.id, taskTemplateId: templateH.id, deadline: future1 } })).data

check('44 archive one student in the count group', (await call('POST', '/api/students/archive', { token: admin, json: { studentIds: [hStudent1.id] } })).status, 200)

const future3 = new Date(Date.now() + 45 * 86400000).toISOString()
const deadlineEdit = await call('PUT', `/api/group-tasks/${groupTaskH.id}`, { token: admin, json: { startDate: null, deadline: future3 } })
check('45 deadline edit succeeds', deadlineEdit.status, 200)

const groupTaskHAfterGet = (await call('GET', `/api/group-tasks/${groupTaskH.id}`, { token: admin })).data
check('46 deadline edit count matches following GET', deadlineEdit.data.studentTaskCount, groupTaskHAfterGet.studentTaskCount)
check('47 deadline edit count excludes archived student', deadlineEdit.data.studentTaskCount, 1)

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
