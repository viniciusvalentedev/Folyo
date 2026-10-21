import NextLink from 'next/link'
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export type ButtonVariant =
  | 'primary'
  | 'go'
  | 'quiet'
  | 'quiet-dark'
  | 'ghost'
  | 'ghost-on-blue'
  | 'ghost-on-dark'
  | 'danger'
  | 'done'

type Common = {
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  icon?: IconName
  iconRight?: IconName
  children?: ReactNode
  className?: string
}

function Inner({ size, icon, iconRight, children }: Pick<Common, 'size' | 'icon' | 'iconRight' | 'children'>) {
  const s = size === 'sm' ? 15 : 17
  return (
    <>
      {icon && <Icon name={icon} size={s} />}
      {children !== undefined && children !== null && <span>{children}</span>}
      {iconRight && <Icon name={iconRight} size={s} />}
    </>
  )
}

/** Botão padrão. Por segurança o tipo é "button" (não envia formulário sem querer). */
export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  children,
  className = '',
  type = 'button',
  ...rest
}: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={`btn btn-${variant} btn-${size} ${className}`} {...rest}>
      <Inner size={size} icon={icon} iconRight={iconRight}>
        {children}
      </Inner>
    </button>
  )
}

/** Link com cara de botão (navegação interna). */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  children,
  className = '',
  ...rest
}: Common & Omit<ComponentProps<typeof NextLink>, 'className' | 'children'>) {
  return (
    <NextLink className={`btn btn-${variant} btn-${size} ${className}`} {...rest}>
      <Inner size={size} icon={icon} iconRight={iconRight}>
        {children}
      </Inner>
    </NextLink>
  )
}

export function IconButton({
  icon,
  label,
  size = 18,
  className = '',
  type = 'button',
  ...rest
}: {
  icon: IconName
  label: string
  size?: number
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={'icon-btn ' + className} aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={size} />
    </button>
  )
}
