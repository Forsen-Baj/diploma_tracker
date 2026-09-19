// Extra regression check for the fix-wave-backend fixes not covered by onboarding-check.mjs:
// 1. A stray/unterminated quote in a CSV import is rejected with a single 400 file-level error.
// 2. PUT /api/registration with an empty body ({}) is rejected with 400.
const API = 'http://localhost:5000'
const results = []

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  results.push({ name, ok, actual, expected })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`)
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
  return { status: response.status, data, headers: response.headers }
}

function csvForm(content, name = 'students.csv') {
  const form = new FormData()
  const blob = new Blob([content], { type: 'text/csv' })
  form.append('file', blob, name)
  return form
}

async function loginAdmin() {
  const res = await call('POST', '/api/auth/login', { json: { email: 'admin@diploma.local', password: 'Admin123!' } })
  if (res.status !== 200) {
    throw new Error(`unexpected admin login status ${res.status}`)
  }
  return res.data.token
}

const admin = await loginAdmin()
const groups = (await call('GET', '/api/groups', { token: admin })).data
const groupId = groups.find((g) => g.code === 'SEED-A').id

// 1a. Stray quote mid-file (matches the review's R1 example).
const strayQuoteCsv =
  'lastName;firstName;email;studentNumber\r\n' +
  'O"Brien;Ivan;ivan.stray@x.local;NSTRAY1\r\n' +
  'Petrenko;Petro;petro.stray@x.local;NSTRAY2\r\n' +
  'D"Arcy;Olena;olena.stray@x.local;NSTRAY3\r\n' +
  'Koval;Oksana;oksana.stray@x.local;NSTRAY4\r\n'
const strayResult = await call('POST', `/api/groups/${groupId}/students/import`, { token: admin, form: csvForm(strayQuoteCsv) })
check('stray-quote CSV rejected: status', strayResult.status, 400)
// The API reports a malformed quote as a row-level error (StudentImportService.cs:68 ->
// ImportRowError.Create), not a file-level one: code import.rowErrors with one row error naming
// the line the quote opened on. The owner decided the API is right and this expectation was stale.
check('stray-quote CSV rejected: code (row-level, not file-level)', strayResult.data?.code, 'import.rowErrors')
check('stray-quote CSV rejected: row error names the line the quote opened on', strayResult.data?.errors, [
  { line: 2, code: 'import.row.malformedQuote', message: 'The file has a misplaced or unclosed quote.', params: null }
])

const studentsAfterStray = (await call('GET', '/api/students', { token: admin })).data
check('stray-quote CSV rejected: no Ivan created', studentsAfterStray.some((s) => s.email === 'ivan.stray@x.local'), false)
check('stray-quote CSV rejected: no Petro created', studentsAfterStray.some((s) => s.email === 'petro.stray@x.local'), false)

// 1b. Unterminated quote at end of file.
const unterminatedCsv =
  'lastName;firstName;email;studentNumber\r\n' +
  '"Ivanenko;Ivan;ivan.unterm@x.local;NUNTERM1\r\n'
const untermResult = await call('POST', `/api/groups/${groupId}/students/import`, { token: admin, form: csvForm(unterminatedCsv) })
check('unterminated-quote CSV rejected: status', untermResult.status, 400)
check('unterminated-quote CSV rejected: row-level error names the line the quote opened on', { code: untermResult.data?.code, errors: untermResult.data?.errors }, {
  code: 'import.rowErrors',
  errors: [{ line: 2, code: 'import.row.malformedQuote', message: 'The file has a misplaced or unclosed quote.', params: null }]
})

// 1c. Quoted line breaks and doubled quotes still work (regression guard for the tokenizer rewrite).
const stamp = Date.now().toString().slice(-6)
const stillWorksCsv =
  'lastName;firstName;email;studentNumber\r\n' +
  `"Коваль\r\nмолодша";Олена;olena.quoted.${stamp}@x.local;NQ${stamp}1\r\n` +
  `"O""Brien";Ivan;ivan.quoted.${stamp}@x.local;NQ${stamp}2\r\n`
const stillWorksResult = await call('POST', `/api/groups/${groupId}/students/import`, { token: admin, form: csvForm(stillWorksCsv) })
check('quoted line break + doubled quote still import: status', stillWorksResult.status, 200)
check('quoted line break + doubled quote still import: created', stillWorksResult.data?.created, 2)

// 2. PUT /api/registration with {} -> 400.
const emptyPut = await call('PUT', '/api/registration', { token: admin, json: {} })
check('PUT /api/registration with {} -> 400', emptyPut.status, 400)

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
