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

// Track everything this run creates that must not survive it (see cleanup() at the end).
const createdGroupIds = []
const createdStudentIds = []

const seededGroups = (await call('GET', '/api/groups', { token: admin })).data
const seededGroupId = seededGroups.find((g) => g.code === 'SEED-A').id

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
const yearA = '2026/2027'
const yearB = '2027/2028'

const group1 = await call('POST', '/api/groups', { token: admin, json: { departmentId: departmentB.id, code: groupCode, academicYear: yearA } })
check('01 create group', group1.status, 201)
createdGroupIds.push(group1.data.id)
check('02 group code duplicate same year', (await call('POST', '/api/groups', { token: admin, json: { departmentId: departmentB.id, code: groupCode, academicYear: yearA } })).status, 409)
check('03 group code duplicate same year -> code', (await call('POST', '/api/groups', { token: admin, json: { departmentId: departmentB.id, code: groupCode, academicYear: yearA } })).data.code, 'group.codeTaken')

const groupYearB = await call('POST', '/api/groups', { token: admin, json: { departmentId: departmentB.id, code: groupCode, academicYear: yearB } })
check('04 same code, different year allowed', groupYearB.status, 201)
createdGroupIds.push(groupYearB.data.id)

const groupMismatch = group1.data

const groupMatch = await call('POST', '/api/groups', { token: admin, json: { departmentId: departmentA.id, code: `RFMATCH${stamp}`, academicYear: yearA } })
check('05 create matching-faculty group', groupMatch.status, 201)
createdGroupIds.push(groupMatch.data.id)

// B9: academic year is restricted to digits, '/', '\', '-', '.' and whitespace
const badAcademicYear = await call('POST', '/api/groups', { token: admin, json: { departmentId: departmentB.id, code: `RFBADYEAR${stamp}`, academicYear: 'RF-123-A' } })
check('06 invalid academic year format -> 400', badAcademicYear.status, 400)
check('07 invalid academic year format -> code', badAcademicYear.data.code, 'validation.failed')

// ---------------------------------------------------------------------------
// Task templates per faculty
// ---------------------------------------------------------------------------

// Faculty A is the seeded faculty, shared with every other run, so a fixed order collides with
// whatever an earlier run left behind. Take the next free order instead; faculty B is created
// fresh each run, so its orders need no such care.
const existingA = (await call('GET', `/api/task-templates?facultyId=${facultyA.id}`, { token: admin })).data
const orderA = Math.max(0, ...existingA.map((t) => t.order)) + 1

const templateA = await call('POST', '/api/task-templates', { token: admin, json: { facultyId: facultyA.id, title: `RF Step ${stamp}`, order: orderA } })
check('08 create task template', templateA.status, 201)

const listByFacultyA = (await call('GET', `/api/task-templates?facultyId=${facultyA.id}`, { token: admin })).data
check('09 faculty filter includes own template', listByFacultyA.some((t) => t.id === templateA.data.id), true)
const listByFacultyB = (await call('GET', `/api/task-templates?facultyId=${facultyB.id}`, { token: admin })).data
check('10 faculty filter excludes other faculty template', listByFacultyB.some((t) => t.id === templateA.data.id), false)

// B9: step template order is unique per faculty
const duplicateOrder = await call('POST', '/api/task-templates', { token: admin, json: { facultyId: facultyA.id, title: `RF Duplicate Order ${stamp}`, order: orderA } })
check('11 duplicate order in same faculty -> 409', duplicateOrder.status, 409)
check('12 duplicate order in same faculty -> code', duplicateOrder.data.code, 'taskTemplate.orderTaken')

// B1: the same active title is allowed in a different faculty (per-faculty uniqueness)
const templateBSameTitle = await call('POST', '/api/task-templates', { token: admin, json: { facultyId: facultyB.id, title: templateA.data.title, order: 993 } })
check('B1 same active title allowed in a different faculty', templateBSameTitle.status, 201)

// B7: task-template writes are Admin-only; a teacher gets 403
const teacherToken = (await login('teacher@diploma.local', 'Teacher123!')).data.token
const teacherCreateAttempt = await call('POST', '/api/task-templates', { token: teacherToken, json: { facultyId: facultyA.id, title: `RF Teacher Attempt ${stamp}`, order: orderA + 1 } })
check('B7 teacher cannot create task template', teacherCreateAttempt.status, 403)

const future1 = new Date(Date.now() + 30 * 86400000).toISOString()
const future2 = new Date(Date.now() + 60 * 86400000).toISOString()

const mismatch = await call('POST', '/api/group-tasks', { token: admin, json: { groupId: groupMismatch.id, taskTemplateId: templateA.data.id, deadline: future1 } })
check('13 template faculty mismatch', mismatch.status, 400)
check('14 template faculty mismatch code', mismatch.data.code, 'groupTask.templateFacultyMismatch')

const badTimeline = await call('POST', '/api/group-tasks', { token: admin, json: { groupId: groupMatch.data.id, taskTemplateId: templateA.data.id, startDate: future2, deadline: future1 } })
check('15 start after deadline', badTimeline.status, 400)
check('16 start after deadline code', badTimeline.data.code, 'groupTask.startAfterDeadline')

const groupTask = await call('POST', '/api/group-tasks', { token: admin, json: { groupId: groupMatch.data.id, taskTemplateId: templateA.data.id, startDate: future1, deadline: future2 } })
check('17 create group task', groupTask.status, 201)

// ---------------------------------------------------------------------------
// Steps for a student who joins a group that already has assigned steps
// ---------------------------------------------------------------------------

const lateJoinerEmail = `latejoiner.${stamp}@student.local`
const lateJoinerPassword = 'Password1!'
const lateJoiner = await call('POST', '/api/students', { token: admin, json: { firstName: 'Late', lastName: 'Joiner', email: lateJoinerEmail, studentNumber: `LJ${stamp}`, groupId: groupMatch.data.id, password: lateJoinerPassword } })
check('18 create late joiner', lateJoiner.status, 201)
createdStudentIds.push(lateJoiner.data.id)

const lateJoinerToken = (await login(lateJoinerEmail, lateJoinerPassword)).data.token
// Phase 5 removed /api/student/my-tasks; /api/student-tasks/mine replaces it.
const myTasks = (await call('GET', '/api/student-tasks/mine', { token: lateJoinerToken })).data
check('19 late joiner receives existing group step', myTasks.some((t) => t.groupTaskId === groupTask.data.id), true)

// ---------------------------------------------------------------------------
// Administrators
// ---------------------------------------------------------------------------

const admin1Email = `rfadmin1.${stamp}@x.local`
const admin1 = await call('POST', '/api/admins', { token: admin, json: { firstName: 'RF', lastName: 'AdminOne', email: admin1Email, password: 'Admin1Pass!' } })
check('20 create admin', admin1.status, 201)
check('21 create admin duplicate email', (await call('POST', '/api/admins', { token: admin, json: { firstName: 'RF', lastName: 'Dup', email: admin1Email, password: 'Admin1Pass!' } })).status, 409)

check('22 set admin password', (await call('PUT', `/api/admins/${admin1.data.id}/password`, { token: admin, json: { password: 'Admin1Pass2!' } })).status, 204)
const admin1Token = (await login(admin1Email, 'Admin1Pass2!')).data.token
check('23 admin1 signs in with new password', typeof admin1Token, 'string')

check('24 deactivate self', (await call('POST', `/api/admins/${admin1.data.id}/deactivate`, { token: admin1Token })).status, 400)

const admin2Email = `rfadmin2.${stamp}@x.local`
const admin2 = await call('POST', '/api/admins', { token: admin, json: { firstName: 'RF', lastName: 'AdminTwo', email: admin2Email, password: 'Admin2Pass!' } })
check('25 create second admin', admin2.status, 201)
check('26 deactivate admin2', (await call('POST', `/api/admins/${admin2.data.id}/deactivate`, { token: admin })).status, 204)
check('27 deactivate admin1', (await call('POST', `/api/admins/${admin1.data.id}/deactivate`, { token: admin })).status, 204)

// Only the seed admin remains active now. Use admin1's still-valid token (issued before it was
// deactivated) to attempt deactivating the seed admin: not a self-deactivation (different id), so
// this exercises the "last active administrator" guard rather than the self-guard.
const seedAdminId = (await call('GET', '/api/admins', { token: admin })).data.find((a) => a.email === 'admin@diploma.local').id
const lastActive = await call('POST', `/api/admins/${seedAdminId}/deactivate`, { token: admin1Token })
check('28 deactivate last active administrator', lastActive.status, 409)
check('29 deactivate last active administrator code', lastActive.data.code, 'admin.lastActive')

check('30 reactivate admin1', (await call('POST', `/api/admins/${admin1.data.id}/activate`, { token: admin })).status, 204)
// Restore invariant for future runs: only the seed admin stays active among admins this script creates.
check('31 deactivate admin1 again', (await call('POST', `/api/admins/${admin1.data.id}/deactivate`, { token: admin })).status, 204)

// ---------------------------------------------------------------------------
// Archiving students
// ---------------------------------------------------------------------------

const arch1Email = `rfarchive1.${stamp}@student.local`
const arch2Email = `rfarchive2.${stamp}@student.local`
const archPassword = 'Password1!'
const arch1 = (await call('POST', '/api/students', { token: admin, json: { firstName: 'Arch', lastName: 'One', email: arch1Email, studentNumber: `RFA1${stamp}`, groupId: groupMatch.data.id, password: archPassword } })).data
const arch2 = (await call('POST', '/api/students', { token: admin, json: { firstName: 'Arch', lastName: 'Two', email: arch2Email, studentNumber: `RFA2${stamp}`, groupId: groupMatch.data.id, password: archPassword } })).data
createdStudentIds.push(arch1.id, arch2.id)

const archiveResult = await call('POST', '/api/students/archive', { token: admin, json: { studentIds: [arch1.id, arch2.id] } })
check('32 archive two students', archiveResult.status, 200)
check('33 archive count', archiveResult.data.archived, 2)

const activeList = (await call('GET', '/api/students', { token: admin })).data
check('34 archived student hidden from default list', activeList.some((s) => s.email === arch1Email), false)

const archivedList = (await call('GET', '/api/students?archived=true', { token: admin })).data
const archivedEntry = archivedList.find((s) => s.email === arch1Email)
check('35 archived student appears in archived list', Boolean(archivedEntry), true)
check('36 archived student has archivedAt', typeof archivedEntry?.archivedAt, 'string')

check('37 archived student login refused', (await login(arch1Email, archPassword)).status, 401)

const editArchived = await call('PUT', `/api/students/${arch1.id}`, { token: admin, json: { firstName: 'Arch', lastName: 'One', email: arch1Email, studentNumber: `RFA1${stamp}`, groupId: groupMatch.data.id } })
check('38 edit archived student refused', editArchived.status, 409)
check('39 edit archived student code', editArchived.data.code, 'student.archived')

const restoreResult = await call('POST', '/api/students/restore', { token: admin, json: { studentIds: [arch1.id, arch2.id] } })
check('40 restore two students', restoreResult.status, 200)
check('41 restore count', restoreResult.data.restored, 2)

const listAfterRestore = (await call('GET', '/api/students', { token: admin })).data
check('42 restored student visible again', listAfterRestore.some((s) => s.email === arch1Email), true)
check('43 restored student signs in', (await login(arch1Email, archPassword)).status, 200)

// ---------------------------------------------------------------------------
// Group archive
// ---------------------------------------------------------------------------

const groupG = await call('POST', '/api/groups', { token: admin, json: { departmentId: departmentA.id, code: `RFGROUP${stamp}`, academicYear: yearA } })
createdGroupIds.push(groupG.data.id)
const gStudent1Email = `rfgroup1.${stamp}@student.local`
const gStudent2Email = `rfgroup2.${stamp}@student.local`
const gStudent1 = (await call('POST', '/api/students', { token: admin, json: { firstName: 'G', lastName: 'One', email: gStudent1Email, studentNumber: `RFG1${stamp}`, groupId: groupG.data.id, password: 'Password1!' } })).data
const gStudent2 = (await call('POST', '/api/students', { token: admin, json: { firstName: 'G', lastName: 'Two', email: gStudent2Email, studentNumber: `RFG2${stamp}`, groupId: groupG.data.id, password: 'Password1!' } })).data
createdStudentIds.push(gStudent1.id, gStudent2.id)

const groupArchive = await call('POST', `/api/groups/${groupG.data.id}/students/archive`, { token: admin })
check('44 group archive', groupArchive.status, 200)
check('45 group archive count', groupArchive.data.archived, 2)
check('46 group students list excludes archived', (await call('GET', `/api/groups/${groupG.data.id}/students`, { token: admin })).data.length, 0)
check('47 group archive unknown group', (await call('POST', '/api/groups/00000000-0000-0000-0000-000000000001/students/archive', { token: admin })).status, 404)

// ---------------------------------------------------------------------------
// B2: deadline edit and the following GET must agree on student-task count
// when an archived student is in the group
// ---------------------------------------------------------------------------

const groupH = await call('POST', '/api/groups', { token: admin, json: { departmentId: departmentA.id, code: `RFCOUNT${stamp}`, academicYear: yearA } })
createdGroupIds.push(groupH.data.id)
const hStudent1Email = `rfcount1.${stamp}@student.local`
const hStudent2Email = `rfcount2.${stamp}@student.local`
const hStudent1 = (await call('POST', '/api/students', { token: admin, json: { firstName: 'H', lastName: 'One', email: hStudent1Email, studentNumber: `RFH1${stamp}`, groupId: groupH.data.id, password: 'Password1!' } })).data
const hStudent2 = (await call('POST', '/api/students', { token: admin, json: { firstName: 'H', lastName: 'Two', email: hStudent2Email, studentNumber: `RFH2${stamp}`, groupId: groupH.data.id, password: 'Password1!' } })).data
createdStudentIds.push(hStudent1.id, hStudent2.id)

const templateH = (await call('POST', '/api/task-templates', { token: admin, json: { facultyId: facultyA.id, title: `RF Count Step ${stamp}`, order: orderA + 2 } })).data
const groupTaskH = (await call('POST', '/api/group-tasks', { token: admin, json: { groupId: groupH.data.id, taskTemplateId: templateH.id, deadline: future1 } })).data

check('48 archive one student in the count group', (await call('POST', '/api/students/archive', { token: admin, json: { studentIds: [hStudent1.id] } })).status, 200)

const future3 = new Date(Date.now() + 45 * 86400000).toISOString()
const deadlineEdit = await call('PUT', `/api/group-tasks/${groupTaskH.id}`, { token: admin, json: { startDate: null, deadline: future3 } })
check('49 deadline edit succeeds', deadlineEdit.status, 200)

const groupTaskHAfterGet = (await call('GET', `/api/group-tasks/${groupTaskH.id}`, { token: admin })).data
check('50 deadline edit count matches following GET', deadlineEdit.data.studentTaskCount, groupTaskHAfterGet.studentTaskCount)
check('51 deadline edit count excludes archived student', deadlineEdit.data.studentTaskCount, 1)

// ---------------------------------------------------------------------------
// Cleanup: leave no group behind.
//
// DELETE /api/groups/{id} refuses with 409 group.hasStudents while any student profile still
// points at the group (archived or not), and there is no endpoint that deletes a student. So
// every student this script created is restored (if archived), moved into the seeded group, and
// re-archived there, before the five groups this script created are deleted. Run only if every
// check above passed; otherwise leave everything in place for diagnosis.
// ---------------------------------------------------------------------------

async function cleanup() {
  const restore = await call('POST', '/api/students/restore', { token: admin, json: { studentIds: createdStudentIds } })
  check('52 cleanup: restore archived students', restore.status, 200)

  for (const [index, studentId] of createdStudentIds.entries()) {
    const move = await call('PUT', `/api/students/${studentId}/group`, { token: admin, json: { groupId: seededGroupId } })
    check(`53.${index + 1} cleanup: move student ${index + 1}/${createdStudentIds.length} to seeded group`, move.status, 200)
  }

  const archive = await call('POST', '/api/students/archive', { token: admin, json: { studentIds: createdStudentIds } })
  check('54 cleanup: archive moved students', archive.status, 200)

  for (const [index, groupId] of createdGroupIds.entries()) {
    const remove = await call('DELETE', `/api/groups/${groupId}`, { token: admin })
    check(`55.${index + 1} cleanup: delete group ${index + 1}/${createdGroupIds.length}`, remove.status, 204)
  }
}

const failedBeforeCleanup = results.filter((r) => !r.ok)
if (failedBeforeCleanup.length === 0) {
  await cleanup()
} else {
  console.log(`\nSkipping cleanup: ${failedBeforeCleanup.length} check(s) already failed; leaving created rows in place for diagnosis.`)
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
