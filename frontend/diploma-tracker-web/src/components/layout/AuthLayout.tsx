import { GraduationCap } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LanguageSwitch } from './LanguageSwitch'

export function AuthLayout({ title, children }: { title: ReactNode; children: ReactNode }) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex justify-end px-8 py-4">
        <LanguageSwitch />
      </div>
      <div className="flex flex-1 items-start justify-center px-4 pt-12">
        <section className="w-full max-w-md rounded-card border border-border-subtle bg-background p-8">
          <div className="mb-6 flex items-center gap-2 text-heading">
            <GraduationCap className="size-7 text-accent" aria-hidden />
            <span className="text-lg font-bold">{t('app.name')}</span>
          </div>
          <h1 className="mb-6 text-xl font-semibold text-heading">{title}</h1>
          {children}
        </section>
      </div>
    </div>
  )
}
