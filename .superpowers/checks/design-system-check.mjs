const API = 'http://localhost:5000'
const results = []

function check(name, ok, detail) {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `: ${detail}`}`)
}

async function call(method, path, { token, json, raw } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (json !== undefined || raw !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(API + path, { method, headers, body: raw ?? (json === undefined ? undefined : JSON.stringify(json)) })
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { status: response.status, body }
}

function expectContract(name, response, status, code) {
  const ok = response.status === status
    && response.body && response.body.code === code && typeof response.body.message === 'string'
  check(name, ok, JSON.stringify(response))
}

const badLogin = await call('POST', '/api/auth/login', { json: { email: 'nobody@x.local', password: 'Wrong123!' } })
expectContract('01 invalid credentials', badLogin, 401, 'auth.invalidCredentials')

const admin = (await call('POST', '/api/auth/login', { json: { email: 'admin@diploma.local', password: 'Admin123!' } })).body.token
const student = (await call('POST', '/api/auth/login', { json: { email: 'student@diploma.local', password: 'Student123!' } })).body.token

expectContract('02 unknown faculty (URL)', await call('GET', '/api/faculties/00000000-0000-0000-0000-000000000001', { token: admin }), 404, 'faculty.notFound')
expectContract('03 unknown faculty (body)', await call('POST', '/api/departments', { token: admin, json: { facultyId: '00000000-0000-0000-0000-000000000001', name: 'X', shortName: 'X' } }), 400, 'department.facultyNotFound')

const faculties = (await call('GET', '/api/faculties', { token: admin })).body
expectContract('04 duplicate faculty', await call('POST', '/api/faculties', { token: admin, json: { name: faculties[0].name, shortName: `Z${Date.now() % 10000}` } }), 409, 'faculty.nameTaken')
expectContract('05 faculty with departments', await call('DELETE', `/api/faculties/${faculties[0].id}`, { token: admin }), 409, 'faculty.hasDepartments')

const validation = await call('POST', '/api/faculties', { token: admin, json: { name: '', shortName: '' } })
check('06 validation contract', validation.status === 400 && validation.body.code === 'validation.failed' && Array.isArray(validation.body.fields?.name), JSON.stringify(validation))

expectContract('07 unknown group', await call('GET', '/api/groups/00000000-0000-0000-0000-000000000001', { token: admin }), 404, 'group.notFound')
expectContract('08 unknown task template', await call('GET', '/api/task-templates/00000000-0000-0000-0000-000000000001', { token: admin }), 404, 'taskTemplate.notFound')
expectContract('09 closed registration claim', await call('POST', '/api/auth/claim', { json: { email: 'x@x.local', studentNumber: 'X', password: 'Password1!' } }), 403, 'registration.closed')

const forbidden = await call('GET', '/api/students', { token: student })
check('10 role-forbidden has no body requirement', forbidden.status === 403, JSON.stringify(forbidden))

const malformed = await call('POST', '/api/faculties', { token: admin, raw: '{"name":' })
check('11 malformed JSON uses validation contract', malformed.status === 400 && malformed.body.code === 'validation.failed', JSON.stringify(malformed))

// B4: framework-generated 401/404 responses carry the { code, message } contract
expectContract('12 missing token -> 401 contract', await call('GET', '/api/students'), 401, 'auth.userNotFound')
expectContract('13 unknown route -> 404 contract', await call('GET', '/api/does-not-exist'), 404, 'request.notFound')

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
