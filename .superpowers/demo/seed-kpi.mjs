// Real department data for Diploma Tracker: кафедра ІПЗЕ (ННІАТЕ, КПІ ім. Ігоря Сікорського),
// master's groups ТВ-51мп and ТВ-52мп, 2026/2027. Students, topics, supervisors and directions
// come from the department's practice-defence list (October 2026). E-mails are replaced with
// studentN@test.data / staffN@test.data and student numbers are random, so no personal contact
// data is kept in the repository.
//
// Everything goes through the API as an administrator, so it runs against any deployment:
//
//   node .superpowers/demo/seed-kpi.mjs
//
// Settings come from environment variables; a missing password is asked for without echo.
//   API_URL         default http://localhost:5000; for the server use http://SERVER_IP:4047
//   ADMIN_EMAIL     default admin@diploma.local
//   ADMIN_PASSWORD  the administrator's password
//   STAFF_PASSWORD  the password every staff account gets (8+ characters)
//
// The run is resumable: every object is looked up first and only created when missing, so a run
// that stopped half-way can simply be started again. Students are created without a password;
// they activate their accounts themselves (sign-in page, "Активуйте обліковий запис") with their
// e-mail and student number while registration is open. Each student's topic is assigned by the
// administrator, which counts as the administration's approval; the direction manager's and the
// supervisor's approvals stay pending.

import { createInterface } from 'node:readline'

const API = (process.env.API_URL ?? 'http://localhost:5000').replace(/\/+$/, '')
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@diploma.local'

// ---------- http ----------
async function call(method, path, { token, json } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (json !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(API + path, { method, headers, body: json === undefined ? undefined : JSON.stringify(json) })
  const type = response.headers.get('content-type') ?? ''
  const body = type.includes('json') ? await response.json() : null
  if (response.status >= 400) {
    throw new Error(`${method} ${path} -> ${response.status} ${body?.code ?? ''} ${body?.message ?? ''}`)
  }
  return body
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    rl.stdoutMuted = false
    rl._writeToOutput = (text) => { if (!rl.stdoutMuted) rl.output.write(text) }
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer) })
    rl.stdoutMuted = true
  })
}

// 23:59 Kyiv time on the given day. Summer time (UTC+3) ends on 25.10.2026.
function deadline(day, month) {
  const summer = month < 10 || (month === 10 && day < 25)
  return new Date(Date.UTC(2026, month - 1, day, summer ? 20 : 21, 59)).toISOString()
}

// ---------- the department ----------
const FACULTY = { name: 'Навчально-науковий інститут атомної та теплової енергетики', shortName: 'ННІАТЕ' }
const DEPARTMENT = { name: 'Кафедра інженерії програмного забезпечення в енергетиці', shortName: 'ІПЗЕ' }
const GROUPS = {
  tv51: { code: 'ТВ-51мп', academicYear: '2026/2027', description: 'Магістри, освітньо-професійна програма, 2 курс' },
  tv52: { code: 'ТВ-52мп', academicYear: '2026/2027', description: 'Магістри, освітньо-професійна програма, 2 курс' }
}

// Steps of the master's thesis, with the same deadlines for both groups.
const STEPS = [
  { title: 'Визначення теми дослідження', deadline: deadline(15, 10) },
  { title: 'Формулювання об’єкта, предмета, мети та завдань. Аналіз сучасних підходів і методів', deadline: deadline(22, 10) },
  { title: 'Визначення структури магістерської роботи', deadline: deadline(29, 10) },
  { title: 'Розробка програмного продукту', deadline: deadline(12, 11) },
  { title: 'Тестування програмного продукту', deadline: deadline(19, 11) },
  { title: 'Написання змісту та вступу до магістерської дисертації', deadline: deadline(26, 11) },
  { title: 'Написання реферату до магістерської дисертації та першого розділу з висновками (робоча версія)', deadline: deadline(3, 12) },
  { title: 'Написання титульного аркушу завдання та другого розділу магістерської дисертації з висновками (робоча версія)', deadline: deadline(10, 12) },
  { title: 'Написання третього та четвертого розділів магістерської роботи', deadline: deadline(17, 12) },
  { title: 'Попередній захист', deadline: deadline(21, 12) },
  { title: 'Державний захист магістерської дисертації', deadline: deadline(25, 12) }
]

// Supervisors, numbered in the order they first appear in the list. Every one teaches across the
// department; direction managers also manage directions there.
const STAFF = [
  { key: 'fedorova', lastName: 'Федорова', firstName: 'Наталія', patronymic: 'Володимирівна', manager: true },
  { key: 'saryboha', lastName: 'Сарибога', firstName: 'Ганна', patronymic: 'Володимирівна', manager: true },
  { key: 'varava', lastName: 'Варава', firstName: 'Іван', patronymic: 'Андрійович' },
  { key: 'haharin', lastName: 'Гагарін', firstName: 'Олександр', patronymic: 'Олександрович' },
  { key: 'barabash', lastName: 'Барабаш', firstName: 'Олег', patronymic: 'Володимирович', manager: true },
  { key: 'svynchuk', lastName: 'Свинчук', firstName: 'Ольга', patronymic: 'Василівна' },
  { key: 'shuklin', lastName: 'Шуклін', firstName: 'Герман', patronymic: 'Вікторович' },
  { key: 'nedashkivskyi', lastName: 'Недашківський', firstName: 'Олексій', patronymic: 'Леонідович', manager: true },
  { key: 'bandurka', lastName: 'Бандурка', firstName: 'Олена', patronymic: 'Іванівна' },
  { key: 'husieva', lastName: 'Гусєва', firstName: 'Ірина', patronymic: 'Ігорівна', manager: true },
  { key: 'zalevska', lastName: 'Залевська', firstName: 'Ольга', patronymic: 'Валеріївна', manager: true },
  { key: 'datsiuk', lastName: 'Дацюк', firstName: 'Оксана', patronymic: 'Антонівна' },
  { key: 'koval', lastName: 'Коваль', firstName: 'Олександр', patronymic: 'Васильович', manager: true },
  { key: 'pyrohovska', lastName: 'Пироговська', firstName: 'Тетяна', patronymic: 'Володимирівна' },
  { key: 'yeroshkin', lastName: 'Єрошкін', firstName: 'Юрій', patronymic: 'Миколайович' },
  { key: 'holets', lastName: 'Голець', firstName: 'Владислав', patronymic: 'Олександрович' }
].map((s, i) => ({ ...s, email: `staff${i + 1}@test.data` }))

const DIRECTIONS = [
  { key: 'smart', manager: 'fedorova', name: 'SmartEnergy', description: 'Програмний комплекс лабораторії SmartEnergy Lab: ІоТ і моніторинг, дані та UI, функціональна стійкість, керування даними.' },
  { key: 'ekaf', manager: 'nedashkivskyi', name: 'є-Кафедра', description: 'Інформаційні системи кафедри та засоби дистанційного навчання.' },
  { key: 'puma', manager: 'saryboha', name: 'Puma 560', description: 'Програмне забезпечення для робота-маніпулятора Puma 560.' },
  { key: 'its', manager: 'husieva', name: 'Інтелектуальні транспортні системи', description: null },
  { key: 'vr', manager: 'zalevska', name: 'Віртуальна та доповнена реальність', description: null },
  { key: 'bio', manager: 'zalevska', name: 'Моделювання біотехнологічних медичних процесів', description: null },
  { key: 'knowledge', manager: 'koval', name: 'Представлення знань та управління даними', description: null },
  { key: 'ai', manager: 'barabash', name: 'Штучний інтелект', description: null }
]

// One row per student, in list order: name, group, supervisor, direction (with the SmartEnergy
// sub-area as the topic's description), topic.
const STUDENTS = [
  ['Барабаш', 'Маріна', 'Володимирівна', 'tv51', 'fedorova', 'smart', 'ІоТ, моніторинг', 'Програмне забезпечення ефективного використання енергоресурсів SmartEnergy Lab на базі технології IoT'],
  ['Гончаренко', 'Микита', 'Едуардович', 'tv51', 'fedorova', 'smart', 'ІоТ, моніторинг', 'Програмне забезпечення прогнозування енергоспоживання SmartEnergy Lab на базі методу LightGBM'],
  ['Червоний', 'Андрій', 'Сергійович', 'tv52', 'fedorova', 'smart', 'ІоТ, моніторинг', 'Програмне забезпечення для адаптивного клімат-контролю на базі SmartEnergy Lab'],
  ['Гойчук', 'Олександр', 'Володимирович', 'tv51', 'saryboha', 'smart', 'ІоТ, моніторинг', 'Програмне забезпечення інтелектуальної системи керуванням гібридним інвертором системи Smart Energy'],
  ['Бондаренко', 'Родіон', 'Олексійович', 'tv52', 'saryboha', 'smart', 'Дані та UI', 'Програмне забезпечення єдиної системи керування натурними стендами лабораторії Smart Energy Lab'],
  ['Онопрієнко', 'Дмитро', 'Олегович', 'tv51', 'varava', 'smart', 'Дані та UI', 'Прикладний програмний інтерфейс підсистеми керування реляційними даними програмного комплексу SmartEnergy'],
  ['Риженко', 'Назарій', 'Володимирович', 'tv51', 'varava', 'smart', 'Дані та UI', 'Графічний інтерфейс користувача підсистеми керування сховищем даних програмного комплексу SmartEnergy'],
  ['Шевченко', 'Олександр', 'Володимирович', 'tv52', 'haharin', 'smart', 'Дані та UI', 'Прикладний програмний інтерфейс підсистеми керування документоорієнтованими даними програмного комплексу SmartEnergy'],
  ['Кротенко', 'Ростислав', 'Олександрович', 'tv52', 'barabash', 'smart', 'Функціональна стійкість', 'Методи кіберзахисту для підвищення функціональної стійкості програмного комплексу SmartEnergy'],
  ['Сидоренко', 'Дарʼя', 'Володимирівна', 'tv52', 'svynchuk', 'smart', 'Функціональна стійкість', 'Методи забезпечення функціональної стійкості програмного комплексу SmartEnergy із використанням блокчейн-технологій'],
  ['Медведєв', 'Олег', 'Євгенійович', 'tv51', 'shuklin', 'smart', 'Керування даними', 'Розробка та впровадження криптографічних механізмів захисту телеметричних даних у Smart Energy Lab'],
  ['Стельмах', 'Дмитро', 'Юрійович', 'tv52', 'shuklin', 'smart', 'Керування даними', 'Розробка та впровадження моделі багаторівневого контролю доступу в Smart Energy Lab на основі принципів Zero Trust'],
  ['Шаревич', 'Єгор', 'Михайлович', 'tv52', 'saryboha', 'smart', 'Керування даними', 'Проектування архітектури кіберзахисту Smart Energy Lab у середовищі хмарних та периферійних обчислень'],
  ['Гущін', 'Володимир', 'Сергійович', 'tv51', 'nedashkivskyi', 'ekaf', null, 'Система організації засобів дистанційних навчання для єКафедри'],
  ['Романін', 'Анатолій', 'Олександрович', 'tv52', 'nedashkivskyi', 'ekaf', null, 'Система генерації, верифікації тестів та контролю знань для засобів дистанційного навчання'],
  ['Сейкаускайте', 'Аліна', 'Андріївна', 'tv52', 'bandurka', 'ekaf', null, 'Веб-система адміністрування ботів для комунікації випускників університету'],
  ['Шпота', 'Владислав', 'Володимирович', 'tv52', 'svynchuk', 'puma', null, 'Програмне забезпечення для безпечної взаємодії людини і робота-маніпулятора у спільному робочому просторі'],
  ['Гундяк', 'Валерія', 'Русланівна', 'tv51', 'husieva', 'its', null, 'Програмне забезпечення для розширення наборів GPS-даних на основі генеративних моделей'],
  ['Лусіс', 'Яніс', 'Андрійович', 'tv52', 'husieva', 'its', null, 'Програмне забезпечення для анонімізації транспортних даних з використанням онтологій'],
  ['Войтко', 'Юрій', 'Володимирович', 'tv51', 'bandurka', 'vr', null, 'Система для автоматичної генерації реалістичних виразів обличчя віртуальних персонажів на основі аналізу емоційного контексту діалогу'],
  ['Давиденко', 'Антоніна', 'Вячеславівна', 'tv51', 'zalevska', 'vr', null, 'Розробка програмних інструментів та методів для створення реалістичних 3D-моделей персонажів з детальною мімікою'],
  ['Зимовець', 'Денис', 'Юрійович', 'tv51', 'datsiuk', 'bio', null, 'Створення віртуального тренажеру для відновлення роботи м’язів після отриманої травми'],
  ['Зубов', 'Андрій', 'Олександрович', 'tv51', 'datsiuk', 'bio', null, 'Програмне забезпечення для створення індивідуального ортезу за знімком колінного суглоба пацієнта'],
  ['Піховкіна', 'Катерина', 'Вячеславівна', 'tv51', 'koval', 'knowledge', null, 'Виявлення прихованих зв’язків між критичними інфраструктурами при дослідженні каскадних подій'],
  ['Корнійчик', 'Ілля', 'Юрійович', 'tv52', 'pyrohovska', 'ekaf', null, 'Система автоматизованої перевірки лабораторних робіт на основі підходів CI/CD'],
  ['Рябець', 'Катерина', 'Олександрівна', 'tv52', 'pyrohovska', 'ekaf', null, 'Розробка та впровадження системи менеджменту подій кафедри'],
  ['Черняк', 'Віктор', 'Павлович', 'tv52', 'pyrohovska', 'ekaf', null, 'Система керування та контролю виконання дипломних робіт'],
  ['Кравчук', 'Ілля', 'Володимирович', 'tv52', 'yeroshkin', 'ai', null, 'Розробка та розгортання контейнеризованих розширень для SAP Business Technology Platform із використанням Docker і Cloud Foundry'],
  ['Шарабура', 'Еліна', 'Дмитрівна', 'tv51', 'holets', 'ai', null, 'Програмне забезпечення автоматичного виявлення джерел дезінформації та не автентичної поведінки членами скоординованих груп'],
  ['Андрійчук', 'Антон', 'Юрійович', 'tv52', 'holets', 'ai', null, 'Програмне забезпечення системи аналізу та класифікації даних з камер відеоспостереження'],
  ['Качуров', 'Володимир', 'Андрійович', 'tv52', 'holets', 'ai', null, 'Програмне забезпечення виявлення підробок у медіа даних'],
  ['Кривицький', 'Богдан', 'Петрович', 'tv52', 'holets', 'ai', null, 'Програмне забезпечення виявлення дезінформації у текстових даних методами генеративного штучного інтелекту']
]
// Random student numbers (КВ series), fixed so the test cases can name them.
const NUMBERS = [46012893, 17317906, 78798314, 74942823, 59797752, 64607085, 14570644, 28826799, 31360455, 65429175, 34581772, 56452635, 68997790, 94663989, 10151798, 14589469, 83032616, 61966957, 68779291, 11490238, 41842509, 19310474, 31341064, 32856470, 74673813, 40954174, 93896827, 46824384, 75573449, 76987450, 65834682, 26484655]

const students = STUDENTS.map(([lastName, firstName, patronymic, group, supervisor, direction, area, topic], i) => ({
  lastName, firstName, patronymic, group, supervisor, direction, topic,
  topicDescription: area ? `Піднапрям: ${area}.` : null,
  email: `student${i + 1}@test.data`,
  number: `КВ${NUMBERS[i]}`
}))

// ---------- run ----------
async function findOrCreate(label, existing, create) {
  if (existing) return existing
  const created = await create()
  console.log(`  + ${label}`)
  return created
}

async function main() {
  const adminPassword = process.env.ADMIN_PASSWORD || await askHidden(`Password of ${ADMIN_EMAIL}: `)
  const staffPassword = process.env.STAFF_PASSWORD || await askHidden('Password for every staff account (8+ characters): ')
  const admin = (await call('POST', '/api/auth/login', { json: { email: ADMIN_EMAIL, password: adminPassword } })).token
  console.log(`Signed in to ${API} as ${ADMIN_EMAIL}.`)

  console.log('Faculty, department, steps and groups...')
  const faculty = await findOrCreate(FACULTY.shortName,
    (await call('GET', '/api/faculties', { token: admin })).find((f) => f.shortName === FACULTY.shortName),
    () => call('POST', '/api/faculties', { token: admin, json: FACULTY }))
  const department = await findOrCreate(DEPARTMENT.shortName,
    (await call('GET', `/api/departments?facultyId=${faculty.id}`, { token: admin })).find((d) => d.shortName === DEPARTMENT.shortName),
    () => call('POST', '/api/departments', { token: admin, json: { facultyId: faculty.id, ...DEPARTMENT } }))

  const templates = await call('GET', `/api/task-templates?facultyId=${faculty.id}`, { token: admin })
  const steps = []
  for (const [index, step] of STEPS.entries()) {
    steps.push({ ...step, ...(await findOrCreate(`step ${index + 1}`,
      templates.find((t) => t.title === step.title),
      () => call('POST', '/api/task-templates', { token: admin, json: { facultyId: faculty.id, title: step.title, order: index + 1 } }))) })
  }

  const existingGroups = await call('GET', '/api/groups', { token: admin })
  const groups = {}
  for (const [key, group] of Object.entries(GROUPS)) {
    groups[key] = await findOrCreate(group.code,
      existingGroups.find((g) => g.code === group.code),
      () => call('POST', '/api/groups', { token: admin, json: { departmentId: department.id, ...group } }))
    const assigned = await call('GET', `/api/groups/${groups[key].id}/tasks`, { token: admin })
    const missing = steps.filter((step) => !assigned.some((t) => t.taskTemplateId === step.id))
    if (missing.length > 0) {
      await call('POST', `/api/groups/${groups[key].id}/assign-all-task-templates`, { token: admin, json: { items: missing.map((step) => ({ taskTemplateId: step.id, deadline: step.deadline })) } })
      console.log(`  + ${missing.length} steps for ${group.code}`)
    }
  }

  console.log('Staff and their roles...')
  const existingStaff = await call('GET', '/api/staff', { token: admin })
  const staff = {}
  for (const person of STAFF) {
    const { key, manager, ...account } = person
    let record = existingStaff.find((s) => s.email.toLowerCase() === account.email)
    if (!record) {
      record = await call('POST', '/api/staff', { token: admin, json: { ...account, password: staffPassword } })
      console.log(`  + ${account.lastName} (${account.email})`)
    }
    const roles = manager ? ['Teacher', 'DirectionManager'] : ['Teacher']
    for (const role of roles) {
      if (!(record.assignments ?? []).some((a) => a.role === role && a.scopeId === department.id)) {
        await call('POST', `/api/staff/${record.id}/roles`, { token: admin, json: { role, scopeKind: 'Department', scopeId: department.id } })
      }
    }
    staff[key] = record
  }

  console.log('Directions...')
  const existingDirections = await call('GET', `/api/directions?departmentId=${department.id}`, { token: admin })
  const directions = {}
  for (const d of DIRECTIONS) {
    directions[d.key] = await findOrCreate(d.name,
      existingDirections.find((x) => x.name === d.name),
      () => call('POST', '/api/directions', { token: admin, json: { departmentId: department.id, name: d.name, description: d.description, managerId: staff[d.manager].id } }))
  }

  console.log('Topics...')
  const existingTopics = await call('GET', `/api/topics?departmentId=${department.id}`, { token: admin })
  const topics = {}
  for (const s of students) {
    topics[s.email] = await findOrCreate(s.topic.slice(0, 60),
      existingTopics.find((t) => t.title === s.topic),
      () => call('POST', '/api/topics', { token: admin, json: { title: s.topic, description: s.topicDescription, directionId: directions[s.direction].id, supervisorId: staff[s.supervisor].id } }))
  }

  console.log('Students and their topics...')
  const existingStudents = await call('GET', '/api/students', { token: admin })
  for (const s of students) {
    const record = await findOrCreate(`${s.lastName} (${s.email})`,
      existingStudents.find((x) => x.email.toLowerCase() === s.email),
      () => call('POST', '/api/students', { token: admin, json: { firstName: s.firstName, lastName: s.lastName, patronymic: s.patronymic, email: s.email, studentNumber: s.number, groupId: groups[s.group].id } }))
    const topic = topics[s.email]
    // Only a topic still in the catalogue is assigned; a reserved one already has its request.
    if (topic.status === 'Available' && !topic.studentProfileId && !record.topicId) {
      await call('PUT', `/api/students/${record.id}/topic`, { token: admin, json: { topicId: topic.id } })
      console.log(`  ~ topic assigned to ${s.lastName}`)
    }
    // The supervisor is named on the profile at once, so the student is theirs before approval.
    if (record.supervisorId !== staff[s.supervisor].id) {
      await call('PUT', `/api/students/${record.id}/supervisor`, { token: admin, json: { supervisorId: staff[s.supervisor].id } })
    }
  }

  console.log(`\nDone: ${STAFF.length} staff, ${DIRECTIONS.length} directions, ${students.length} students and topics, ${STEPS.length} steps in ${Object.keys(GROUPS).length} groups.`)
  console.log('Students activate their accounts with their e-mail and student number while registration is open (Settings).')
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
