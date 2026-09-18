import { Pencil, Plus, RotateCcw, Upload } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/apiClient'
import { getGroups } from '../api/groupsApi'
import { getRegistrationStatus, setRegistrationStatus } from '../api/registrationApi'
import { archiveStudents, createStudent, getStudents, importStudents, resetStudentAccess, restoreStudents, updateStudent } from '../api/studentsApi'
import { getTeachers } from '../api/teachersApi'
import { useCodeMessage, useErrorMessage } from '../api/useErrorMessage'
import { PASSWORD_MAX, isPasswordLengthValid } from '../auth/passwordPolicy'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Checkbox } from '../components/ui/Checkbox'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { FileInput } from '../components/ui/FileInput'
import { Modal } from '../components/ui/Modal'
import { PageHeader } from '../components/ui/PageHeader'
import { Select, type SelectOption } from '../components/ui/Select'
import { SegmentedControl, type SegmentedOption } from '../components/ui/SegmentedControl'
import { Switch } from '../components/ui/Switch'
import { TextField } from '../components/ui/TextField'
import { useToast } from '../components/ui/useToast'
import { optional } from '../utils/optional'
import type { Group, ImportRowError, Student, StudentImportResult, Teacher } from '../api/types'

type StudentFormState = {
  firstName: string
  lastName: string
  patronymic: string
  email: string
  studentNumber: string
  password: string
  diplomaTopic: string
  groupId: string
  supervisorId: string
}

const emptyForm: StudentFormState = {
  firstName: '',
  lastName: '',
  patronymic: '',
  email: '',
  studentNumber: '',
  password: '',
  diplomaTopic: '',
  groupId: '',
  supervisorId: ''
}

const CSV_TEMPLATE = '\uFEFFlastName;firstName;patronymic;email;studentNumber\r\n'
const IMPORT_FILE_MAX_BYTES = 1_048_576

type StudentView = 'current' | 'archived'

function readRowErrors(error: unknown): ImportRowError[] {
  if (!(error instanceof ApiError)) {
    return []
  }

  const payload = error.payload as { errors?: unknown } | null
  return Array.isArray(payload?.errors) ? payload.errors as ImportRowError[] : []
}

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'students-template.csv'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function StudentsPage() {
  const { t, i18n } = useTranslation()
  const errorMessage = useErrorMessage()
  const codeMessage = useCodeMessage()
  const toast = useToast()

  const [students, setStudents] = useState<Student[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [view, setView] = useState<StudentView>('current')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const [registrationOpen, setRegistrationOpen] = useState(false)
  const [isTogglingRegistration, setIsTogglingRegistration] = useState(false)

  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [importGroupId, setImportGroupId] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importInputKey, setImportInputKey] = useState(0)
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<StudentImportResult | null>(null)
  const [importRowErrors, setImportRowErrors] = useState<ImportRowError[]>([])

  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false)
  const [editingStudent, setEditingStudent] = useState<Student | null>(null)
  const [studentForm, setStudentForm] = useState<StudentFormState>(emptyForm)
  const [groupError, setGroupError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [isSavingStudent, setIsSavingStudent] = useState(false)

  const [resettingStudent, setResettingStudent] = useState<Student | null>(null)
  const [isResettingAccess, setIsResettingAccess] = useState(false)

  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false)
  const [isArchiving, setIsArchiving] = useState(false)
  const [isRestoreConfirmOpen, setIsRestoreConfirmOpen] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'uk-UA', { dateStyle: 'medium' }),
    [i18n.language]
  )

  const sortedStudents = useMemo(
    () => [...students].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)),
    [students]
  )
  const activeTeachers = useMemo(() => teachers.filter((teacher) => teacher.isActive), [teachers])
  const supervisorOptions: SelectOption[] = useMemo(
    () => [
      { value: '', label: t('students.noSupervisor') },
      ...activeTeachers.map((teacher) => ({ value: teacher.id, label: `${teacher.lastName} ${teacher.firstName}` }))
    ],
    [activeTeachers, t]
  )
  const editSupervisorOptions: SelectOption[] = useMemo(() => {
    if (!editingStudent?.supervisorId || activeTeachers.some((teacher) => teacher.id === editingStudent.supervisorId)) {
      return supervisorOptions
    }

    const name = `${editingStudent.supervisorLastName ?? ''} ${editingStudent.supervisorFirstName ?? ''}`.trim()
    return [
      ...supervisorOptions,
      { value: editingStudent.supervisorId, label: t('students.inactiveSupervisor', { name }) }
    ]
  }, [editingStudent, activeTeachers, supervisorOptions, t])

  const groupOptions: SelectOption[] = useMemo(
    () => groups.map((group) => ({ value: group.id, label: `${group.code} (${group.academicYear})` })),
    [groups]
  )

  const viewOptions: SegmentedOption[] = [
    { value: 'current', label: t('students.viewCurrent') },
    { value: 'archived', label: t('students.viewArchived') }
  ]

  const allSelected = sortedStudents.length > 0 && sortedStudents.every((student) => selectedIds.has(student.id))

  const loadData = async (nextView: StudentView = view) => {
    setIsLoading(true)
    setLoadError('')
    setSelectedIds(new Set())
    try {
      const [studentsData, teachersData, groupsData, registration] = await Promise.all([
        getStudents(nextView === 'archived'),
        getTeachers(),
        getGroups(),
        getRegistrationStatus()
      ])
      setStudents(studentsData)
      setTeachers(teachersData)
      setGroups(groupsData)
      setRegistrationOpen(registration.open)
    } catch (err) {
      setLoadError(errorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadData(view)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  const toggleRegistration = async () => {
    const nextValue = !registrationOpen
    setIsTogglingRegistration(true)
    try {
      await setRegistrationStatus(nextValue)
      setRegistrationOpen(nextValue)
      toast.success(t(nextValue ? 'students.registrationOpened' : 'students.registrationClosed'))
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsTogglingRegistration(false)
    }
  }

  const openImportModal = () => {
    setImportGroupId('')
    setImportFile(null)
    setImportInputKey((key) => key + 1)
    setImportResult(null)
    setImportRowErrors([])
    setIsImportModalOpen(true)
  }

  const closeImportModal = () => {
    if (isImporting) return
    setIsImportModalOpen(false)
  }

  const handleImport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!importGroupId || !importFile) {
      return
    }

    setImportResult(null)
    setImportRowErrors([])

    if (importFile.size > IMPORT_FILE_MAX_BYTES) {
      toast.error(t('errors.import.tooLarge'))
      return
    }

    setIsImporting(true)
    try {
      const result = await importStudents(importGroupId, importFile)
      setImportResult(result)
      setImportFile(null)
      setImportInputKey((key) => key + 1)
      toast.success(t('common.savedToast'))
      await loadData()
    } catch (err) {
      if (err instanceof ApiError && err.status === 413) {
        toast.error(t('errors.import.tooLarge'))
      } else {
        toast.error(errorMessage(err))
      }
      setImportRowErrors(readRowErrors(err))
    } finally {
      setIsImporting(false)
    }
  }

  const toRequest = (form: StudentFormState) => ({
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    patronymic: optional(form.patronymic),
    email: form.email.trim(),
    studentNumber: form.studentNumber.trim(),
    diplomaTopic: optional(form.diplomaTopic),
    groupId: form.groupId,
    supervisorId: optional(form.supervisorId)
  })

  const openCreateStudent = () => {
    setEditingStudent(null)
    setStudentForm(emptyForm)
    setGroupError('')
    setPasswordError('')
    setIsStudentModalOpen(true)
  }

  const openEditStudent = (student: Student) => {
    setEditingStudent(student)
    setStudentForm({
      firstName: student.firstName,
      lastName: student.lastName,
      patronymic: student.patronymic ?? '',
      email: student.email,
      studentNumber: student.studentNumber,
      password: '',
      diplomaTopic: student.diplomaTopic ?? '',
      groupId: student.groupId ?? '',
      supervisorId: student.supervisorId ?? ''
    })
    setGroupError('')
    setPasswordError('')
    setIsStudentModalOpen(true)
  }

  const closeStudentModal = () => {
    if (isSavingStudent) return
    setIsStudentModalOpen(false)
  }

  const submitStudent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const groupMissing = !studentForm.groupId
    const passwordInvalid = !editingStudent && studentForm.password.length > 0 && !isPasswordLengthValid(studentForm.password)
    setGroupError(groupMissing ? t('validation.required') : '')
    setPasswordError(passwordInvalid ? t('validation.passwordLength') : '')

    if (groupMissing || passwordInvalid) {
      return
    }

    setIsSavingStudent(true)
    try {
      if (editingStudent) {
        await updateStudent(editingStudent.id, toRequest(studentForm))
      } else {
        await createStudent({
          ...toRequest(studentForm),
          password: studentForm.password.length === 0 ? undefined : studentForm.password
        })
      }
      setIsStudentModalOpen(false)
      toast.success(t('common.savedToast'))
      await loadData()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsSavingStudent(false)
    }
  }

  const confirmResetAccess = async () => {
    if (!resettingStudent) return

    setIsResettingAccess(true)
    try {
      await resetStudentAccess(resettingStudent.id)
      setResettingStudent(null)
      toast.success(t('common.savedToast'))
      await loadData()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsResettingAccess(false)
    }
  }

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(sortedStudents.map((student) => student.id)) : new Set())
  }

  const toggleSelected = (studentId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(studentId)
      } else {
        next.delete(studentId)
      }
      return next
    })
  }

  const confirmArchiveSelected = async () => {
    setIsArchiving(true)
    try {
      const result = await archiveStudents([...selectedIds])
      setIsArchiveConfirmOpen(false)
      toast.success(t('students.archivedToast', { count: result.archived }))
      await loadData()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsArchiving(false)
    }
  }

  const confirmRestoreSelected = async () => {
    setIsRestoring(true)
    try {
      const result = await restoreStudents([...selectedIds])
      setIsRestoreConfirmOpen(false)
      toast.success(t('students.restoredToast', { count: result.restored }))
      await loadData()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsRestoring(false)
    }
  }

  const currentColumns: DataTableColumn<Student>[] = [
    {
      key: 'select',
      header: (
        <Checkbox
          label=""
          ariaLabel={t('students.selectAll')}
          checked={allSelected}
          indeterminate={selectedIds.size > 0 && !allSelected}
          onChange={toggleSelectAll}
        />
      ),
      render: (student) => (
        <Checkbox
          label=""
          ariaLabel={t('students.selectRow', { name: `${student.firstName} ${student.lastName}` })}
          checked={selectedIds.has(student.id)}
          onChange={(checked) => toggleSelected(student.id, checked)}
        />
      )
    },
    {
      key: 'name',
      header: t('students.lastName'),
      render: (student) => `${student.lastName} ${student.firstName}${student.patronymic ? ` ${student.patronymic}` : ''}`
    },
    { key: 'email', header: t('students.email'), render: (student) => student.email },
    { key: 'studentNumber', header: t('students.studentNumber'), render: (student) => student.studentNumber },
    {
      key: 'group',
      header: t('students.group'),
      render: (student) => (student.groupCode ? student.groupCode : t('common.notAssigned'))
    },
    {
      key: 'claimed',
      header: t('common.status'),
      render: (student) => (
        <div className="flex items-center gap-1.5">
          <Badge tone={student.isClaimed ? 'success' : 'warning'}>{student.isClaimed ? t('students.claimed') : t('students.notClaimed')}</Badge>
          {!student.isClaimed && student.claimReopened && <Badge tone="info">{t('students.reopened')}</Badge>}
        </div>
      )
    },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (student) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" icon={Pencil} aria-label={t('common.edit')} onClick={() => openEditStudent(student)} />
          <Button
            variant="ghost"
            size="sm"
            icon={RotateCcw}
            aria-label={t('students.resetAccess')}
            onClick={() => setResettingStudent(student)}
            disabled={!student.isClaimed}
          />
        </div>
      )
    }
  ]

  const archivedColumns: DataTableColumn<Student>[] = [
    {
      key: 'select',
      header: (
        <Checkbox
          label=""
          ariaLabel={t('students.selectAll')}
          checked={allSelected}
          indeterminate={selectedIds.size > 0 && !allSelected}
          onChange={toggleSelectAll}
        />
      ),
      render: (student) => (
        <Checkbox
          label=""
          ariaLabel={t('students.selectRow', { name: `${student.firstName} ${student.lastName}` })}
          checked={selectedIds.has(student.id)}
          onChange={(checked) => toggleSelected(student.id, checked)}
        />
      )
    },
    {
      key: 'name',
      header: t('students.lastName'),
      render: (student) => `${student.lastName} ${student.firstName}${student.patronymic ? ` ${student.patronymic}` : ''}`
    },
    { key: 'email', header: t('students.email'), render: (student) => student.email },
    { key: 'studentNumber', header: t('students.studentNumber'), render: (student) => student.studentNumber },
    {
      key: 'group',
      header: t('students.group'),
      render: (student) => (student.groupCode ? student.groupCode : t('common.notAssigned'))
    },
    {
      key: 'archivedAt',
      header: t('students.archivedAt'),
      render: (student) => (student.archivedAt ? dateFormat.format(new Date(student.archivedAt)) : '—')
    }
  ]

  return (
    <>
      <PageHeader
        title={t('students.title')}
        actions={
          <>
            <Button variant="secondary" icon={Upload} onClick={openImportModal}>{t('students.importTitle')}</Button>
            <Button icon={Plus} onClick={openCreateStudent}>{t('students.addStudent')}</Button>
          </>
        }
      />

      <Card className="mb-6">
        <Switch label={t('students.registrationOpen')} checked={registrationOpen} onChange={() => void toggleRegistration()} disabled={isTogglingRegistration || isLoading} />
        <p className="mt-1.5 text-xs text-text-muted">{t('students.registrationHint')}</p>
      </Card>

      <Card>
        <div className="mb-4 flex items-center justify-between gap-4">
          <SegmentedControl ariaLabel={t('students.viewSwitch')} value={view} onChange={(value) => setView(value as StudentView)} options={viewOptions} />
          {view === 'current' && selectedIds.size > 0 && (
            <Button variant="secondary" onClick={() => setIsArchiveConfirmOpen(true)}>
              {t('students.archiveSelected', { count: selectedIds.size })}
            </Button>
          )}
          {view === 'archived' && selectedIds.size > 0 && (
            <Button variant="secondary" onClick={() => setIsRestoreConfirmOpen(true)}>
              {t('students.restoreSelected', { count: selectedIds.size })}
            </Button>
          )}
        </div>
        {loadError && <p className="text-sm text-danger">{loadError}</p>}
        {!loadError && (
          <DataTable
            columns={view === 'current' ? currentColumns : archivedColumns}
            rows={sortedStudents}
            getRowKey={(student) => student.id}
            loading={isLoading}
            emptyState={<EmptyState message={view === 'current' ? t('students.noStudents') : t('students.noArchivedStudents')} />}
          />
        )}
      </Card>

      <Modal
        open={isImportModalOpen}
        onClose={closeImportModal}
        title={t('students.importTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={downloadTemplate}>{t('students.downloadTemplate')}</Button>
            <Button form="student-import-form" type="submit" loading={isImporting} disabled={!importGroupId || !importFile}>{t('students.import')}</Button>
          </>
        }
      >
        <form id="student-import-form" onSubmit={handleImport} className="flex flex-col gap-4">
          <Select label={t('students.group')} value={importGroupId} onChange={setImportGroupId} options={groupOptions} placeholder={t('common.select')} />
          <FileInput label={t('students.file')} accept=".csv" resetKey={importInputKey} hint={t('students.importHint')} onChange={(files) => setImportFile(files[0] ?? null)} />
        </form>

        {importResult && (
          <div className="flex flex-col gap-2 text-sm text-text-strong">
            <p>{t('students.importCreated', { count: importResult.created })}</p>
            {importResult.skipped.length > 0 && (
              <div>
                <p>{t('students.importSkipped')}</p>
                <ul className="list-disc pl-5">
                  {importResult.skipped.map((row) => (
                    <li key={row.line}>{t('students.lineEmail', { line: row.line, email: row.email })}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {importRowErrors.length > 0 && (
          <ul className="list-disc pl-5 text-sm text-danger">
            {importRowErrors.map((rowError, index) => (
              <li key={`${rowError.line}-${index}`}>
                {t('students.lineMessage', { line: rowError.line, message: codeMessage(rowError.code, rowError.params ?? undefined, rowError.message) })}
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <Modal
        open={isStudentModalOpen}
        onClose={closeStudentModal}
        title={editingStudent ? t('students.editStudent') : t('students.addStudent')}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeStudentModal} disabled={isSavingStudent}>{t('common.cancel')}</Button>
            <Button form="student-form" type="submit" loading={isSavingStudent}>{t('common.save')}</Button>
          </>
        }
      >
        <form id="student-form" onSubmit={submitStudent} className="grid grid-cols-2 gap-4">
          <TextField
            label={t('students.lastName')}
            maxLength={100}
            value={studentForm.lastName}
            onChange={(e) => setStudentForm((prev) => ({ ...prev, lastName: e.target.value }))}
            required
          />
          <TextField
            label={t('students.firstName')}
            maxLength={100}
            value={studentForm.firstName}
            onChange={(e) => setStudentForm((prev) => ({ ...prev, firstName: e.target.value }))}
            required
          />
          <TextField
            label={t('students.patronymic')}
            maxLength={100}
            value={studentForm.patronymic}
            onChange={(e) => setStudentForm((prev) => ({ ...prev, patronymic: e.target.value }))}
          />
          <TextField
            label={t('students.email')}
            type="email"
            maxLength={256}
            value={studentForm.email}
            onChange={(e) => setStudentForm((prev) => ({ ...prev, email: e.target.value }))}
            required
          />
          <TextField
            label={t('students.studentNumber')}
            maxLength={32}
            value={studentForm.studentNumber}
            onChange={(e) => setStudentForm((prev) => ({ ...prev, studentNumber: e.target.value }))}
            required
          />
          {!editingStudent && (
            <TextField
              label={t('students.password')}
              type="password"
              maxLength={PASSWORD_MAX}
              hint={t('students.passwordHint')}
              error={passwordError}
              value={studentForm.password}
              onChange={(e) => setStudentForm((prev) => ({ ...prev, password: e.target.value }))}
            />
          )}
          <Select
            label={t('students.group')}
            value={studentForm.groupId}
            onChange={(value) => setStudentForm((prev) => ({ ...prev, groupId: value }))}
            options={groupOptions}
            placeholder={t('common.select')}
            error={groupError}
          />
          <Select
            label={t('students.supervisor')}
            value={studentForm.supervisorId}
            onChange={(value) => setStudentForm((prev) => ({ ...prev, supervisorId: value }))}
            options={editingStudent ? editSupervisorOptions : supervisorOptions}
          />
          <div className="col-span-2">
            <TextField
              label={t('students.topic')}
              maxLength={500}
              value={studentForm.diplomaTopic}
              onChange={(e) => setStudentForm((prev) => ({ ...prev, diplomaTopic: e.target.value }))}
            />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(resettingStudent)}
        title={t('students.resetAccess')}
        message={resettingStudent ? t('students.resetConfirm', { name: `${resettingStudent.firstName} ${resettingStudent.lastName}` }) : ''}
        loading={isResettingAccess}
        onConfirm={() => void confirmResetAccess()}
        onCancel={() => setResettingStudent(null)}
      />

      <ConfirmDialog
        open={isArchiveConfirmOpen}
        title={t('students.archiveSelected', { count: selectedIds.size })}
        message={t('students.archiveSelectedConfirm', { count: selectedIds.size })}
        loading={isArchiving}
        onConfirm={() => void confirmArchiveSelected()}
        onCancel={() => setIsArchiveConfirmOpen(false)}
      />

      <ConfirmDialog
        open={isRestoreConfirmOpen}
        title={t('students.restoreSelected', { count: selectedIds.size })}
        message={t('students.restoreSelectedConfirm', { count: selectedIds.size })}
        tone="primary"
        loading={isRestoring}
        onConfirm={() => void confirmRestoreSelected()}
        onCancel={() => setIsRestoreConfirmOpen(false)}
      />
    </>
  )
}
