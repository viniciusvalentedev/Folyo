'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useActionState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { emailLinkSchema } from '@/lib/validation'
import { verifyEmailLinkAction, type AuthFormState } from '../../actions'
import { FormAlert, SubmitButton } from '../../AuthShell'

const initial: AuthFormState = {}

/**
 * O link do e-mail traz um código de uso único. Ele só é usado quando a pessoa
 * clica no botão: assim, programas que "abrem" links para checar vírus (comuns
 * em e-mails de empresa) não gastam o código antes da hora.
 */
export function ConfirmView() {
  const params = useSearchParams()
  const [state, action, pending] = useActionState(verifyEmailLinkAction, initial)
  const parsed = emailLinkSchema.safeParse({ token_hash: params.get('token_hash'), type: params.get('type') })

  if (!parsed.success) {
    return (
      <div className="login-form auth-panel" role="alert">
        <span className="auth-ico">
          <Icon name="CircleAlert" size={24} />
        </span>
        <h2>Link inválido</h2>
        <p>Este link está incompleto ou não é da Folyo. Abra de novo o último e-mail que enviamos, ou peça um novo.</p>
        <p className="muted small">
          <Link href="/entrar">Ir para entrar</Link> · <Link href="/esqueci-senha">Esqueci minha senha</Link>
        </p>
      </div>
    )
  }

  const recovery = parsed.data.type === 'recovery'
  return (
    <form className="login-form auth-panel" action={action}>
      <input type="hidden" name="token_hash" value={parsed.data.token_hash} />
      <input type="hidden" name="type" value={parsed.data.type} />
      <span className="auth-ico">
        <Icon name={recovery ? 'Lock' : 'CircleCheck'} size={24} />
      </span>
      <h2>{recovery ? 'Criar uma senha nova' : 'Confirmar seu e-mail'}</h2>
      <p>
        {recovery
          ? 'Clique no botão para continuar. Na próxima tela você escolhe a senha nova.'
          : 'Falta só um clique para ativar sua conta na Folyo.'}
      </p>
      <FormAlert message={state.message} />
      {state.message ? (
        <p className="muted small">
          <Link href="/entrar">Ir para entrar</Link> · <Link href="/esqueci-senha">Pedir um link novo</Link>
        </p>
      ) : (
        <SubmitButton pending={pending} pendingLabel="Confirmando…">
          {recovery ? 'Continuar' : 'Confirmar meu e-mail'}
        </SubmitButton>
      )}
    </form>
  )
}
