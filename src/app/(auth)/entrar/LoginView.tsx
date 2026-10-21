'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useActionState, useEffect, useRef, useState } from 'react'
import { Field, Seg } from '@/components/ui/controls'
import { Icon } from '@/components/ui/Icon'
import { resendConfirmationAction, signInAction, signUpAction, type AuthFormState } from '../actions'
import { FormAlert, SubmitButton } from '../AuthShell'

type Mode = 'entrar' | 'criar'
const initial: AuthFormState = {}

/** Depois de criar a conta: pede para a pessoa confirmar o e-mail. */
function CheckEmail({ email, onBack }: { email: string; onBack: () => void }) {
  const [state, resend, pending] = useActionState(resendConfirmationAction, initial)
  return (
    <div className="login-form auth-panel" role="status">
      <span className="auth-ico">
        <Icon name="Mail" size={24} />
      </span>
      <h2>Confira seu e-mail</h2>
      <p>
        Enviamos um link para <b>{email}</b>. Abra o e-mail e clique em <b>Confirmar meu e-mail</b> para ativar sua
        conta. Não chegou? Olhe a caixa de spam.
      </p>
      {state.message && <p className="alert alert-info login-alert">{state.message}</p>}
      <div className="auth-actions">
        <form action={resend}>
          <input type="hidden" name="email" value={email} />
          <button type="submit" className="btn btn-quiet btn-md" disabled={pending}>
            <Icon name="Send" size={17} />
            <span>{pending ? 'Reenviando…' : 'Reenviar e-mail'}</span>
          </button>
        </form>
        <button type="button" className="link-btn" onClick={onBack}>
          Voltar para entrar
        </button>
      </div>
    </div>
  )
}

/** Tela de entrar e criar conta (fala com o Supabase só pelo servidor). */
export function LoginView() {
  const params = useSearchParams()
  const next = params.get('next') ?? ''
  const [mode, setMode] = useState<Mode>(params.get('modo') === 'criar' ? 'criar' : 'entrar')
  const [loginState, login, loginPending] = useActionState(signInAction, initial)
  const [signupState, signup, signupPending] = useActionState(signUpAction, initial)
  const [showSent, setShowSent] = useState(true)
  const first = useRef<HTMLInputElement>(null)

  useEffect(() => {
    first.current?.focus()
  }, [mode])

  if (signupState.sent && showSent) {
    return (
      <CheckEmail
        email={signupState.sent.email}
        onBack={() => {
          setShowSent(false)
          setMode('entrar')
        }}
      />
    )
  }

  const creating = mode === 'criar'
  const state = creating ? signupState : loginState
  const errors = state.errors ?? {}

  return (
    <form
      key={mode}
      className="login-form"
      action={creating ? signup : login}
      onSubmit={() => setShowSent(true)}
      noValidate
    >
      <Seg
        label="Entrar ou criar conta"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'entrar', label: 'Entrar' },
          { value: 'criar', label: 'Criar conta' },
        ]}
      />
      <div>
        <h2>{creating ? 'Criar sua conta' : 'Entrar'}</h2>
        <p className="muted">
          {creating ? 'Leva menos de um minuto. Depois, você escolhe seu objetivo.' : 'Bom te ver de novo.'}
        </p>
      </div>

      {!creating && next && <input type="hidden" name="next" value={next} />}

      {creating && (
        <Field label="Nome" id="lg-name" error={errors.name}>
          <input
            ref={first}
            id="lg-name"
            name="name"
            className="inp"
            maxLength={80}
            autoComplete="name"
            defaultValue={state.values?.name}
            aria-invalid={!!errors.name}
          />
        </Field>
      )}
      <Field label="E-mail" id="lg-email" error={errors.email}>
        <input
          ref={creating ? undefined : first}
          id="lg-email"
          name="email"
          type="email"
          className="inp"
          maxLength={254}
          autoComplete="email"
          defaultValue={state.values?.email}
          aria-invalid={!!errors.email}
        />
      </Field>
      <Field label="Senha" id="lg-pw" error={errors.password} hint={creating ? 'Pelo menos 8 caracteres.' : undefined}>
        <input
          id="lg-pw"
          name="password"
          type="password"
          className="inp"
          maxLength={72}
          autoComplete={creating ? 'new-password' : 'current-password'}
          aria-invalid={!!errors.password}
        />
      </Field>
      {!creating && (
        <p className="login-row">
          <Link href="/esqueci-senha">Esqueci minha senha</Link>
        </p>
      )}

      <FormAlert message={state.message} />

      <SubmitButton
        pending={creating ? signupPending : loginPending}
        pendingLabel={creating ? 'Criando conta…' : 'Entrando…'}
      >
        {creating ? 'Criar conta' : 'Entrar'}
      </SubmitButton>

      {creating && (
        <p className="muted small">
          Ao criar a conta, você concorda em usar a Folyo de forma respeitosa. Seus dados ficam protegidos e você pode
          pedir para apagá-los quando quiser.
        </p>
      )}
    </form>
  )
}
