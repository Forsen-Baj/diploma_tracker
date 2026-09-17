import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { createDepartment, deleteDepartment, getDepartments, updateDepartment } from '../api/departmentsApi'
import { createFaculty, deleteFaculty, getFaculties, updateFaculty } from '../api/facultiesApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { cn } from '../components/ui/cn'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { Modal } from '../components/ui/Modal'
import { PageHeader } from '../components/ui/PageHeader'
import { Spinner } from '../components/ui/Spinner'
import { TextField } from '../components/ui/TextField'
import { TruncatedText } from '../components/ui/TruncatedText'
import { useToast } from '../components/ui/useToast'
import type { Department, Faculty } from '../api/types'

type NameForm = {
  name: string
  shortName: string
}

const emptyForm: NameForm = { name: '', shortName: '' }

export function FacultiesPage() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()

  const [faculties, setFaculties] = useState<Faculty[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [selectedFacultyId, setSelectedFacultyId] = useState('')
  const [isLoadingFaculties, setIsLoadingFaculties] = useState(true)
  const [isLoadingDepartments, setIsLoadingDepartments] = useState(false)
  const [facultiesLoadError, setFacultiesLoadError] = useState('')
  const [departmentsLoadError, setDepartmentsLoadError] = useState('')

  const [isFacultyModalOpen, setIsFacultyModalOpen] = useState(false)
  const [editingFaculty, setEditingFaculty] = useState<Faculty | null>(null)
  const [facultyForm, setFacultyForm] = useState<NameForm>(emptyForm)
  const [facultyNameError, setFacultyNameError] = useState('')
  const [facultyShortNameError, setFacultyShortNameError] = useState('')
  const [isSavingFaculty, setIsSavingFaculty] = useState(false)
  const [deletingFaculty, setDeletingFaculty] = useState<Faculty | null>(null)
  const [isDeletingFaculty, setIsDeletingFaculty] = useState(false)

  const [isDepartmentModalOpen, setIsDepartmentModalOpen] = useState(false)
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null)
  const [departmentForm, setDepartmentForm] = useState<NameForm>(emptyForm)
  const [departmentNameError, setDepartmentNameError] = useState('')
  const [departmentShortNameError, setDepartmentShortNameError] = useState('')
  const [isSavingDepartment, setIsSavingDepartment] = useState(false)
  const [deletingDepartment, setDeletingDepartment] = useState<Department | null>(null)
  const [isDeletingDepartment, setIsDeletingDepartment] = useState(false)

  const selectedFaculty = faculties.find((faculty) => faculty.id === selectedFacultyId) ?? null

  // Kept in sync with selectedFacultyId on every render so async callbacks can tell
  // whether the faculty they were started for is still the one on screen.
  const selectedFacultyIdRef = useRef(selectedFacultyId)
  selectedFacultyIdRef.current = selectedFacultyId

  const loadFaculties = useCallback(async () => {
    setIsLoadingFaculties(true)
    setFacultiesLoadError('')
    try {
      const data = await getFaculties()
      setFaculties(data)
      setSelectedFacultyId((current) => (data.some((faculty) => faculty.id === current) ? current : (data[0]?.id ?? '')))
    } catch (err) {
      setFacultiesLoadError(errorMessage(err))
    } finally {
      setIsLoadingFaculties(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadDepartments = useCallback(async (facultyId: string) => {
    if (!facultyId) {
      setDepartments([])
      return
    }

    setIsLoadingDepartments(true)
    setDepartmentsLoadError('')
    try {
      const data = await getDepartments(facultyId)
      if (selectedFacultyIdRef.current !== facultyId) {
        // A different faculty was selected while this request was in flight.
        return
      }
      setDepartments(data)
    } catch (err) {
      if (selectedFacultyIdRef.current !== facultyId) {
        return
      }
      setDepartments([])
      setDepartmentsLoadError(errorMessage(err))
    } finally {
      if (selectedFacultyIdRef.current === facultyId) {
        setIsLoadingDepartments(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void loadFaculties()
  }, [loadFaculties])

  useEffect(() => {
    setDepartments([])
    void loadDepartments(selectedFacultyId)
  }, [loadDepartments, selectedFacultyId])

  const openCreateFaculty = () => {
    setEditingFaculty(null)
    setFacultyForm(emptyForm)
    setFacultyNameError('')
    setFacultyShortNameError('')
    setIsFacultyModalOpen(true)
  }

  const openEditFaculty = (faculty: Faculty) => {
    setEditingFaculty(faculty)
    setFacultyForm({ name: faculty.name, shortName: faculty.shortName })
    setFacultyNameError('')
    setFacultyShortNameError('')
    setIsFacultyModalOpen(true)
  }

  const closeFacultyModal = () => {
    if (isSavingFaculty) return
    setIsFacultyModalOpen(false)
  }

  const submitFaculty = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedName = facultyForm.name.trim()
    const trimmedShortName = facultyForm.shortName.trim()
    setFacultyNameError(trimmedName ? '' : t('validation.required'))
    setFacultyShortNameError(trimmedShortName ? '' : t('validation.required'))
    if (!trimmedName || !trimmedShortName) {
      return
    }

    setIsSavingFaculty(true)
    const request = { name: trimmedName, shortName: trimmedShortName }
    try {
      if (editingFaculty) {
        await updateFaculty(editingFaculty.id, request)
      } else {
        await createFaculty(request)
      }
      setIsFacultyModalOpen(false)
      toast.success(t('common.savedToast'))
      await loadFaculties()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsSavingFaculty(false)
    }
  }

  const removeFaculty = async () => {
    if (!deletingFaculty) return

    setIsDeletingFaculty(true)
    try {
      await deleteFaculty(deletingFaculty.id)
      if (editingFaculty?.id === deletingFaculty.id) {
        setIsFacultyModalOpen(false)
      }
      setDeletingFaculty(null)
      toast.success(t('common.deletedToast'))
      await loadFaculties()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsDeletingFaculty(false)
    }
  }

  const openCreateDepartment = () => {
    setEditingDepartment(null)
    setDepartmentForm(emptyForm)
    setDepartmentNameError('')
    setDepartmentShortNameError('')
    setIsDepartmentModalOpen(true)
  }

  const openEditDepartment = (department: Department) => {
    setEditingDepartment(department)
    setDepartmentForm({ name: department.name, shortName: department.shortName })
    setDepartmentNameError('')
    setDepartmentShortNameError('')
    setIsDepartmentModalOpen(true)
  }

  const closeDepartmentModal = () => {
    if (isSavingDepartment) return
    setIsDepartmentModalOpen(false)
  }

  const submitDepartment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedFacultyId && !editingDepartment) {
      return
    }

    const trimmedName = departmentForm.name.trim()
    const trimmedShortName = departmentForm.shortName.trim()
    setDepartmentNameError(trimmedName ? '' : t('validation.required'))
    setDepartmentShortNameError(trimmedShortName ? '' : t('validation.required'))
    if (!trimmedName || !trimmedShortName) {
      return
    }

    setIsSavingDepartment(true)
    // Updates always target the edited department's own faculty, never the faculty
    // currently selected in the UI, so an edit can never move a department by accident.
    const targetFacultyId = editingDepartment ? editingDepartment.facultyId : selectedFacultyId
    const request = { facultyId: targetFacultyId, name: trimmedName, shortName: trimmedShortName }
    try {
      if (editingDepartment) {
        await updateDepartment(editingDepartment.id, request)
      } else {
        await createDepartment(request)
      }
      setIsDepartmentModalOpen(false)
      toast.success(t('common.savedToast'))
      if (selectedFacultyIdRef.current === targetFacultyId) {
        await loadDepartments(targetFacultyId)
      }
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsSavingDepartment(false)
    }
  }

  const removeDepartment = async () => {
    if (!deletingDepartment) return

    setIsDeletingDepartment(true)
    try {
      await deleteDepartment(deletingDepartment.id)
      if (editingDepartment?.id === deletingDepartment.id) {
        setIsDepartmentModalOpen(false)
      }
      setDeletingDepartment(null)
      toast.success(t('common.deletedToast'))
      await loadDepartments(selectedFacultyId)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsDeletingDepartment(false)
    }
  }

  const departmentColumns: DataTableColumn<Department>[] = [
    { key: 'name', header: t('faculties.name'), render: (department) => department.name },
    { key: 'shortName', header: t('faculties.shortName'), render: (department) => department.shortName },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (department) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" icon={Pencil} aria-label={t('common.edit')} onClick={() => openEditDepartment(department)} />
          <Button variant="ghost" size="sm" icon={Trash2} aria-label={t('common.delete')} onClick={() => setDeletingDepartment(department)} />
        </div>
      )
    }
  ]

  return (
    <>
      <PageHeader
        title={t('faculties.title')}
        actions={<Button icon={Plus} onClick={openCreateFaculty}>{t('faculties.addFaculty')}</Button>}
      />

      <div className="grid grid-cols-[320px_1fr] gap-6">
        <Card title={t('faculties.listTitle')}>
          {isLoadingFaculties && (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          )}
          {!isLoadingFaculties && facultiesLoadError && <p className="text-sm text-danger">{facultiesLoadError}</p>}
          {!isLoadingFaculties && !facultiesLoadError && faculties.length === 0 && (
            <EmptyState message={t('faculties.noFaculties')} />
          )}
          {!isLoadingFaculties && !facultiesLoadError && faculties.length > 0 && (
            <div className="flex flex-col gap-1">
              {faculties.map((faculty) => (
                <div
                  key={faculty.id}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded-control text-sm text-text-strong hover:bg-surface',
                    faculty.id === selectedFacultyId && 'bg-surface font-semibold'
                  )}
                >
                  <button
                    type="button"
                    aria-pressed={faculty.id === selectedFacultyId}
                    onClick={() => setSelectedFacultyId(faculty.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left"
                  >
                    <Badge>{faculty.shortName}</Badge>
                    <TruncatedText text={faculty.name} />
                  </button>
                  <span className="flex shrink-0 items-center gap-1 pr-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Pencil}
                      aria-label={t('common.edit')}
                      onClick={() => openEditFaculty(faculty)}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Trash2}
                      aria-label={t('common.delete')}
                      onClick={() => setDeletingFaculty(faculty)}
                    />
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card
          title={selectedFaculty ? t('faculties.departmentsOf', { shortName: selectedFaculty.shortName }) : undefined}
          actions={selectedFaculty ? <Button size="sm" icon={Plus} onClick={openCreateDepartment}>{t('faculties.addDepartment')}</Button> : undefined}
        >
          {!selectedFaculty && <EmptyState message={t('faculties.selectFaculty')} />}
          {selectedFaculty && departmentsLoadError && <p className="text-sm text-danger">{departmentsLoadError}</p>}
          {selectedFaculty && !departmentsLoadError && (
            <DataTable
              columns={departmentColumns}
              rows={departments}
              getRowKey={(department) => department.id}
              loading={isLoadingDepartments}
              emptyState={<EmptyState message={t('faculties.noDepartments')} />}
            />
          )}
        </Card>
      </div>

      <Modal
        open={isFacultyModalOpen}
        onClose={closeFacultyModal}
        title={editingFaculty ? t('faculties.editFaculty') : t('faculties.addFaculty')}
        footer={
          <>
            <Button variant="secondary" onClick={closeFacultyModal} disabled={isSavingFaculty}>{t('common.cancel')}</Button>
            <Button form="faculty-form" type="submit" loading={isSavingFaculty}>{t('common.save')}</Button>
          </>
        }
      >
        <form id="faculty-form" onSubmit={submitFaculty} className="flex flex-col gap-4">
          <TextField
            label={t('faculties.name')}
            maxLength={200}
            value={facultyForm.name}
            onChange={(e) => setFacultyForm((prev) => ({ ...prev, name: e.target.value }))}
            error={facultyNameError}
          />
          <TextField
            label={t('faculties.shortName')}
            maxLength={50}
            value={facultyForm.shortName}
            onChange={(e) => setFacultyForm((prev) => ({ ...prev, shortName: e.target.value }))}
            error={facultyShortNameError}
          />
        </form>
      </Modal>

      <Modal
        open={isDepartmentModalOpen}
        onClose={closeDepartmentModal}
        title={editingDepartment ? t('faculties.editDepartment') : t('faculties.addDepartment')}
        footer={
          <>
            <Button variant="secondary" onClick={closeDepartmentModal} disabled={isSavingDepartment}>{t('common.cancel')}</Button>
            <Button form="department-form" type="submit" loading={isSavingDepartment}>{t('common.save')}</Button>
          </>
        }
      >
        <form id="department-form" onSubmit={submitDepartment} className="flex flex-col gap-4">
          <TextField
            label={t('faculties.name')}
            maxLength={200}
            value={departmentForm.name}
            onChange={(e) => setDepartmentForm((prev) => ({ ...prev, name: e.target.value }))}
            error={departmentNameError}
          />
          <TextField
            label={t('faculties.shortName')}
            maxLength={50}
            value={departmentForm.shortName}
            onChange={(e) => setDepartmentForm((prev) => ({ ...prev, shortName: e.target.value }))}
            error={departmentShortNameError}
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingFaculty)}
        title={t('common.delete')}
        message={deletingFaculty ? t('faculties.deleteFacultyConfirm', { name: deletingFaculty.name }) : ''}
        loading={isDeletingFaculty}
        onConfirm={() => void removeFaculty()}
        onCancel={() => setDeletingFaculty(null)}
      />

      <ConfirmDialog
        open={Boolean(deletingDepartment)}
        title={t('common.delete')}
        message={deletingDepartment ? t('faculties.deleteDepartmentConfirm', { name: deletingDepartment.name }) : ''}
        loading={isDeletingDepartment}
        onConfirm={() => void removeDepartment()}
        onCancel={() => setDeletingDepartment(null)}
      />
    </>
  )
}
