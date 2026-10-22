'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { Field } from '@/components/ui/controls'
import { Icon } from '@/components/ui/Icon'
import { requestPasswordResetAction, type AuthFormState } from '../actions'
import { FormAlert, SubmitButton } from '../AuthShell'
import { Captcha, captchaEnabled } from '../Captcha'

const initial: AuthFormState = {}

/** Pede o link para criar uma senha nova. A resposta é a mesma exista a conta ou não. */
export function ForgotPasswordView() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, initial)
  const [human, setHuman] = useState(!captchaEnabled)

  if (state.sent) {
    return (
      <div className="login-form auth-panel" role="status">
        <span className="auth-ico">
          <Icon name="Mail" size={24} />
        </span>
        <h2>Confira seu e-mail</h2>
        <p>
          Se existir uma conta com <b>{state.sent.email}</b>, enviamos um link para você criar uma senha nova. O link
          vale por 1 hora. Não chegou? Olhe a caixa de spam.
        </p>
        <p className="muted small">
          <Link href="/entrar">Voltar para entrar</Link>
        </p>
      </div>
    )
  }

  const errors = state.errors ?? {}
  return (
    <form className="login-form" action={action} noValidate>
      <div>
        <h2>Esqueci minha senha</h2>
        <p className="muted">Digite o e-mail da sua conta. Vamos te mandar um link para criar uma senha nova.</p>
      </div>
      <Field label="E-mail" id="fp-email" error={errors.email}>
        <input
          id="fp-email"
          name="email"
          type="email"
          className="inp"
          maxLength={254}
          autoComplete="email"
          autoFocus
          defaultValue={state.values?.email}
          aria-invalid={!!errors.email}
        />
      </Field>
      <FormAlert message={state.message} />
      <Captcha action="reset" resetSignal={state} onReady={setHuman} />
      <SubmitButton pending={pending} disabled={!human} pendingLabel="Enviando…">
        Enviar link
      </SubmitButton>
      <p className="muted small">
        Lembrou a senha? <Link href="/entrar">Voltar para entrar</Link>
      </p>
    </form>
  )
}
