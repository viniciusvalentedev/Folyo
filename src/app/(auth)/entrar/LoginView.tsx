'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useActionState, useEffect, useRef, useState } from 'react'
import { Field, Seg } from '@/components/ui/controls'
import { Icon } from '@/components/ui/Icon'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { resendConfirmationAction, signInAction, signUpAction, type AuthFormState } from '../actions'
import { FormAlert, SubmitButton } from '../AuthShell'
import { Captcha, captchaEnabled } from '../Captcha'

type Mode = 'entrar' | 'criar'
const initial: AuthFormState = {}

/** Depois de criar a conta: pede para a pessoa confirmar o e-mail. */
function CheckEmail({ email, onBack }: { email: string; onBack: () => void }) {
  const [state, resend, pending] = useActionState(resendConfirmationAction, initial)
  const [human, setHuman] = useState(!captchaEnabled)
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
          <Captcha action="resend" resetSignal={state} onReady={setHuman} />
          <button type="submit" className="btn btn-quiet btn-md" disabled={pending || !human}>
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
  const deleted = params.get('conta') === 'excluida'
  const [mode, setMode] = useState<Mode>(params.get('modo') === 'criar' ? 'criar' : 'entrar')
  const [loginState, login, loginPending] = useActionState(signInAction, initial)
  const [signupState, signup, signupPending] = useActionState(signUpAction, initial)
  const [showSent, setShowSent] = useState(true)
  const [human, setHuman] = useState(!captchaEnabled)
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

      {deleted && !creating && (
        <p className="alert alert-info" role="status">
          <Icon name="Check" size={16} />
          <span>Sua conta e seus dados foram excluídos. Obrigado por ter passado por aqui.</span>
        </p>
      )}

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
        <PasswordInput
          id="lg-pw"
          name="password"
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

      <Captcha action={creating ? 'signup' : 'login'} resetSignal={state} onReady={setHuman} />

      <SubmitButton
        disabled={!human}
        pending={creating ? signupPending : loginPending}
        pendingLabel={creating ? 'Criando conta…' : 'Entrando…'}
      >
        {creating ? 'Criar conta' : 'Entrar'}
      </SubmitButton>

      <p className="muted small">
        {creating ? 'Ao criar a conta, você concorda com os ' : 'Ao entrar, você concorda com os '}
        <Link href="/termos" target="_blank">
          Termos de Uso
        </Link>{' '}
        e com a{' '}
        <Link href="/privacidade" target="_blank">
          Política de Privacidade
        </Link>
        .{creating && ' Você pode baixar ou apagar seus dados quando quiser.'}
      </p>
    </form>
  )
}
