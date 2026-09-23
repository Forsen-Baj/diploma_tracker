import { Field, Label, Switch as HeadlessSwitch } from '@headlessui/react'
import type { ReactNode } from 'react'

type SwitchProps = {
  label: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export function Switch({ label, checked, onChange, disabled }: SwitchProps) {
  return (
    <Field className="flex items-center gap-3" disabled={disabled}>
      <HeadlessSwitch
        checked={checked}
        onChange={onChange}
        className="group relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-pill bg-border-subtle transition-colors data-checked:bg-accent data-disabled:cursor-not-allowed data-disabled:opacity-50"
      >
        <span className="size-5 translate-x-0.5 rounded-pill bg-white shadow-subtle transition-transform group-data-checked:translate-x-5.5" />
      </HeadlessSwitch>
      <Label className="text-sm text-text-strong">{label}</Label>
    </Field>
  )
}
