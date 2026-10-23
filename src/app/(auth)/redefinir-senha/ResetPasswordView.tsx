'use client'

import { useActionState } from 'react'
import { ButtonLink } from '@/components/ui/Button'
import { Field } from '@/components/ui/controls'
import { Icon } from '@/components/ui/Icon'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { updatePasswordAction, type AuthFormState } from '../actions'
import { FormAlert, SubmitButton } from '../AuthShell'

const initial: AuthFormState = {}

export function ResetPasswordView({ email }: { email: string }) {
  const [state, action, pending] = useActionState(updatePasswordAction, initial)

  if (state.done) {
    return (
      <div className="login-form auth-panel" role="status">
        <span className="auth-ico">
          <Icon name="CircleCheck" size={24} />
        </span>
        <h2>Senha alterada</h2>
        <p>Pronto! Da próxima vez, entre com a senha nova.</p>
        <ButtonLink href="/inicio" iconRight="ArrowRight">
          Ir para o início
        </ButtonLink>
      </div>
    )
  }

  const errors = state.errors ?? {}
  return (
    <form className="login-form" action={action} noValidate>
      <div>
        <h2>Nova senha</h2>
        <p className="muted">
          Escolha uma senha nova para <b>{email}</b>.
        </p>
      </div>
      {/* Ajuda o gerenciador de senhas a salvar a senha na conta certa. */}
      <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
      <Field label="Senha nova" id="rp-pw" error={errors.password} hint="Pelo menos 8 caracteres.">
        <PasswordInput
          id="rp-pw"
          name="password"
          maxLength={72}
          autoComplete="new-password"
          autoFocus
          aria-invalid={!!errors.password}
        />
      </Field>
      <Field label="Repita a senha nova" id="rp-confirm" error={errors.confirm}>
        <PasswordInput
          id="rp-confirm"
          name="confirm"
          maxLength={72}
          autoComplete="new-password"
          aria-invalid={!!errors.confirm}
        />
      </Field>
      <FormAlert message={state.message} />
      <SubmitButton pending={pending} pendingLabel="Salvando…">
        Salvar senha nova
      </SubmitButton>
    </form>
  )
}
