'use client'

import { useActionState } from 'react'
import { Field } from '@/components/ui/controls'
import { Icon } from '@/components/ui/Icon'
import { signOutAction } from '../../actions'
import { FormAlert, SubmitButton } from '../../AuthShell'
import { startEnrollAction, verifyMfaAction, type MfaFormState } from './actions'

const initial: MfaFormState = {}

function SignOut() {
  return (
    <form action={signOutAction} className="mfa-signout">
      <button type="submit" className="link-btn">
        Sair desta conta
      </button>
    </form>
  )
}

/**
 * Verificação em duas etapas da equipe: cadastrar o aplicativo autenticador (primeira vez) ou
 * digitar o código dele (nas próximas entradas no painel).
 */
export function MfaView({ email, next, factorId }: { email: string; next: string; factorId: string | null }) {
  const [enrollState, startEnroll, enrolling] = useActionState(startEnrollAction, initial)
  const [verifyState, verify, verifying] = useActionState(verifyMfaAction, initial)

  const enroll = enrollState.enroll
  const activeFactor = factorId ?? enroll?.factorId ?? null
  const errors = verifyState.errors ?? {}

  // Primeira vez: ainda não há autenticador nem QR code gerado.
  if (!activeFactor) {
    return (
      <div className="mfa-wrap">
        <div className="login-form auth-panel">
          <span className="auth-ico">
            <Icon name="ShieldCheck" size={24} />
          </span>
          <h2>Proteja o painel com a verificação em duas etapas</h2>
          <p>
            Para usar o painel, sua conta precisa de um segundo passo além da senha: um código de 6 números gerado por um
            aplicativo autenticador no seu celular (Google Authenticator, Microsoft Authenticator, 1Password, Authy…).
            Leva um minuto.
          </p>
          <FormAlert message={enrollState.message} />
          <form action={startEnroll}>
            <SubmitButton pending={enrolling} pendingLabel="Preparando…">
              Configurar aplicativo autenticador
            </SubmitButton>
          </form>
        </div>
        <SignOut />
      </div>
    )
  }

  return (
    <div className="mfa-wrap">
      <form className="login-form" action={verify} noValidate>
        <div>
          <h2>{enroll ? 'Escaneie o QR code' : 'Digite o código'}</h2>
          {enroll ? (
            <p className="muted">
              No aplicativo autenticador, escolha adicionar conta e aponte a câmera para o QR code. Depois digite o código
              de 6 números que aparecer.
            </p>
          ) : (
            <p className="muted">
              Abra o aplicativo autenticador e digite o código de 6 números da conta <b>Folyo</b> ({email}).
            </p>
          )}
        </div>

        {enroll && (
          <div className="mfa-setup">
            {/* O QR code vem do Supabase como imagem "data:" (conferida no servidor): não há o que otimizar. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="mfa-qr"
              src={enroll.qr}
              alt="QR code para cadastrar o aplicativo autenticador"
              width={200}
              height={200}
            />
            <details className="mfa-manual">
              <summary>Não consegue ler o QR code?</summary>
              <p>Digite esta chave no aplicativo:</p>
              <code className="mfa-secret">{enroll.secret}</code>
            </details>
          </div>
        )}

        <input type="hidden" name="factorId" value={activeFactor} />
        <input type="hidden" name="next" value={next} />
        <Field label="Código de 6 números" id="mfa-code" error={errors.code}>
          <input
            id="mfa-code"
            name="code"
            className="inp mfa-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={10}
            autoFocus
            aria-invalid={!!errors.code}
          />
        </Field>

        <FormAlert message={verifyState.message} />
        <SubmitButton pending={verifying} pendingLabel="Verificando…">
          Confirmar
        </SubmitButton>
      </form>
      <SignOut />
    </div>
  )
}
