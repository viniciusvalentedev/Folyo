'use client'

import type { ReactNode } from 'react'
import { MarkPath, Wordmark } from '@/components/brand/Logo'
import { Icon } from '@/components/ui/Icon'
import { siteConfig } from '@/lib/config'

/** Moldura das telas de entrada: arte da marca à esquerda, formulário à direita. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="login">
      <section className="login-art" aria-hidden="true">
        <div className="login-brand">
          <Wordmark height={52} />
        </div>
        <h1 className="login-words">
          <span>Aprenda.</span>
          <span>Pratique.</span>
          <span>Demonstre.</span>
        </h1>
        <p className="login-sub">{siteConfig.tagline}</p>
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
export function SubmitButton({ pending, children, pendingLabel }: { pending: boolean; children: ReactNode; pendingLabel: string }) {
  return (
    <button type="submit" className={'btn btn-primary btn-lg w-full' + (pending ? ' loading' : '')} disabled={pending}>
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
