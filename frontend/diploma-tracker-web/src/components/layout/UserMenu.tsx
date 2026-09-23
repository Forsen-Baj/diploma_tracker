import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { ChevronDown, LogOut, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'

export function UserMenu() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  if (!user) {
    return null
  }

  const signOut = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <Menu as="div" className="relative">
      <MenuButton className="flex items-center gap-2 rounded-control px-2 py-1.5 text-sm text-text-strong hover:bg-surface">
        <span className="text-right leading-tight">
          <span className="block font-medium">{user.firstName} {user.lastName}</span>
          <span className="block text-xs text-text-muted">{t(`roles.${user.role}`)}</span>
        </span>
        <ChevronDown className="size-4 text-text-muted" aria-hidden />
      </MenuButton>
      <MenuItems
        anchor="bottom end"
        className="z-50 mt-2 w-52 rounded-control border border-border-subtle bg-background p-1 shadow-lg focus:outline-none"
      >
        <MenuItem>
          <Link to="/account" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-text-strong data-focus:bg-surface">
            <UserRound className="size-4" aria-hidden />
            {t('nav.account')}
          </Link>
        </MenuItem>
        <MenuItem>
          <button type="button" onClick={signOut} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-text-strong data-focus:bg-surface">
            <LogOut className="size-4" aria-hidden />
            {t('nav.signOut')}
          </button>
        </MenuItem>
      </MenuItems>
    </Menu>
  )
}
