'use server'

import { redirect } from 'next/navigation'
import { safeNext } from '@/lib/auth/redirects'
import { getAccount, getSessionUser } from '@/lib/data/user'
import {
  AUTH_LIMITS,
  allow,
  allowShared,
  clientIp,
  hitShared,
  limitedShared,
  resetShared,
} from '@/lib/security/rate-limit'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  emailLinkSchema,
  emailOnlySchema,
  fieldErrors,
  loginSchema,
  resetPasswordSchema,
  signUpSchema,
} from '@/lib/validation'

/**
 * Ações de login (rodam SÓ no servidor).
 *
 * Cada ação é tratada como uma porta aberta para a internet: valida tudo de
 * novo com zod, nunca devolve detalhes técnicos e nunca guarda nem registra a
 * senha. As mensagens não revelam se um e-mail tem conta ou não, EXCETO ao criar
 * conta: ali avisamos que o e-mail já existe (decisão de produto; o CAPTCHA e o
 * limite por IP seguram quem tentar descobrir e-mails em massa).
 * Entrar, reenviar confirmação e esqueci a senha continuam com resposta igual.
 *
 * Proteção contra robôs, em camadas:
 *  1. CAPTCHA (Cloudflare Turnstile): o formulário traz um comprovante que o
 *     próprio Supabase confere (quando o CAPTCHA está ligado no painel dele);
 *  2. limite de tentativas por IP aqui no servidor (src/lib/security/rate-limit.ts);
 *  3. limites do próprio Supabase Auth.
 */

export type AuthFormState = {
  /** Erros por campo (ex.: { email: 'Digite um e-mail válido.' }). */
  errors?: Record<string, string>
  /** Erro geral do formulário. */
  message?: string
  /** E-mail enviado (confirmar conta ou criar nova senha). */
  sent?: { email: string }
  /** Senha alterada com sucesso. */
  done?: boolean
  /** Valores para preencher o formulário de novo (nunca a senha). */
  values?: { name?: string; email?: string }
}

const GENERIC = 'Não foi possível concluir agora. Tente de novo em alguns minutos.'
const TOO_MANY = 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.'
const CAPTCHA = 'Não conseguimos confirmar que você é uma pessoa. Espere a verificação terminar e tente de novo.'
const EMAIL_TAKEN = 'Já existe uma conta com esse e-mail. Tente entrar ou use "Esqueci minha senha".'

/** Traduz os códigos de erro do Supabase em mensagens amigáveis (e seguras). */
function friendly(code: string | undefined, status?: number) {
  switch (code) {
    case 'invalid_credentials':
      return 'E-mail ou senha incorretos.'
    case 'email_not_confirmed':
      return 'Confirme seu e-mail antes de entrar. Procure o link que enviamos (olhe também o spam).'
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return TOO_MANY
    case 'captcha_failed':
      return CAPTCHA
    case 'weak_password':
      return 'Essa senha é fácil de adivinhar. Escolha uma senha mais forte.'
    case 'same_password':
      return 'A nova senha precisa ser diferente da atual.'
    case 'user_already_exists':
    case 'email_exists':
      return 'Já existe uma conta com esse e-mail. Tente entrar.'
    case 'signup_disabled':
      return 'Os cadastros estão fechados no momento.'
    case 'user_banned':
      return 'Esta conta está bloqueada. Fale com a gente pelo contato@usefolyo.com.'
    case 'email_address_not_authorized':
      return 'Ainda não conseguimos enviar e-mails para esse endereço. O envio de e-mails da Folyo está em configuração.'
    case 'reauthentication_needed':
      return 'Por segurança, saia e entre de novo antes de trocar a senha.'
    default:
      // Registra só o código (nunca e-mail ou senha) para investigarmos depois.
      console.error('Erro do Supabase Auth', { code, status })
      return GENERIC
  }
}

const text = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '')

/** Comprovante do CAPTCHA que o widget da Cloudflare coloca no formulário (até 2048 caracteres). */
function captchaToken(formData: FormData) {
  const v = formData.get('cf-turnstile-response')
  return typeof v === 'string' && v.length > 0 && v.length <= 2048 ? v : undefined
}

/** Cliente do Supabase para as telas de entrada, com o IP real de quem pediu. */
async function authClient() {
  const ip = await clientIp()
  return { ip: ip ?? 'local', supabase: await createSupabaseServerClient({ clientIp: ip }) }
}

const isRateLimit = (code?: string) => code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit'

export async function signInAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const values = { email: text(formData.get('email')).slice(0, 254) }
  const parsed = loginSchema.safeParse({ email: formData.get('email'), password: formData.get('password') })
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values }

  const { ip, supabase } = await authClient()
  if (!(await allowShared('signin:' + ip, AUTH_LIMITS.signIn))) return { message: TOO_MANY, values }
  // Senha errada demais para este e-mail (de qualquer IP) ou vinda deste IP (para qualquer e-mail):
  // espera antes de tentar de novo.
  const account = 'signin-fail:' + parsed.data.email.toLowerCase()
  const fromIp = 'signin-ipfail:' + ip
  if ((await limitedShared(account, AUTH_LIMITS.signInFailures)) || (await limitedShared(fromIp, AUTH_LIMITS.signInIpFailures))) {
    return { message: TOO_MANY, values }
  }
  const { error } = await supabase.auth.signInWithPassword({ ...parsed.data, options: { captchaToken: captchaToken(formData) } })
  if (error) {
    // Só conta senha errada (CAPTCHA recusado ou limite do Supabase não contam).
    if (error.code === 'invalid_credentials') {
      await hitShared(account, AUTH_LIMITS.signInFailures)
      await hitShared(fromIp, AUTH_LIMITS.signInIpFailures)
    }
    return { message: friendly(error.code, error.status), values }
  }
  await resetShared(account, AUTH_LIMITS.signInFailures)

  redirect(safeNext(formData.get('next')))
}

export async function signUpAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const values = { name: text(formData.get('name')).slice(0, 80), email: text(formData.get('email')).slice(0, 254) }
  const parsed = signUpSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values }

  const { name, email, password } = parsed.data
  const { ip, supabase } = await authClient()
  if (!(await allowShared('signup:' + ip, AUTH_LIMITS.signUp))) return { message: TOO_MANY, values }
  // Cada cadastro dispara um e-mail de confirmação: limita por endereço, de qualquer IP.
  const target = 'signup-to:' + email.toLowerCase()
  if (await limitedShared(target, AUTH_LIMITS.signUpTarget)) return { message: TOO_MANY, values }
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name }, captchaToken: captchaToken(formData) },
  })
  // Só conta o que passou pelo CAPTCHA (senão qualquer um bloquearia o cadastro de outra pessoa).
  if (error?.code !== 'captcha_failed') await hitShared(target, AUTH_LIMITS.signUpTarget)
  if (error) {
    // Com a confirmação desligada, o Supabase avisa direto que o e-mail já existe.
    if (error.code === 'user_already_exists' || error.code === 'email_exists') {
      return { errors: { email: EMAIL_TAKEN }, values }
    }
    return { message: friendly(error.code, error.status), values }
  }

  // Com a confirmação por e-mail ligada, o Supabase NÃO devolve erro quando o e-mail já tem
  // conta confirmada: devolve um usuário "de mentira" sem nenhuma identidade (identities = [])
  // e não envia e-mail nenhum. Conferimos isso para avisar a pessoa em vez de dizer que enviamos.
  // (Conta criada mas ainda não confirmada vem com identidade: o Supabase reenvia o e-mail normalmente.)
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return { errors: { email: EMAIL_TAKEN }, values }
  }

  // Se a confirmação por e-mail estiver desligada no Supabase, a pessoa já entra direto.
  if (data.session) redirect('/primeiro-acesso')

  return { sent: { email } }
}

export async function resendConfirmationAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = emailOnlySchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) return { errors: fieldErrors(parsed.error) }

  const done = { sent: parsed.data, message: 'Pronto! Se o e-mail ainda não foi confirmado, um novo link está a caminho.' }
  const { ip, supabase } = await authClient()
  if (!(await allowShared('email:' + ip, AUTH_LIMITS.email))) return { sent: parsed.data, message: TOO_MANY }
  const target = 'to:' + parsed.data.email.toLowerCase()
  // Esse endereço já recebeu e-mails demais: responde igual, sem mandar outro.
  if (await limitedShared(target, AUTH_LIMITS.emailTarget)) return done

  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: parsed.data.email,
    options: { captchaToken: captchaToken(formData) },
  })
  if (isRateLimit(error?.code)) return { sent: parsed.data, message: TOO_MANY }
  if (error?.code === 'captcha_failed') return { sent: parsed.data, message: CAPTCHA }
  await hitShared(target, AUTH_LIMITS.emailTarget)
  return done
}

export async function requestPasswordResetAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const values = { email: text(formData.get('email')).slice(0, 254) }
  const parsed = emailOnlySchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values }

  const { ip, supabase } = await authClient()
  if (!(await allowShared('email:' + ip, AUTH_LIMITS.email))) return { message: TOO_MANY, values }
  const target = 'to:' + parsed.data.email.toLowerCase()
  // Esse endereço já recebeu e-mails demais: responde igual, sem mandar outro.
  if (await limitedShared(target, AUTH_LIMITS.emailTarget)) return { sent: parsed.data }

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    captchaToken: captchaToken(formData),
  })
  if (isRateLimit(error?.code)) return { message: TOO_MANY, values }
  if (error?.code === 'captcha_failed') return { message: CAPTCHA, values }
  await hitShared(target, AUTH_LIMITS.emailTarget)
  // Resposta igual exista ou não a conta.
  return { sent: parsed.data }
}

/** Confirma o link do e-mail. Só roda quando a pessoa clica no botão (leitores de link não "gastam" o link). */
export async function verifyEmailLinkAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = emailLinkSchema.safeParse({ token_hash: formData.get('token_hash'), type: formData.get('type') })
  if (!parsed.success) return { message: 'Este link não é válido. Peça um novo.' }
  const ip = await clientIp()
  if (ip && !(await allowShared('verify:' + ip, AUTH_LIMITS.verifyLink))) return { message: TOO_MANY }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.verifyOtp({ token_hash: parsed.data.token_hash, type: parsed.data.type })
  if (error) return { message: 'Este link expirou ou já foi usado. Peça um novo para continuar.' }

  if (parsed.data.type === 'recovery') redirect('/redefinir-senha')
  if (parsed.data.type === 'email_change') redirect('/configuracoes')
  redirect('/primeiro-acesso')
}

export async function updatePasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const user = await getSessionUser()
  if (!user) redirect('/entrar')

  const parsed = resetPasswordSchema.safeParse({ password: formData.get('password'), confirm: formData.get('confirm') })
  if (!parsed.success) return { errors: fieldErrors(parsed.error) }
  if (!allow('password:' + user.id, AUTH_LIMITS.updatePassword)) return { message: TOO_MANY }
  // Conta suspensa não troca a senha (nem mantém o acesso trocando a senha).
  if ((await getAccount()).suspended) redirect('/conta-suspensa')

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) return { message: friendly(error.code, error.status) }
  return { done: true }
}

/** Sai só deste aparelho. */
export async function signOutAction() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut({ scope: 'local' })
  redirect('/entrar')
}
