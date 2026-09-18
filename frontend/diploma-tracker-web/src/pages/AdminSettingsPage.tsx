import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { getRegistrationStatus, setRegistrationStatus } from '../api/registrationApi'
import { getTopicSelectionSettings, setTopicSelectionDeadline } from '../api/settingsApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { Spinner } from '../components/ui/Spinner'
import { Switch } from '../components/ui/Switch'
import { TextField } from '../components/ui/TextField'
import { useToast } from '../components/ui/useToast'
import { fromDatetimeLocalValue, toDatetimeLocalValue } from '../utils/datetime'

export function AdminSettingsPage() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()

  const [registrationOpen, setRegistrationOpen] = useState(false)
  const [isTogglingRegistration, setIsTogglingRegistration] = useState(false)

  const [deadlineValue, setDeadlineValue] = useState('')
  const [isSavingDeadline, setIsSavingDeadline] = useState(false)
  const [isClearingDeadline, setIsClearingDeadline] = useState(false)

  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const loadSettings = async () => {
    setIsLoading(true)
    setLoadError('')
    try {
      const [registration, selection] = await Promise.all([getRegistrationStatus(), getTopicSelectionSettings()])
      setRegistrationOpen(registration.open)
      setDeadlineValue(selection.deadline ? toDatetimeLocalValue(selection.deadline) : '')
    } catch (err) {
      setLoadError(errorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleRegistration = async () => {
    const nextValue = !registrationOpen
    setIsTogglingRegistration(true)
    try {
      await setRegistrationStatus(nextValue)
      setRegistrationOpen(nextValue)
      toast.success(t(nextValue ? 'settings.registrationOpened' : 'settings.registrationClosed'))
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsTogglingRegistration(false)
    }
  }

  const saveDeadline = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!deadlineValue) return

    setIsSavingDeadline(true)
    try {
      await setTopicSelectionDeadline(fromDatetimeLocalValue(deadlineValue))
      toast.success(t('settings.deadlineSaved'))
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsSavingDeadline(false)
    }
  }

  const clearDeadline = async () => {
    setIsClearingDeadline(true)
    try {
      await setTopicSelectionDeadline(null)
      setDeadlineValue('')
      toast.success(t('settings.deadlineCleared'))
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsClearingDeadline(false)
    }
  }

  return (
    <>
      <PageHeader title={t('settings.title')} />

      {isLoading && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}

      {!isLoading && loadError && (
        <Card>
          <p className="text-sm text-danger">{loadError}</p>
        </Card>
      )}

      {!isLoading && !loadError && (
        <>
          <Card title={t('settings.registrationTitle')} className="mb-6">
            <Switch
              label={t('settings.registrationOpen')}
              checked={registrationOpen}
              onChange={() => void toggleRegistration()}
              disabled={isTogglingRegistration}
            />
            <p className="mt-1.5 text-xs text-text-muted">{t('settings.registrationHint')}</p>
          </Card>

          <Card title={t('settings.selectionTitle')}>
            <form onSubmit={(event) => void saveDeadline(event)} className="flex flex-col gap-4">
              <div className="max-w-xs">
                <TextField
                  label={t('settings.deadline')}
                  type="datetime-local"
                  hint={t('settings.deadlineHint')}
                  value={deadlineValue}
                  onChange={(e) => setDeadlineValue(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Button type="submit" loading={isSavingDeadline} disabled={!deadlineValue}>{t('common.save')}</Button>
                <Button type="button" variant="secondary" loading={isClearingDeadline} onClick={() => void clearDeadline()}>
                  {t('settings.clearDeadline')}
                </Button>
              </div>
            </form>
          </Card>
        </>
      )}
    </>
  )
}
