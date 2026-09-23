import { useTranslation } from 'react-i18next'
import { cn } from '../ui/cn'

export function LanguageSwitch() {
  const { t, i18n } = useTranslation()
  const isEnglish = i18n.language === 'en'

  const toggle = () => {
    void i18n.changeLanguage(isEnglish ? 'uk' : 'en')
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isEnglish}
      aria-label={t('nav.language')}
      onClick={toggle}
      className="relative inline-flex h-8 w-[72px] shrink-0 items-center rounded-pill bg-surface p-1 shadow-inset"
    >
      <span
        aria-hidden
        className={cn(
          'absolute left-1 top-1 bottom-1 w-[calc(50%-4px)] rounded-pill bg-background shadow-subtle transition-transform duration-150 ease-out',
          isEnglish && 'translate-x-full'
        )}
      />
      <span className="relative z-10 grid w-full grid-cols-2 text-center text-xs font-semibold">
        <span className={isEnglish ? 'text-text-muted' : 'text-text-strong'}>UK</span>
        <span className={isEnglish ? 'text-text-strong' : 'text-text-muted'}>EN</span>
      </span>
    </button>
  )
}
