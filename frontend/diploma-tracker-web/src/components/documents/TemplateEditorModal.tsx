import { ChevronDown, ChevronUp } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/useAuth'
import { ApiError } from '../../api/apiClient'
import { getGroups } from '../../api/groupsApi'
import { createTemplate, replaceTemplateFile, snapshotFile, updateTemplate } from '../../api/templatesApi'
import { getTopicSupervisors } from '../../api/topicsApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { Button } from '../ui/Button'
import { Checkbox } from '../ui/Checkbox'
import { FileInput } from '../ui/FileInput'
import { Modal } from '../ui/Modal'
import { MultiSelect } from '../ui/MultiSelect'
import { TextField } from '../ui/TextField'
import { Textarea } from '../ui/Textarea'
import { optional } from '../../utils/optional'
import { MarkerList } from './MarkerList'
import type { DocumentTemplate, Group, SupervisorOption, TemplateInput } from '../../api/types'

type TemplateEditorModalProps = {
  open: boolean
  template?: DocumentTemplate
  onClose: () => void
  onSaved: () => void
  // M9: called instead of `onSaved` when the metadata step succeeded but the file replacement
  // was refused, so the caller reloads its list without closing the modal or toasting success.
  onPartiallySaved: () => void
}

type FormState = {
  name: string
  description: string
  visibleToAllStudents: boolean
  visibleToAllTeachers: boolean
  groupIds: string[]
  teacherIds: string[]
}

const emptyForm: FormState = {
  name: '',
  description: '',
  visibleToAllStudents: false,
  visibleToAllTeachers: false,
  groupIds: [],
  teacherIds: []
}

const MAX_FILE_BYTES = 10 * 1024 * 1024

function extensionOf(fileName: string): string {
  const index = fileName.lastIndexOf('.')
  return index === -1 ? '' : fileName.slice(index).toLowerCase()
}

// Pre-flight A9: unknown markers travel in the error payload's `errors` array. `payload` is typed
// `unknown` on `ApiError`, so it is narrowed with runtime checks rather than cast outright.
function unknownMarkersFrom(error: unknown): string[] {
  if (!(error instanceof ApiError) || error.code !== 'template.unknownMarkers') {
    return []
  }

  const payload = error.payload as { errors?: unknown } | null
  return Array.isArray(payload?.errors) ? payload.errors.filter((marker): marker is string => typeof marker === 'string') : []
}

export function TemplateEditorModal({ open, template, onClose, onSaved, onPartiallySaved }: TemplateEditorModalProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const errorMessage = useErrorMessage()

  const isAdmin = user?.role === 'Admin'
  const isEdit = Boolean(template)

  const [form, setForm] = useState<FormState>(emptyForm)
  const [groups, setGroups] = useState<Group[]>([])
  const [teachers, setTeachers] = useState<SupervisorOption[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [fileResetKey, setFileResetKey] = useState(0)
  const [nameError, setNameError] = useState('')
  const [fileError, setFileError] = useState('')
  const [error, setError] = useState('')
  const [unknownMarkers, setUnknownMarkers] = useState<string[]>([])
  const [fileNotReplaced, setFileNotReplaced] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isMarkersOpen, setIsMarkersOpen] = useState(false)
  const [groupsLoadError, setGroupsLoadError] = useState(false)
  const [teachersLoadError, setTeachersLoadError] = useState(false)

  useEffect(() => {
    if (!open) return

    setForm(
      template
        ? {
            name: template.name,
            description: template.description ?? '',
            visibleToAllStudents: template.audience?.visibleToAllStudents ?? false,
            visibleToAllTeachers: template.audience?.visibleToAllTeachers ?? false,
            groupIds: template.audience?.groups.map((group) => group.id) ?? [],
            teacherIds: template.audience?.teachers.map((teacher) => teacher.id) ?? []
          }
        : emptyForm
    )
    setFile(null)
    setFileResetKey((key) => key + 1)
    setNameError('')
    setFileError('')
    setError('')
    setUnknownMarkers([])
    setFileNotReplaced(false)
    setIsMarkersOpen(false)
    setGroupsLoadError(false)
    setTeachersLoadError(false)

    let isCurrent = true
    const load = async () => {
      const [groupsResult, teachersResult] = await Promise.allSettled([getGroups(), getTopicSupervisors()])
      if (!isCurrent) return
      // Either list is a convenience for building the audience; a failure must not block the
      // rest of the form from being usable, but it must be visible (M10).
      if (groupsResult.status === 'fulfilled') setGroups(groupsResult.value)
      else setGroupsLoadError(true)
      if (teachersResult.status === 'fulfilled') setTeachers(teachersResult.value)
      else setTeachersLoadError(true)
    }
    void load()

    return () => {
      isCurrent = false
    }
  }, [open, template])

  const close = () => {
    if (isSaving) return
    onClose()
  }

  // M8: groups are unique by (code, academicYear), not by code alone.
  const groupOptions = groups.map((group) => ({ value: group.id, label: `${group.code} · ${group.academicYear}` }))
  const teacherOptions = teachers.map((teacher) => ({ value: teacher.id, label: teacher.name }))

  // I1: a group or teacher the template already has, but that the caller can no longer see, is
  // missing from `groups`/`teachers`. Without a fallback label the value has no visible option,
  // so MultiSelect shows nothing for it and the operator cannot deselect it. Add it back from the
  // template's own audience, which already carries the right label for a hidden group.
  const withFallback = <T extends { id: string; name: string }>(
    fetched: { value: string; label: string }[],
    fromTemplate: T[] | undefined
  ) => {
    const known = new Set(fetched.map((option) => option.value))
    const extras = (fromTemplate ?? [])
      .filter((item) => !known.has(item.id))
      .map((item) => ({ value: item.id, label: item.name }))
    return [...fetched, ...extras]
  }

  const groupOptionsWithFallback = withFallback(groupOptions, template?.audience?.groups)
  const teacherOptionsWithFallback = withFallback(teacherOptions, template?.audience?.teachers)

  const validateFile = (candidate: File | null): boolean => {
    if (!candidate) {
      if (!isEdit) {
        setFileError(t('errors.template.fileMissing'))
        return false
      }
      setFileError('')
      return true
    }

    if (extensionOf(candidate.name) !== '.docx') {
      setFileError(t('errors.template.invalidFile'))
      return false
    }

    if (candidate.size > MAX_FILE_BYTES) {
      setFileError(t('errors.template.tooLarge'))
      return false
    }

    setFileError('')
    return true
  }

  const handleFileChange = (files: File[]) => {
    const candidate = files[0] ?? null
    setFile(candidate)
    validateFile(candidate)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nameMissing = form.name.trim().length === 0
    setNameError(nameMissing ? t('validation.required') : '')
    const fileValid = validateFile(file)

    if (nameMissing || !fileValid) {
      return
    }

    const input: TemplateInput = {
      name: form.name.trim(),
      // I1: the checkbox is admin-only; a teacher's save must not touch it, so a non-admin
      // always sends the template's own current value back unchanged.
      visibleToAllStudents: isAdmin ? form.visibleToAllStudents : (template?.audience?.visibleToAllStudents ?? false),
      description: optional(form.description),
      visibleToAllTeachers: form.visibleToAllTeachers,
      groupIds: form.groupIds,
      teacherIds: form.teacherIds
    }

    setError('')
    setUnknownMarkers([])
    setFileNotReplaced(false)
    setIsSaving(true)

    // Read the picked file's bytes now and upload that in-memory snapshot instead of the original
    // `File` handle, so a retry always sends what is on disk NOW rather than what the operator
    // picked earlier. A `File` handle whose bytes changed on disk (e.g. the operator fixed it in
    // Word under the same name) makes Chrome abort the upload with `net::ERR_UPLOAD_FILE_CHANGED`,
    // which `fetch` surfaces as a plain `TypeError` that reads as a generic network error.
    let freshFile: File | null = null
    if (file) {
      try {
        freshFile = await snapshotFile(file)
      } catch {
        setError(t('templates.fileChanged'))
        setFile(null)
        setFileResetKey((key) => key + 1)
        setIsSaving(false)
        return
      }
    }

    let metadataSaved = false
    try {
      if (isEdit && template) {
        await updateTemplate(template.id, input)
        metadataSaved = true
        // The metadata save above can succeed even when this step fails (e.g. unknown markers);
        // the modal stays open showing the file error so the operator can retry just the file.
        if (freshFile) {
          await replaceTemplateFile(template.id, freshFile)
        }
      } else if (freshFile) {
        await createTemplate(input, freshFile)
      }
      onSaved()
    } catch (err) {
      const markers = unknownMarkersFrom(err)
      if (markers.length > 0) {
        setUnknownMarkers(markers)
      } else {
        setError(errorMessage(err))
      }
      // M9: metadata was already committed; reload the caller's list so it is not stale, and
      // tell the operator the file itself was not replaced.
      if (metadataSaved) {
        setFileNotReplaced(true)
        onPartiallySaved()
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title={isEdit ? t('templates.edit') : t('templates.add')}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={isSaving}>{t('common.cancel')}</Button>
          <Button form="template-form" type="submit" loading={isSaving}>{t('common.save')}</Button>
        </>
      }
    >
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {fileNotReplaced && <p role="alert" className="text-sm text-danger">{t('templates.fileNotReplaced')}</p>}
      {unknownMarkers.length > 0 && (
        <div role="alert" className="rounded-card bg-danger-soft p-3">
          <p className="text-sm font-semibold text-danger">{t('errors.template.unknownMarkers')}</p>
          <p className="mt-1 text-xs text-danger">{t('templates.unknownMarkersList')}</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {unknownMarkers.map((marker) => (
              <li key={marker} className="font-mono text-xs text-danger">{`{{${marker}}}`}</li>
            ))}
          </ul>
        </div>
      )}
      <form id="template-form" onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <TextField
          label={t('templates.name')}
          maxLength={200}
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          error={nameError}
          required
        />
        <Textarea
          label={t('templates.description')}
          maxLength={1000}
          value={form.description}
          onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
        />
        <FileInput
          label={isEdit ? t('templates.replaceFile') : t('templates.file')}
          accept=".docx"
          resetKey={fileResetKey}
          hint={
            <span>
              {t('templates.fileHint')} <code className="font-mono">{'{{student.fullName}}'}</code>
              <br />
              {t('templates.removeCommentsHint')}
            </span>
          }
          error={fileError}
          onChange={handleFileChange}
        />

        <div className="flex flex-col gap-3 rounded-card bg-surface p-4">
          <p className="text-xs font-medium text-text-strong">{t('templates.audienceTitle')}</p>
          <MultiSelect
            label={t('templates.groups')}
            values={form.groupIds}
            onChange={(values) => setForm((prev) => ({ ...prev, groupIds: values }))}
            options={groupOptionsWithFallback}
            placeholder={t('common.select')}
            error={groupsLoadError ? t('templates.listLoadError') : undefined}
          />
          <MultiSelect
            label={t('templates.teachers')}
            values={form.teacherIds}
            onChange={(values) => setForm((prev) => ({ ...prev, teacherIds: values }))}
            options={teacherOptionsWithFallback}
            placeholder={t('common.select')}
            error={teachersLoadError ? t('templates.listLoadError') : undefined}
          />
          <Checkbox
            label={t('templates.allTeachers')}
            checked={form.visibleToAllTeachers}
            onChange={(checked) => setForm((prev) => ({ ...prev, visibleToAllTeachers: checked }))}
          />
          {isAdmin && (
            <Checkbox
              label={t('templates.allStudents')}
              checked={form.visibleToAllStudents}
              onChange={(checked) => setForm((prev) => ({ ...prev, visibleToAllStudents: checked }))}
            />
          )}
        </div>

        <div>
          <Button variant="ghost" size="sm" icon={isMarkersOpen ? ChevronUp : ChevronDown} onClick={() => setIsMarkersOpen((value) => !value)}>
            {t('templates.markersTitle')}
          </Button>
          {isMarkersOpen && (
            <div className="mt-3 rounded-card bg-surface p-3">
              <MarkerList />
            </div>
          )}
        </div>
      </form>
    </Modal>
  )
}
