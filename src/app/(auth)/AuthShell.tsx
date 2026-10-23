'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { MarkPath, Wordmark } from '@/components/brand/Logo'
import { Icon } from '@/components/ui/Icon'
import { DEFAULT_PUBLIC_CONFIG } from '@/lib/app-config'

/** Frase da tela de entrada (vem das Configurações do painel; o layout das telas de entrada preenche). */
const TaglineContext = createContext(DEFAULT_PUBLIC_CONFIG.tagline)
export const AuthTaglineProvider = TaglineContext.Provider

/** Moldura das telas de entrada: arte da marca à esquerda, formulário à direita. */
export function AuthShell({ children }: { children: ReactNode }) {
  const tagline = useContext(TaglineContext)
  return (
    <div className="login">
      <section className="login-art" aria-hidden="true">
        <div className="login-brand">
          <Wordmark height={52} />
        </div>
        <h1 className="login-words">
          <span>Aprenda.</span>
          <span>Crie.</span>
          <span>Conquiste.</span>
        </h1>
        <p className="login-sub">{tagline}</p>
        <svg className="login-svg" viewBox="0 0 400 400">
          <defs>
            <linearGradient id="lg-g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#6A4DFF" />
              <stop offset="1" stopColor="#E234CF" />
            </linearGradient>
          </defs>
          <MarkPath x={300} y={190} r={230} fill="url(#lg-g)" rotate={-6} />
        </svg>
      </section>
      <section className="login-form-wrap">{children}</section>
    </div>
  )
}

/** Botão de enviar com indicador de carregamento. */
export function SubmitButton({
  pending,
  children,
  pendingLabel,
  disabled = false,
}: {
  pending: boolean
  children: ReactNode
  pendingLabel: string
  /** Ex.: enquanto a verificação anti-robô (CAPTCHA) não termina. */
  disabled?: boolean
}) {
  return (
    <button
      type="submit"
      className={'btn btn-primary btn-lg w-full' + (pending ? ' loading' : '')}
      disabled={pending || disabled}
    >
      {pending ? (
        <>
          <span className="spinner" />
          {pendingLabel}
        </>
      ) : (
        <span>{children}</span>
      )}
    </button>
  )
}

/** Mensagem de erro geral do formulário. */
export function FormAlert({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="alert alert-err login-alert" role="alert">
      <Icon name="CircleAlert" size={16} />
      <span>{message}</span>
    </p>
  )
}
