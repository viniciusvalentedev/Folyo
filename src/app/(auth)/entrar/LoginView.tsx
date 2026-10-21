'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { MarkPath, Wordmark } from '@/components/brand/Logo'
import { Field, Seg } from '@/components/ui/controls'
import { Icon } from '@/components/ui/Icon'
import { siteConfig } from '@/lib/config'
import { fieldErrors, loginSchema, signUpSchema } from '@/lib/validation'

type Mode = 'entrar' | 'criar'

/**
 * Tela de entrada (entrar / criar conta).
 *
 * VERSÃO DE DEMONSTRAÇÃO: ainda não existe login de verdade. O formulário só
 * valida o formato dos dados e leva para a área de demonstração — nada do que
 * é digitado sai do navegador nem fica guardado.
 *
 * Próxima etapa: o envio chama o Supabase Auth (que cuida da senha com
 * segurança, confirmação de e-mail e limite de tentativas).
 */
export function LoginView() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('entrar')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const first = useRef<HTMLInputElement>(null)

  useEffect(() => {
    first.current?.focus()
  }, [mode])

  const switchMode = (m: Mode) => {
    setMode(m)
    setErrors({})
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const parsed =
      mode === 'criar'
        ? signUpSchema.safeParse({ name, email, password })
        : loginSchema.safeParse({ email, password })
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    setLoading(true)
    // Demonstração: em vez de autenticar, só segue para a área do aluno.
    setTimeout(() => {
      setPassword('')
      router.replace(mode === 'criar' ? '/primeiro-acesso' : '/inicio')
    }, 450)
  }

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

      <section className="login-form-wrap">
        <form className="login-form" onSubmit={submit} noValidate>
          <Seg
            label="Entrar ou criar conta"
            value={mode}
            onChange={switchMode}
            options={[
              { value: 'entrar', label: 'Entrar' },
              { value: 'criar', label: 'Criar conta' },
            ]}
          />
          <div>
            <h2>{mode === 'criar' ? 'Criar sua conta' : 'Entrar'}</h2>
            <p className="muted">
              {mode === 'criar' ? 'Leva menos de um minuto. Depois, você escolhe seu objetivo.' : 'Bom te ver de novo.'}
            </p>
          </div>

          {mode === 'criar' && (
            <Field label="Nome" id="lg-name" error={errors.name}>
              <input
                ref={first}
                id="lg-name"
                className="inp"
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                aria-invalid={!!errors.name}
              />
            </Field>
          )}
          <Field label="E-mail" id="lg-email" error={errors.email}>
            <input
              ref={mode === 'entrar' ? first : undefined}
              id="lg-email"
              type="email"
              className="inp"
              value={email}
              maxLength={254}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              aria-invalid={!!errors.email}
            />
          </Field>
          <Field
            label="Senha"
            id="lg-pw"
            error={errors.password}
            hint={mode === 'criar' ? 'Pelo menos 6 caracteres.' : undefined}
          >
            <input
              id="lg-pw"
              type="password"
              className="inp"
              value={password}
              maxLength={128}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'criar' ? 'new-password' : 'current-password'}
              aria-invalid={!!errors.password}
            />
          </Field>

          <button type="submit" className={'btn btn-primary btn-lg w-full' + (loading ? ' loading' : '')} disabled={loading}>
            {loading ? (
              <>
                <span className="spinner" />
                {mode === 'criar' ? 'Criando conta…' : 'Entrando…'}
              </>
            ) : (
              <span>{mode === 'criar' ? 'Criar conta' : 'Entrar'}</span>
            )}
          </button>

          <p className="alert alert-info login-alert">
            <Icon name="FlaskConical" size={16} />
            <span>
              <b>Versão de demonstração.</b> Ainda não há login de verdade: preencha qualquer e-mail e senha para
              conhecer a área do aluno. Nada do que você digita aqui é enviado ou guardado.
            </span>
          </p>
        </form>
      </section>
    </div>
  )
}
