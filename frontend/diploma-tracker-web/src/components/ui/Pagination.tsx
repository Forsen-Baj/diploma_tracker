import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'

type PaginationProps = {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
  disabled?: boolean
}

export function Pagination({ page, pageSize, total, onChange, disabled = false }: PaginationProps) {
  const { t } = useTranslation()

  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  if (total <= pageSize) {
    return null
  }

  return (
    <div className="mt-4 flex items-center justify-between gap-4">
      <p className="text-xs text-text-muted">{t('pagination.showing', { from, to, total })}</p>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" icon={ChevronFirst} aria-label={t('pagination.first')}
          disabled={disabled || page <= 1} onClick={() => onChange(1)} />
        <Button variant="ghost" size="sm" icon={ChevronLeft} aria-label={t('pagination.previous')}
          disabled={disabled || page <= 1} onClick={() => onChange(page - 1)} />
        <span className="px-2 text-xs text-text-muted">{t('pagination.page', { page, lastPage })}</span>
        <Button variant="ghost" size="sm" icon={ChevronRight} aria-label={t('pagination.next')}
          disabled={disabled || page >= lastPage} onClick={() => onChange(page + 1)} />
        <Button variant="ghost" size="sm" icon={ChevronLast} aria-label={t('pagination.last')}
          disabled={disabled || page >= lastPage} onClick={() => onChange(lastPage)} />
      </div>
    </div>
  )
}
