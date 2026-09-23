// Demonstration data for Diploma Tracker, in Ukrainian. Run it once against a freshly seeded
// database with the API on :5000:   node .superpowers/demo/seed-demo.mjs
//
// It builds its own faculty (ФІОТ) beside the seeded FICS/SE/SEED-A, which it never touches, so
// the check scripts keep working. Everything goes through the API as an administrator, the demo
// teachers and the demo students would do it. Deadlines are relative to the day of the run, so
// "overdue" and "upcoming" stay meaningful whenever it is run. It refuses to run twice.
//
// Every demo account uses the password below; the accounts are listed at the end of the run.

const API = 'http://localhost:5000'
const DEMO_PASSWORD = 'Demo2026!'
const DAY = 24 * 60 * 60 * 1000

// ---------- http ----------
async function call(method, path, { token, json, form } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (json !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(API + path, { method, headers, body: form ?? (json === undefined ? undefined : JSON.stringify(json)) })
  const type = response.headers.get('content-type') ?? ''
  const body = type.includes('json') ? await response.json() : null
  if (response.status >= 400) {
    throw new Error(`${method} ${path} -> ${response.status} ${body?.code ?? ''} ${body?.message ?? ''}`)
  }
  return body
}
const login = async (email, password) => (await call('POST', '/api/auth/login', { json: { email, password } })).token

// A deadline `days` from now, at 23:59 Kyiv time (20:59 UTC in summer, 21:59 in winter; the
// summer value is close enough for a demo).
function deadline(days) {
  const date = new Date(Date.now() + days * DAY)
  date.setUTCHours(20, 59, 0, 0)
  return date.toISOString()
}

// ---------- minimal genuine .docx ----------
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
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt32LE(crc, 16)
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
const escapeXml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
function docx(title, paragraphs) {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
  const heading = `<w:p><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t xml:space="preserve">${escapeXml(title)}</w:t></w:r></w:p>`
  const body = paragraphs.map((p) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(p)}</w:t></w:r></w:p>`).join('')
  return zip([
    { name: '[Content_Types].xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { name: '_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: 'word/document.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${heading}${body}</w:body></w:document>` }
  ])
}

// ---------- the demo world ----------
const STEPS = [
  { title: 'Затвердження теми та плану роботи', description: 'Тема, мета, завдання та календарний план виконання роботи.' },
  { title: 'Аналіз предметної області та огляд літератури', description: 'Огляд аналогів, джерел і постановка задачі.' },
  { title: 'Проєктування системи', description: 'Архітектура, моделі даних, діаграми варіантів використання.' },
  { title: 'Програмна реалізація', description: 'Основні модулі системи та інструкція з розгортання.' },
  { title: 'Тестування та експериментальні дослідження', description: 'План тестування, результати та їх аналіз.' },
  { title: 'Оформлення пояснювальної записки', description: 'Повний текст роботи відповідно до методичних вказівок.' },
  { title: 'Попередній захист', description: 'Доповідь і презентація перед комісією кафедри.' },
  { title: 'Подання остаточної версії', description: 'Остаточна версія записки, відгук керівника та рецензія.' }
]
// Deadlines per group, in days from the run. ІП-22 is behind: its first step is already past.
const SCHEDULE = {
  current: [7, 28, 56, 120, 160, 190, 215, 230],
  behind: [-6, 21, 49, 113, 153, 183, 208, 223],
  graduated: [14, 35, 63, 127, 167, 197, 222, 237]
}

const TEACHERS = {
  petrenko: { firstName: 'Олена', lastName: 'Петренко', patronymic: 'Василівна', email: 'o.petrenko@diploma.local' },
  kovalenko: { firstName: 'Андрій', lastName: 'Коваленко', patronymic: 'Миколайович', email: 'a.kovalenko@diploma.local' },
  shevchuk: { firstName: 'Ірина', lastName: 'Шевчук', patronymic: 'Олегівна', email: 'i.shevchuk@diploma.local' }
}

const TOPICS = [
  { key: 'monitoring', supervisor: 'petrenko', dept: 'ipz', title: 'Вебсистема моніторингу виконання дипломних робіт', description: 'Облік етапів, подання версій і рецензування робіт студентів кафедри з розмежуванням ролей.' },
  { key: 'finance', supervisor: 'petrenko', dept: 'ipz', title: 'Мобільний застосунок для обліку особистих фінансів із прогнозуванням витрат', description: 'Кросплатформний застосунок з аналітикою витрат і прогнозом на основі часових рядів.' },
  { key: 'volunteer', supervisor: 'petrenko', dept: 'ipz', title: 'Платформа для координації волонтерських ініціатив', description: 'Публікація запитів, розподіл завдань між волонтерами та звітність.' },
  { key: 'recommender', supervisor: 'kovalenko', dept: 'ipz', title: 'Рекомендаційна система для підбору навчальних курсів', description: 'Колаборативна фільтрація та контентні ознаки для персоналізованих рекомендацій.' },
  { key: 'apitesting', supervisor: 'kovalenko', dept: 'ipz', title: 'Автоматизоване тестування REST API з генерацією тестових сценаріїв', description: 'Генерація тестів зі специфікації OpenAPI та аналіз покриття.' },
  { key: 'schedule', supervisor: 'kovalenko', dept: 'ipz', title: 'Система автоматизованого складання розкладу занять', description: 'Пошук допустимого розкладу з урахуванням обмежень аудиторій, викладачів і груп.' },
  { key: 'sentiment', supervisor: 'kovalenko', dept: 'ipz', title: 'Аналіз тональності україномовних відгуків методами NLP', description: 'Порівняння класичних моделей і трансформерів на корпусі відгуків.' },
  { key: 'anomaly', supervisor: 'shevchuk', dept: 'ist', title: 'Система виявлення аномалій у мережевому трафіку', description: 'Моделі машинного навчання для виявлення атак у корпоративній мережі.' },
  { key: 'chatbot', supervisor: 'shevchuk', dept: 'ist', title: 'Чат-бот для консультування абітурієнтів', description: 'Відповіді на типові запитання вступної кампанії з інтеграцією в Telegram.' },
  { key: 'dashboard', supervisor: 'shevchuk', dept: 'ist', title: 'Інформаційна панель показників успішності студентів', description: 'Візуалізація та аналіз академічних показників для деканату.' }
]

// topic: catalogue key reserved and approved | 'proposal' (with `proposal`: its title) | 'pending:<key>' |
// 'rejected:<key>' | null. Work on the steps starts only once a topic is approved, so a student
// without one has no `steps`.
// steps: one entry per step worked on, in order - 'approved:<mark>', 'returned', 'submitted'
const STUDENTS = [
  // ІП-21: on schedule, reviewed by Петренко
  { group: 'ip21', lastName: 'Бондаренко', firstName: 'Максим', patronymic: 'Сергійович', email: 'm.bondarenko', number: 'ІП21-001', topic: 'monitoring', steps: ['approved:95', 'submitted'] },
  { group: 'ip21', lastName: 'Ткаченко', firstName: 'Анна', patronymic: 'Ігорівна', email: 'a.tkachenko', number: 'ІП21-002', topic: 'proposal', proposal: 'Інтерактивний тренажер для вивчення алгоритмів сортування', steps: ['approved:88'] },
  { group: 'ip21', lastName: 'Мельник', firstName: 'Дмитро', patronymic: 'Олександрович', email: 'd.melnyk', number: 'ІП21-003', topic: 'schedule', steps: ['returned', 'submitted'] },
  { group: 'ip21', lastName: 'Кравченко', firstName: 'Софія', patronymic: 'Андріївна', email: 's.kravchenko', number: 'ІП21-004', topic: 'rejected:recommender', steps: [] },
  { group: 'ip21', lastName: 'Олійник', firstName: 'Владислав', patronymic: 'Петрович', email: 'v.oliinyk', number: 'ІП21-005', topic: 'pending:finance', steps: [] },
  { group: 'ip21', lastName: 'Лисенко', firstName: 'Катерина', patronymic: 'Володимирівна', email: 'k.lysenko', number: 'ІП21-006', topic: 'apitesting', steps: ['approved:100', 'approved:92', 'submitted'] },
  // ІП-22: behind - the first deadline has passed, reviewed by Коваленко
  { group: 'ip22', lastName: 'Савченко', firstName: 'Артем', patronymic: 'Юрійович', email: 'a.savchenko', number: 'ІП22-001', topic: 'sentiment', steps: ['approved:75'] },
  { group: 'ip22', lastName: 'Руденко', firstName: 'Юлія', patronymic: 'Миколаївна', email: 'y.rudenko', number: 'ІП22-002', topic: null, steps: [] },
  { group: 'ip22', lastName: 'Мороз', firstName: 'Олександр', patronymic: 'Вікторович', email: 'o.moroz', number: 'ІП22-003', topic: 'volunteer', steps: ['submitted'] },
  { group: 'ip22', lastName: 'Павленко', firstName: 'Дарина', patronymic: 'Сергіївна', email: 'd.pavlenko', number: 'ІП22-004', topic: null, steps: [] },
  // ІС-21: reviewed by Шевчук
  { group: 'is21', lastName: 'Гончаренко', firstName: 'Богдан', patronymic: 'Ігорович', email: 'b.honcharenko', number: 'ІС21-001', topic: 'anomaly', steps: ['approved:90'] },
  { group: 'is21', lastName: 'Литвиненко', firstName: 'Вікторія', patronymic: 'Олегівна', email: 'v.lytvynenko', number: 'ІС21-002', topic: 'chatbot', steps: ['submitted'] },
  { group: 'is21', lastName: 'Захарченко', firstName: 'Ілля', patronymic: 'Романович', email: 'i.zakharchenko', number: 'ІС21-003', topic: null, steps: [] },
  // ІП-11: last year's group - completes its work, is archived and deleted, and fills the archive
  { group: 'ip11', lastName: 'Кузьменко', firstName: 'Тарас', patronymic: 'Андрійович', email: 't.kuzmenko', number: 'ІП11-001', topic: 'proposal', proposal: 'Система електронного документообігу кафедри', steps: ['approved:91', 'approved:87', 'approved:94'] },
  { group: 'ip11', lastName: 'Поліщук', firstName: 'Марія', patronymic: 'Олександрівна', email: 'm.polishchuk', number: 'ІП11-002', topic: 'proposal', proposal: 'Вебзастосунок для бронювання навчальних аудиторій', steps: ['approved:98', 'returned', 'approved:89'] }
]

// What a student writes for each step, so the documents read like real drafts.
const STEP_TEXT = [
  (s) => [`Тема: ${s.topicTitle ?? 'уточнюється'}.`, 'Мета роботи — розробити програмну систему, що автоматизує описані процеси та зменшує час на рутинні операції.', 'Завдання: проаналізувати предметну область, спроєктувати архітектуру, реалізувати та протестувати систему.', 'Календарний план: аналіз — жовтень, проєктування — листопад, реалізація — грудень–лютий, тестування — березень.'],
  (s) => ['Розглянуто основні аналоги, їхні переваги та недоліки.', 'Визначено функціональні та нефункціональні вимоги до системи.', `Опрацьовано ${12 + s.index} джерел, з них 5 англомовних.`],
  () => ['Обрано клієнт-серверну архітектуру з REST API.', 'Побудовано модель даних і діаграму варіантів використання.', 'Описано ролі користувачів і сценарії їхньої роботи.'],
  () => ['Реалізовано основні модулі системи.', 'Налаштовано автоматичне розгортання та резервне копіювання.'],
  () => ['Складено план тестування.', 'Проведено модульне та інтеграційне тестування, результати наведено в таблицях.']
]
const RETURN_COMMENTS = [
  'Уточніть мету та завдання роботи, додайте календарний план із датами.',
  'Огляд аналогів занадто короткий: додайте порівняльну таблицю та посилання на джерела.'
]
const APPROVE_COMMENTS = ['Добре структуровано, можна переходити до наступного етапу.', 'Зауважень немає.', 'Гарна робота.']

async function main() {
  const admin = await login('admin@diploma.local', 'Admin123!')

  const faculties = await call('GET', '/api/faculties', { token: admin })
  if (faculties.some((f) => f.shortName === 'ФІОТ')) {
    console.log('Demo data is already present (faculty ФІОТ exists). Nothing done.')
    return
  }

  console.log('Structure...')
  const faculty = await call('POST', '/api/faculties', { token: admin, json: { name: 'Факультет інформатики та обчислювальної техніки', shortName: 'ФІОТ' } })
  const departments = {
    ipz: await call('POST', '/api/departments', { token: admin, json: { facultyId: faculty.id, name: 'Кафедра інженерії програмного забезпечення', shortName: 'ІПЗ' } }),
    ist: await call('POST', '/api/departments', { token: admin, json: { facultyId: faculty.id, name: 'Кафедра інформаційних систем та технологій', shortName: 'ІСТ' } })
  }
  const steps = []
  for (const [index, step] of STEPS.entries()) {
    steps.push(await call('POST', '/api/task-templates', { token: admin, json: { facultyId: faculty.id, title: step.title, description: step.description, order: index + 1 } }))
  }

  const groups = {
    ip21: await call('POST', '/api/groups', { token: admin, json: { departmentId: departments.ipz.id, code: 'ІП-21', academicYear: '2026/2027', description: 'Бакалаври, спеціальність 121 «Інженерія програмного забезпечення»' } }),
    ip22: await call('POST', '/api/groups', { token: admin, json: { departmentId: departments.ipz.id, code: 'ІП-22', academicYear: '2026/2027', description: 'Бакалаври, спеціальність 121 «Інженерія програмного забезпечення»' } }),
    is21: await call('POST', '/api/groups', { token: admin, json: { departmentId: departments.ist.id, code: 'ІС-21', academicYear: '2026/2027', description: 'Бакалаври, спеціальність 126 «Інформаційні системи та технології»' } }),
    ip11: await call('POST', '/api/groups', { token: admin, json: { departmentId: departments.ipz.id, code: 'ІП-11', academicYear: '2025/2026', description: 'Випуск 2026 року' } })
  }
  const schedules = { ip21: SCHEDULE.current, ip22: SCHEDULE.behind, is21: SCHEDULE.current, ip11: SCHEDULE.graduated }
  for (const [key, group] of Object.entries(groups)) {
    await call('POST', `/api/groups/${group.id}/assign-all-task-templates`, { token: admin, json: { items: steps.map((step, i) => ({ taskTemplateId: step.id, deadline: deadline(schedules[key][i]) })) } })
  }

  console.log('Teachers...')
  const teachers = {}
  for (const [key, t] of Object.entries(TEACHERS)) {
    const created = await call('POST', '/api/teachers', { token: admin, json: { ...t, password: DEMO_PASSWORD } })
    teachers[key] = { ...t, id: created.id, token: await login(t.email, DEMO_PASSWORD) }
  }
  const reviewers = { ip21: 'petrenko', ip22: 'kovalenko', is21: 'shevchuk', ip11: 'petrenko' }
  for (const [key, teacher] of Object.entries(reviewers)) {
    await call('POST', `/api/groups/${groups[key].id}/reviewers`, { token: admin, json: { reviewerId: teachers[teacher].id } })
  }

  console.log('Topic selection...')
  await call('PUT', '/api/settings/topic-selection', { token: admin, json: { deadline: deadline(21) } })
  const topics = {}
  for (const topic of TOPICS) {
    topics[topic.key] = { ...topic, ...(await call('POST', '/api/topics', { token: teachers[topic.supervisor].token, json: { title: topic.title, description: topic.description, departmentId: departments[topic.dept].id } })) }
  }

  console.log('Students...')
  const students = []
  for (const [index, s] of STUDENTS.entries()) {
    const email = `${s.email}@student.diploma.local`
    const created = await call('POST', '/api/students', { token: admin, json: { firstName: s.firstName, lastName: s.lastName, patronymic: s.patronymic, email, studentNumber: s.number, password: DEMO_PASSWORD, groupId: groups[s.group].id } })
    students.push({ ...s, index, email, id: created.id, token: await login(email, DEMO_PASSWORD) })
  }

  for (const s of students) {
    if (!s.topic) continue
    const [kind, key] = s.topic.includes(':') ? s.topic.split(':') : ['approved', s.topic]
    if (kind === 'approved' && key === 'proposal') continue
    const topic = topics[key]
    const supervisor = teachers[topic.supervisor]
    const reservation = await call('POST', `/api/topics/${topic.id}/reserve`, { token: s.token })
    if (kind === 'approved') {
      await call('POST', `/api/reservations/${reservation.id}/approve`, { token: supervisor.token, json: { comment: 'Тему затверджено. Успіхів у роботі!' } })
      s.topicTitle = topic.title
    } else if (kind === 'rejected') {
      // Deliberately without a comment: the student's topic page shows the rejection anyway.
      await call('POST', `/api/reservations/${reservation.id}/reject`, { token: supervisor.token, json: {} })
    } else {
      s.topicTitle = topic.title
    }
  }
  for (const proposer of students.filter((s) => s.topic === 'proposal')) {
    const proposal = await call('POST', '/api/topics/proposals', { token: proposer.token, json: { title: proposer.proposal, description: 'Тему запропоновано студентом і погоджено з керівником.', supervisorId: teachers.petrenko.id } })
    await call('POST', `/api/reservations/${proposal.id}/approve`, { token: teachers.petrenko.token, json: {} })
    proposer.topicTitle = proposer.proposal
  }

  console.log('Submissions and reviews...')
  for (const s of students) {
    if (s.steps.length === 0) continue
    const reviewer = teachers[reviewers[s.group]]
    const tasks = (await call('GET', '/api/student-tasks/mine', { token: s.token })).sort((a, b) => a.order - b.order)
    for (const [i, outcome] of s.steps.entries()) {
      const task = tasks[i]
      const paragraphs = STEP_TEXT[Math.min(i, STEP_TEXT.length - 1)](s)
      const fileName = `${s.lastName}_${STEPS[i].title.split(' ')[0].toLowerCase()}.docx`
      const submit = async (version, note) => {
        const form = new FormData()
        form.append('mainFile', new Blob([docx(`${STEPS[i].title} — ${s.lastName} ${s.firstName}`, version > 1 ? [...paragraphs, 'Зауваження керівника враховано.'] : paragraphs)]), fileName)
        if (note) form.append('message', note)
        await call('POST', `/api/student-tasks/${task.id}/submissions`, { token: s.token, form })
      }
      const pendingSubmissionId = async () => {
        const queue = await call('GET', `/api/review/queue?groupId=${groups[s.group].id}&pageSize=100`, { token: reviewer.token })
        return queue.items.find((item) => item.studentTaskId === task.id).submissionId
      }

      await submit(1, i === 0 ? 'Надсилаю тему та план роботи.' : undefined)
      if (outcome === 'submitted') continue
      if (outcome === 'returned') {
        await call('POST', `/api/submissions/${await pendingSubmissionId()}/return`, { token: reviewer.token, json: { comment: RETURN_COMMENTS[i % RETURN_COMMENTS.length] } })
        // A returned step is sent again. The last step of a student's list stays awaiting review.
        await submit(2, 'Виправлену версію надіслано.')
        if (i === s.steps.length - 1) continue
        await call('POST', `/api/submissions/${await pendingSubmissionId()}/approve`, { token: reviewer.token, json: { mark: 85, comment: 'Зауваження враховано.' } })
        continue
      }
      const mark = Number(outcome.split(':')[1])
      await call('POST', `/api/submissions/${await pendingSubmissionId()}/approve`, { token: reviewer.token, json: { mark, comment: APPROVE_COMMENTS[(s.index + i) % APPROVE_COMMENTS.length] } })
    }
  }

  console.log('Last year\'s group goes to the archive...')
  await call('POST', `/api/groups/${groups.ip11.id}/students/archive`, { token: admin })
  await call('DELETE', `/api/groups/${groups.ip11.id}`, { token: admin })

  console.log('\nDone. Demo accounts (password for all: ' + DEMO_PASSWORD + '):')
  console.log('  Administrator: admin@diploma.local (the seeded account, its own password)')
  for (const t of Object.values(teachers)) console.log(`  Викладач   ${t.lastName} ${t.firstName} ${t.patronymic}: ${t.email}`)
  for (const s of students.filter((x) => x.group !== 'ip11')) console.log(`  Студент ${groups[s.group].code}  ${s.lastName} ${s.firstName}: ${s.email}`)
}

main().catch((error) => {
  console.error(`\nDemo seeding stopped: ${error.message}`)
  process.exit(1)
})
