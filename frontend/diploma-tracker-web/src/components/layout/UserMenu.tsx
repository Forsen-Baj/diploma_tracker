import { Menu, MenuButton, MenuHeading, MenuItem, MenuItems, MenuSection, MenuSeparator } from '@headlessui/react'
import { Check, ChevronDown, LogOut, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { useErrorMessage } from '../../api/useErrorMessage'
import { useAuth } from '../../auth/useAuth'
import { useToast } from '../ui/useToast'
import { heldRoles, homeRouteByRole } from './navigation'
import type { StaffRole } from '../../api/types'

/** Design 2026-09-27 (phase 12) §5: a staff member who holds more than one role - or holds one while
 *  acting in none - switches here. Each role keeps its own tabs, so a switch lands on its home page. */
export function UserMenu() {
  const { t } = useTranslation()
  const { user, logout, switchRole } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const errorMessage = useErrorMessage()

  if (!user) {
    return null
  }

  const roles = user.accountRole === 'Staff' ? heldRoles(user) : []
  const canSwitch = roles.length > 1 || (roles.length === 1 && roles[0] !== user.role)

  const signOut = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const actAs = async (role: StaffRole) => {
    if (role === user.role) return
    try {
      const next = await switchRole(role)
      navigate(homeRouteByRole[next.role], { replace: true })
      toast.success(t('nav.roleSwitched', { role: t(`roles.${role}`) }))
    } catch (err) {
      toast.error(errorMessage(err))
    }
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
        className="z-50 mt-2 w-60 rounded-control border border-border-subtle bg-background p-1 shadow-lg focus:outline-none"
      >
        {canSwitch && (
          <>
            <MenuSection>
              <MenuHeading className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-text-muted">
                {t('nav.actingAs')}
              </MenuHeading>
              {roles.map((role) => (
                <MenuItem key={role}>
                  <button
                    type="button"
                    onClick={() => void actAs(role)}
                    aria-current={role === user.role ? 'true' : undefined}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-text-strong data-focus:bg-surface"
                  >
                    <Check className={role === user.role ? 'size-4 text-accent' : 'size-4 opacity-0'} aria-hidden />
                    {t(`roles.${role}`)}
                  </button>
                </MenuItem>
              ))}
            </MenuSection>
            <MenuSeparator className="my-1 h-px bg-border-subtle" />
          </>
        )}
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
