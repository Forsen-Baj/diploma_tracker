const API = 'http://localhost:5000'
const stamp = Date.now().toString().slice(-6)
const results = []

function check(name, actual, expected) {
  const ok = actual === expected
  results.push({ name, ok, actual, expected })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${actual}${ok ? '' : ` (expected ${expected})`}`)
}

async function call(method, path, { token, json, form } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  let body
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(json)
  }
  if (form) body = form
  const response = await fetch(API + path, { method, headers, body })
  const text = await response.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  return { status: response.status, data }
}

const login = (email, password) => call('POST', '/api/auth/login', { json: { email, password } })

function csvForm(content, name = 'students.csv') {
  const form = new FormData()
  const blob = content instanceof Uint8Array ? new Blob([content]) : new Blob([content], { type: 'text/csv' })
  form.append('file', blob, name)
  return form
}

const admin = (await login('admin@diploma.local', 'Admin123!')).data.token
const groups = (await call('GET', '/api/groups', { token: admin })).data
const groupId = groups.find((g) => g.code === 'SEED-A').id
const teachers = (await call('GET', '/api/teachers', { token: admin })).data
const teacherId = teachers.find((t) => t.email === 'teacher@diploma.local').id

// Registration switch
await call('PUT', '/api/registration', { token: admin, json: { open: false } })
check('01 registration anonymous GET', (await call('GET', '/api/registration')).status, 200)
check('02 claim while closed', (await call('POST', '/api/auth/claim', { json: { email: 'x@x.x', studentNumber: 'X', password: 'Password1!' } })).status, 403)
check('03 registration PUT as admin', (await call('PUT', '/api/registration', { token: admin, json: { open: true } })).status, 204)
check('04 registration now open', (await call('GET', '/api/registration')).data.open, true)

// Import
const emailA = `ivan.${stamp}@student.local`
const emailB = `olena.${stamp}@student.local`
const numberA = `kv${stamp}a`
const numberB = `KV${stamp}B`
const validCsv = `﻿lastName;firstName;patronymic;email;studentNumber\r\nІваненко;Іван;Петрович;${emailA};${numberA}\r\n"Коваль; молодша";Олена;;${emailB.toUpperCase()};${numberB}\r\n\r\n`
const firstImport = await call('POST', `/api/groups/${groupId}/students/import`, { token: admin, form: csvForm(validCsv) })
check('05 import valid file', firstImport.status, 200)
check('06 import created count', firstImport.data.created, 2)
const secondImport = await call('POST', `/api/groups/${groupId}/students/import`, { token: admin, form: csvForm(validCsv) })
check('07 re-import skipped count', secondImport.data.skipped.length, 2)
check('08 re-import created count', secondImport.data.created, 0)

const studentsBefore = (await call('GET', '/api/students', { token: admin })).data.length
const badCsv = `lastName,firstName,email,studentNumber\nA,B,not-an-email,N${stamp}1\nC,D,dup.${stamp}@x.local,N${stamp}2\nE,F,dup2.${stamp}@x.local,N${stamp}2\nG,H,teacher@diploma.local,N${stamp}3\nI,J,${emailA},OTHER${stamp}\n`
const badImport = await call('POST', `/api/groups/${groupId}/students/import`, { token: admin, form: csvForm(badCsv) })
check('09 import with row errors', badImport.status, 400)
check('10 row error count', badImport.data.errors.length, 4)
check('11 nothing written on error', (await call('GET', '/api/students', { token: admin })).data.length, studentsBefore)
check('12 import non-UTF-8', (await call('POST', `/api/groups/${groupId}/students/import`, { token: admin, form: csvForm(new Uint8Array([0x6c, 0x61, 0xc0, 0xc1, 0x0a])) })).status, 400)
check('13 import missing column', (await call('POST', `/api/groups/${groupId}/students/import`, { token: admin, form: csvForm('lastName,firstName,email\nA,B,c@d.e\n') })).status, 400)
check('14 import unknown group', (await call('POST', '/api/groups/00000000-0000-0000-0000-000000000001/students/import', { token: admin, form: csvForm(validCsv) })).status, 404)
check('15 import wrong extension', (await call('POST', `/api/groups/${groupId}/students/import`, { token: admin, form: csvForm(validCsv, 'students.txt') })).status, 400)

// Claiming
check('16 unclaimed login refused', (await login(emailA, 'Password1!')).status, 401)
check('17 claim wrong number', (await call('POST', '/api/auth/claim', { json: { email: emailA, studentNumber: 'WRONG', password: 'Password1!' } })).status, 400)
check('18 claim short password', (await call('POST', '/api/auth/claim', { json: { email: emailA, studentNumber: numberA, password: 'short' } })).status, 400)
const claim = await call('POST', '/api/auth/claim', { json: { email: `  ${emailA.toUpperCase()} `, studentNumber: numberA.toLowerCase(), password: 'Password1!' } })
check('19 claim succeeds (normalised input)', claim.status, 200)
check('20 claim returns token', typeof claim.data.token, 'string')
check('21 claim twice refused', (await call('POST', '/api/auth/claim', { json: { email: emailA, studentNumber: numberA, password: 'Password1!' } })).status, 400)
const studentToken = (await login(emailA, 'Password1!')).data.token
check('22 claimed student signs in', typeof studentToken, 'string')

// Change password
check('23 change password wrong current', (await call('PUT', '/api/auth/password', { token: studentToken, json: { currentPassword: 'nope-nope', newPassword: 'Password2!' } })).status, 400)
check('24 change password', (await call('PUT', '/api/auth/password', { token: studentToken, json: { currentPassword: 'Password1!', newPassword: 'Password2!' } })).status, 204)
check('25 sign in with new password', (await login(emailA, 'Password2!')).status, 200)

// Reset access
const importedA = (await call('GET', '/api/students', { token: admin })).data.find((s) => s.email === emailA)
check('26 student is claimed', importedA.isClaimed, true)
check('27 student number stored upper-case', importedA.studentNumber, numberA.toUpperCase())
check('28 reset access', (await call('POST', `/api/students/${importedA.id}/reset-access`, { token: admin })).status, 204)
check('29 reset account cannot sign in', (await login(emailA, 'Password2!')).status, 401)
check('30 reset account claims again', (await call('POST', '/api/auth/claim', { json: { email: emailA, studentNumber: numberA, password: 'Password3!' } })).status, 200)

// Teachers and manual students
check('31 teacher password too short', (await call('PUT', `/api/teachers/${teacherId}/password`, { token: admin, json: { password: 'short' } })).status, 400)
check('32 teacher password set', (await call('PUT', `/api/teachers/${teacherId}/password`, { token: admin, json: { password: 'Teacher456!' } })).status, 204)
check('33 teacher signs in with new password', (await login('teacher@diploma.local', 'Teacher456!')).status, 200)
await call('PUT', `/api/teachers/${teacherId}/password`, { token: admin, json: { password: 'Teacher123!' } })
check('34 manual student duplicate number', (await call('POST', '/api/students', { token: admin, json: { firstName: 'M', lastName: 'N', email: `manual.${stamp}@x.local`, studentNumber: numberB, groupId } })).status, 409)
const manual = await call('POST', '/api/students', { token: admin, json: { firstName: 'M', lastName: 'N', email: `manual.${stamp}@x.local`, studentNumber: `M${stamp}`, groupId } })
check('35 manual student without password', manual.status, 201)
check('36 manual student unclaimed', manual.data.isClaimed, false)
check('37 manual student unknown group', (await call('POST', '/api/students', { token: admin, json: { firstName: 'M', lastName: 'N', email: `manual2.${stamp}@x.local`, studentNumber: `M2${stamp}`, groupId: '00000000-0000-0000-0000-000000000001' } })).status, 400)

// Reopened claim (B8 a-e): reset access lets one account claim while registration is closed,
// without disturbing the registration switch or any other account.
const c1Email = `claim1.${stamp}@student.local`
const c2Email = `claim2.${stamp}@student.local`
const c1Number = `CL${stamp}1`
const c2Number = `CL${stamp}2`

await call('PUT', '/api/registration', { token: admin, json: { open: true } })
const c1 = (await call('POST', '/api/students', { token: admin, json: { firstName: 'C', lastName: 'One', email: c1Email, studentNumber: c1Number, groupId } })).data
const c2 = (await call('POST', '/api/students', { token: admin, json: { firstName: 'C', lastName: 'Two', email: c2Email, studentNumber: c2Number, groupId } })).data

// (a) registration closed, neither student reopened -> claim refused
await call('PUT', '/api/registration', { token: admin, json: { open: false } })
check('38 claim while closed (not reopened) -> 403', (await call('POST', '/api/auth/claim', { json: { email: c1Email, studentNumber: c1Number, password: 'Password1!' } })).status, 403)

// (b) claim student 1 while open; close registration; reset access for student 1
await call('PUT', '/api/registration', { token: admin, json: { open: true } })
check('39 claim student1 while open -> 200', (await call('POST', '/api/auth/claim', { json: { email: c1Email, studentNumber: c1Number, password: 'Password1!' } })).status, 200)
await call('PUT', '/api/registration', { token: admin, json: { open: false } })
check('40 reset access student1 -> 204', (await call('POST', `/api/students/${c1.id}/reset-access`, { token: admin })).status, 204)

const studentsAfterReset = (await call('GET', '/api/students', { token: admin })).data
const c1AfterReset = studentsAfterReset.find((s) => s.email === c1Email)
const c2AfterReset = studentsAfterReset.find((s) => s.email === c2Email)
check('41 student1 unclaimed after reset', c1AfterReset?.isClaimed, false)
check('42 student1 reopened after reset', c1AfterReset?.claimReopened, true)
check('43 student2 not reopened', c2AfterReset?.claimReopened, false)

// (c) registration still closed
const claimStudent2Closed = await call('POST', '/api/auth/claim', { json: { email: c2Email, studentNumber: c2Number, password: 'Password1!' } })
check('44 claim student2 while closed -> 403', claimStudent2Closed.status, 403)
check('45 claim student2 message', claimStudent2Closed.data?.message, 'Registration is closed.')
check('46 claim student1 wrong number while closed -> 403', (await call('POST', '/api/auth/claim', { json: { email: c1Email, studentNumber: 'WRONG', password: 'Password1!' } })).status, 403)
const reclaim = await call('POST', '/api/auth/claim', { json: { email: c1Email, studentNumber: c1Number, password: 'Password2!' } })
check('47 claim student1 correctly while closed -> 200', reclaim.status, 200)
check('48 claim student1 returns token', typeof reclaim.data?.token, 'string')

const studentsAfterReclaim = (await call('GET', '/api/students', { token: admin })).data
const c1AfterReclaim = studentsAfterReclaim.find((s) => s.email === c1Email)
check('49 student1 claimed after reclaim', c1AfterReclaim?.isClaimed, true)
check('50 student1 claimReopened cleared after reclaim', c1AfterReclaim?.claimReopened, false)
check('51 claim student1 again -> 403', (await call('POST', '/api/auth/claim', { json: { email: c1Email, studentNumber: c1Number, password: 'Password3!' } })).status, 403)

// (d) group students endpoint carries studentNumber and isClaimed
const groupStudentsAfterClaim = (await call('GET', `/api/groups/${groupId}/students`, { token: admin })).data
const c1GroupEntry = groupStudentsAfterClaim.find((s) => s.email === c1Email)
check('52 group student studentNumber', c1GroupEntry?.studentNumber, c1Number.toUpperCase())
check('53 group student isClaimed', c1GroupEntry?.isClaimed, true)

// (e) the registration switch is unchanged by the reset: still closed
check('54 registration still closed after reset', (await call('GET', '/api/registration')).data.open, false)

await call('PUT', '/api/registration', { token: admin, json: { open: false } })
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
