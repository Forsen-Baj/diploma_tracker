import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { setStandardsController } from '../../api/groupTasksApi'
import { searchStaff } from '../../api/workflowApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Select, type SelectOption } from '../ui/Select'
import { useToast } from '../ui/useToast'
import type { GroupTask, StaffOption } from '../../api/types'

type StandardsControllerDialogProps = {
  groupTask: GroupTask
  onClose: () => void
  onChanged: () => void
}

/** Design 2026-09-27 §6.1: set, change or remove the standards controller of one group step. */
export function StandardsControllerDialog({ groupTask, onClose, onChanged }: StandardsControllerDialogProps) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()
  const [controllers, setControllers] = useState<StaffOption[]>([])
  const [selected, setSelected] = useState(groupTask.standardsControllerId ?? '')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    searchStaff('', 'standardsController')
      .then((options) => { if (!cancelled) setControllers(options) })
      .catch((err) => { if (!cancelled) toast.error(errorMessage(err)) })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const options: SelectOption[] = controllers.map((c) => ({ value: c.id, label: c.name }))
  const selectedName = controllers.find((c) => c.id === selected)?.name ?? groupTask.standardsControllerName ?? ''

  const save = async (userId: string | null) => {
    setIsSaving(true)
    try {
      await setStandardsController(groupTask.id, userId)
      toast.success(t(userId ? 'taskTemplates.controllerSet' : 'taskTemplates.controllerRemoved'))
      onChanged()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={() => { if (!isSaving) onClose() }}
      title={t('taskTemplates.controllerTitle', { step: groupTask.taskTitle })}
      footer={
        <>
          {groupTask.standardsControllerId && (
            <Button variant="danger" onClick={() => void save(null)} disabled={isSaving}>{t('taskTemplates.removeController')}</Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>{t('common.cancel')}</Button>
          <Button
            onClick={() => void save(selected)}
            loading={isSaving}
            disabled={!selected || selected === groupTask.standardsControllerId}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      {!isLoading && options.length === 0 ? (
        <p className="text-sm text-text-muted">{t('taskTemplates.noControllers')}</p>
      ) : (
        <Select label={t('taskTemplates.standardsController')} value={selected} onChange={setSelected} options={options} placeholder={t('common.select')} />
      )}
      {selected && selected !== groupTask.standardsControllerId && (
        <p className="text-sm text-text-muted">{t('taskTemplates.controllerConfirm', {
            name: selectedName,
            step: groupTask.taskTitle,
            students: groupTask.studentTaskCount - groupTask.approvedStepCount,
            approved: groupTask.approvedStepCount
          })}</p>
      )}
      {groupTask.standardsControllerId && (
        <p className="text-sm text-text-muted">{t('taskTemplates.removeHint')}</p>
      )}
    </Modal>
  )
}
