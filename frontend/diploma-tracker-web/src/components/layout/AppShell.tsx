import { GraduationCap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { LanguageSwitch } from './LanguageSwitch'
import { navigationByRole } from './navigation'
import { TabNav } from './TabNav'
import { UserMenu } from './UserMenu'

export function AppShell() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const items = user ? navigationByRole[user.role].map((item) => ({ to: item.to, label: t(item.labelKey) })) : []

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border-subtle">
        <div className="mx-auto grid h-16 max-w-[1200px] grid-cols-[auto_1fr_auto] items-center gap-8 px-8">
          <Link to="/" className="flex items-center gap-2 text-heading">
            <GraduationCap className="size-6 text-accent" aria-hidden />
            <span className="text-base font-bold">{t('app.name')}</span>
          </Link>
          <TabNav items={items} />
          <div className="flex items-center gap-3">
            <LanguageSwitch />
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1200px] px-8 py-8">
        <Outlet />
      </main>
    </div>
  )
}
