'use server'

import { redirect } from 'next/navigation'
import { safeNext } from '@/lib/auth/redirects'
import { getSessionUser } from '@/lib/data/user'
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
 * senha. As mensagens não revelam se um e-mail tem conta ou não.
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

/** Traduz os códigos de erro do Supabase em mensagens amigáveis (e seguras). */
function friendly(code: string | undefined, status?: number) {
  switch (code) {
    case 'invalid_credentials':
      return 'E-mail ou senha incorretos.'
    case 'email_not_confirmed':
      return 'Confirme seu e-mail antes de entrar. Procure o link que enviamos (olhe também o spam).'
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.'
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

export async function signInAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const values = { email: text(formData.get('email')).slice(0, 254) }
  const parsed = loginSchema.safeParse({ email: formData.get('email'), password: formData.get('password') })
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { message: friendly(error.code, error.status), values }

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
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name } } })
  if (error) return { message: friendly(error.code, error.status), values }

  // Se a confirmação por e-mail estiver desligada no Supabase, a pessoa já entra direto.
  if (data.session) redirect('/primeiro-acesso')

  // Mesmo se o e-mail já tiver conta, a resposta é igual: ninguém descobre quem é aluno da Folyo.
  return { sent: { email } }
}

export async function resendConfirmationAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = emailOnlySchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) return { errors: fieldErrors(parsed.error) }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.resend({ type: 'signup', email: parsed.data.email })
  if (error?.code === 'over_email_send_rate_limit' || error?.code === 'over_request_rate_limit') {
    return { sent: parsed.data, message: friendly(error.code) }
  }
  return { sent: parsed.data, message: 'Pronto! Se o e-mail ainda não foi confirmado, um novo link está a caminho.' }
}

export async function requestPasswordResetAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const values = { email: text(formData.get('email')).slice(0, 254) }
  const parsed = emailOnlySchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email)
  if (error?.code === 'over_email_send_rate_limit' || error?.code === 'over_request_rate_limit') {
    return { message: friendly(error.code), values }
  }
  // Resposta igual exista ou não a conta.
  return { sent: parsed.data }
}

/** Confirma o link do e-mail. Só roda quando a pessoa clica no botão (leitores de link não "gastam" o link). */
export async function verifyEmailLinkAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = emailLinkSchema.safeParse({ token_hash: formData.get('token_hash'), type: formData.get('type') })
  if (!parsed.success) return { message: 'Este link não é válido. Peça um novo.' }

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
