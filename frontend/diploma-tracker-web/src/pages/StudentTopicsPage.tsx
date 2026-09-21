import { CalendarX, Lightbulb } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { getMyReservations, proposeTopic, reserveTopic } from '../api/reservationsApi'
import { getTopicSelectionSettings } from '../api/settingsApi'
import { getTopics, getTopicSupervisors } from '../api/topicsApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { Modal } from '../components/ui/Modal'
import { PageHeader } from '../components/ui/PageHeader'
import { Select, type SelectOption } from '../components/ui/Select'
import { Spinner } from '../components/ui/Spinner'
import { TextField } from '../components/ui/TextField'
import { Textarea } from '../components/ui/Textarea'
import { Tooltip } from '../components/ui/Tooltip'
import { useToast } from '../components/ui/useToast'
import { MyTopicCard } from '../components/topics/MyTopicCard'
import { TopicDetailsModal } from '../components/topics/TopicDetailsModal'
import { TopicStatusBadge } from '../components/topics/TopicStatusBadge'
import { optional } from '../utils/optional'
import type { Reservation, SupervisorOption, Topic } from '../api/types'

type ProposeFormState = {
  title: string
  description: string
  supervisorId: string
}

const emptyProposeForm: ProposeFormState = { title: '', description: '', supervisorId: '' }

export function StudentTopicsPage() {
  const { t, i18n } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()

  const [topics, setTopics] = useState<Topic[]>([])
  const [supervisors, setSupervisors] = useState<SupervisorOption[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [deadline, setDeadline] = useState<string | null>(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [topicsLoading, setTopicsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [topicsError, setTopicsError] = useState('')
  const topicsRequestRef = useRef(0)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [supervisorId, setSupervisorId] = useState('')

  const [viewingTopic, setViewingTopic] = useState<Topic | null>(null)

  const [reservingTopic, setReservingTopic] = useState<Topic | null>(null)
  const [isReserving, setIsReserving] = useState(false)

  const [isProposeOpen, setIsProposeOpen] = useState(false)
  const [proposeForm, setProposeForm] = useState<ProposeFormState>(emptyProposeForm)
  const [proposeSupervisorError, setProposeSupervisorError] = useState('')
  const [isProposing, setIsProposing] = useState(false)

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'uk-UA', { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.language]
  )

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(timeout)
  }, [searchInput])

  const loadContext = async () => {
    setPageLoading(true)
    setLoadError('')
    try {
      const [supervisorsData, reservationsData, settings] = await Promise.all([
        getTopicSupervisors(),
        getMyReservations(),
        getTopicSelectionSettings()
      ])
      setSupervisors(supervisorsData)
      setReservations(reservationsData)
      setDeadline(settings.deadline)
    } catch (err) {
      setLoadError(errorMessage(err))
    } finally {
      setPageLoading(false)
    }
  }

  const loadTopics = async () => {
    const requestId = ++topicsRequestRef.current
    setTopicsLoading(true)
    setTopicsError('')
    try {
      const data = await getTopics({ search, supervisorId: supervisorId || undefined })
      if (topicsRequestRef.current !== requestId) return
      setTopics(data)
    } catch (err) {
      if (topicsRequestRef.current !== requestId) return
      setTopicsError(errorMessage(err))
    } finally {
      if (topicsRequestRef.current === requestId) setTopicsLoading(false)
    }
  }

  useEffect(() => {
    void loadContext()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void loadTopics()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, supervisorId])

  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (deadline === null) return

    const remaining = new Date(deadline).getTime() - Date.now()
    if (remaining <= 0) return

    // setTimeout is capped at ~24.8 days (2^31-1 ms); a deadline further away is re-checked
    // when the window regains focus, which is enough - nobody leaves this page open for a month.
    const delay = Math.min(remaining + 1000, 2_147_483_647)
    const timer = window.setTimeout(() => setNow(Date.now()), delay)
    return () => window.clearTimeout(timer)
  }, [deadline])

  useEffect(() => {
    const onFocus = () => setNow(Date.now())
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const approvedReservation = reservations.find((reservation) => reservation.status === 'Approved') ?? null
  const pendingReservation = reservations.find((reservation) => reservation.status === 'Pending') ?? null
  const hasTopic = Boolean(approvedReservation)
  const hasPending = Boolean(pendingReservation)
  const selectionClosedRaw = deadline !== null && new Date(deadline).getTime() <= now
  const noTopicAndClosed = !hasTopic && selectionClosedRaw

  const refreshAfterChange = () => {
    void Promise.all([loadContext(), loadTopics()])
  }

  const supervisorFilterOptions: SelectOption[] = [
    { value: '', label: t('topics.allSupervisors') },
    ...supervisors.map((supervisor) => ({ value: supervisor.id, label: supervisor.name }))
  ]

  const proposeSupervisorOptions: SelectOption[] = supervisors.map((supervisor) => ({ value: supervisor.id, label: supervisor.name }))

  const openReserveConfirm = (topic: Topic) => setReservingTopic(topic)

  const confirmReserve = async () => {
    if (!reservingTopic) return

    setIsReserving(true)
    try {
      await reserveTopic(reservingTopic.id)
      setReservingTopic(null)
      toast.success(t('topics.reserved'))
      await Promise.all([loadContext(), loadTopics()])
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsReserving(false)
    }
  }

  const openProposeModal = () => {
    setProposeForm(emptyProposeForm)
    setProposeSupervisorError('')
    setIsProposeOpen(true)
  }

  const closeProposeModal = () => {
    if (isProposing) return
    setIsProposeOpen(false)
  }

  const submitPropose = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!proposeForm.supervisorId) {
      setProposeSupervisorError(t('validation.required'))
      return
    }
    setProposeSupervisorError('')

    setIsProposing(true)
    try {
      await proposeTopic({
        title: proposeForm.title.trim(),
        description: optional(proposeForm.description),
        supervisorId: proposeForm.supervisorId
      })
      setIsProposeOpen(false)
      toast.success(t('topics.proposed'))
      await Promise.all([loadContext(), loadTopics()])
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsProposing(false)
    }
  }

  const topicColumns: DataTableColumn<Topic>[] = [
    {
      key: 'title',
      header: t('topics.title'),
      render: (topic) => (
        <button type="button" className="text-left font-medium text-accent hover:underline" onClick={() => setViewingTopic(topic)}>
          {topic.title}
        </button>
      )
    },
    { key: 'supervisor', header: t('topics.supervisor'), render: (topic) => topic.supervisorName },
    { key: 'status', header: t('common.status'), render: (topic) => <TopicStatusBadge status={topic.status} /> },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (topic) => {
        const isOwnCurrentTopic = topic.id === approvedReservation?.topicId
        const disabled = hasPending || isOwnCurrentTopic || (!hasTopic && selectionClosedRaw)
        const reason: ReactNode = !disabled
          ? undefined
          : isOwnCurrentTopic
            ? t('topics.reserveDisabledOwnTopic')
            : hasPending
              ? t('topics.reserveDisabledPending')
              : t('topics.reserveDisabledClosed')

        const actionButton = (
          <Button variant="primary" size="sm" onClick={() => openReserveConfirm(topic)} disabled={disabled}>
            {t(hasTopic ? 'topics.requestChange' : 'topics.reserve')}
          </Button>
        )

        if (!disabled) {
          return actionButton
        }

        return (
          <Tooltip content={reason}>
            <span tabIndex={0} className="inline-flex rounded-control">
              {actionButton}
            </span>
          </Tooltip>
        )
      }
    }
  ]

  return (
    <>
      <PageHeader
        title={t('topics.catalogueTitle')}
        description={
          pageLoading
            ? undefined
            : deadline
              ? t(selectionClosedRaw ? 'topics.deadlinePassedInfo' : 'topics.deadlineInfo', { date: dateFormat.format(new Date(deadline)) })
              : t('topics.noDeadline')
        }
        actions={
          !pageLoading && !noTopicAndClosed ? (
            <Button
              variant="secondary"
              icon={Lightbulb}
              onClick={openProposeModal}
              disabled={hasPending}
              className="[&>svg]:transition [&>svg]:duration-200 hover:[&>svg]:text-glow hover:[&>svg]:drop-shadow-[0_0_var(--glow-radius)_var(--color-glow)] focus-visible:[&>svg]:text-glow focus-visible:[&>svg]:drop-shadow-[0_0_var(--glow-radius)_var(--color-glow)] motion-reduce:[&>svg]:transition-none"
            >
              {t(hasTopic ? 'topics.proposeDifferent' : 'topics.propose')}
            </Button>
          ) : undefined
        }
      />

      {!loadError && <MyTopicCard reservations={reservations} loading={pageLoading} onChanged={refreshAfterChange} />}

      {pageLoading && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}

      {!pageLoading && loadError && (
        <Card>
          <p className="text-sm text-danger">{loadError}</p>
        </Card>
      )}

      {!pageLoading && !loadError && (
        <>
          {noTopicAndClosed && (
            <Card className="mb-6">
              <EmptyState icon={CalendarX} message={t('topics.selectionClosed')} />
            </Card>
          )}

          <Card>
            <div className="mb-4 flex items-end gap-3">
              <div className="max-w-sm flex-1">
                <TextField
                  label={t('topics.search')}
                  placeholder={t('topics.searchPlaceholder')}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>
              <div className="max-w-xs flex-1">
                <Select label={t('topics.supervisor')} value={supervisorId} onChange={setSupervisorId} options={supervisorFilterOptions} />
              </div>
            </div>

            {topicsError && <p className="mb-4 text-sm text-danger">{topicsError}</p>}

            <DataTable
              columns={topicColumns}
              rows={topics}
              getRowKey={(topic) => topic.id}
              loading={topicsLoading}
              emptyState={<EmptyState message={t('topics.noTopics')} />}
            />
          </Card>
        </>
      )}

      <TopicDetailsModal topic={viewingTopic} open={Boolean(viewingTopic)} onClose={() => setViewingTopic(null)} />

      <ConfirmDialog
        open={Boolean(reservingTopic)}
        title={t(hasTopic ? 'topics.requestChange' : 'topics.reserve')}
        message={
          reservingTopic
            ? hasTopic && approvedReservation
              ? t('topics.changeConfirm', { next: reservingTopic.title, current: approvedReservation.topicTitle })
              : t('topics.reserveConfirm', { title: reservingTopic.title })
            : ''
        }
        tone="primary"
        loading={isReserving}
        onConfirm={() => void confirmReserve()}
        onCancel={() => setReservingTopic(null)}
      />

      <Modal
        open={isProposeOpen}
        onClose={closeProposeModal}
        title={t('topics.proposeTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={closeProposeModal} disabled={isProposing}>{t('common.cancel')}</Button>
            <Button form="propose-topic-form" type="submit" loading={isProposing} disabled={proposeSupervisorOptions.length === 0}>
              {t('topics.propose')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-muted">{t('topics.proposeHint')}</p>
        <form id="propose-topic-form" onSubmit={(event) => void submitPropose(event)} className="flex flex-col gap-4">
          <TextField
            label={t('topics.title')}
            maxLength={300}
            value={proposeForm.title}
            onChange={(e) => setProposeForm((prev) => ({ ...prev, title: e.target.value }))}
            required
          />
          <Textarea
            label={t('topics.description')}
            maxLength={4000}
            value={proposeForm.description}
            onChange={(e) => setProposeForm((prev) => ({ ...prev, description: e.target.value }))}
          />
          {proposeSupervisorOptions.length === 0 ? (
            <p className="text-sm text-text-muted">{t('topics.noTeachersAvailable')}</p>
          ) : (
            <Select
              label={t('topics.teacher')}
              value={proposeForm.supervisorId}
              onChange={(value) => setProposeForm((prev) => ({ ...prev, supervisorId: value }))}
              options={proposeSupervisorOptions}
              placeholder={t('common.select')}
              error={proposeSupervisorError}
            />
          )}
        </form>
      </Modal>
    </>
  )
}
