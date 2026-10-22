import 'server-only'
import { isIP } from 'node:net'
import { headers } from 'next/headers'
import { createLimiter, type Rule } from './limiter'

/**
 * IP de quem fez o pedido.
 *
 * Só confiamos no cabeçalho quando o site roda na Vercel: lá, a própria Vercel
 * escreve o "x-forwarded-for" com o IP real e apaga o que o navegador mandar
 * (ninguém consegue fingir outro IP). Fora da Vercel (no seu computador), devolve null.
 */
export async function clientIp(): Promise<string | null> {
  if (process.env.VERCEL !== '1') return null
  const h = await headers()
  const first = (h.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || h.get('x-real-ip')?.trim() || ''
  return isIP(first) ? first : null
}

/**
 * Limites das telas de entrada (por IP e, quando faz sentido, por e-mail).
 *
 * Isto é a camada de cima. As de baixo continuam valendo: o CAPTCHA (Cloudflare,
 * conferido pelo Supabase), os limites do próprio Supabase Auth e, para os dados
 * do aluno, o limite gravado no banco (etapa 3).
 */
// Os números por IP são folgados de propósito: uma sala de aula inteira pode sair
// pelo mesmo IP (rede da faculdade). Quem segura robô de verdade é o CAPTCHA.
export const AUTH_LIMITS = {
  signIn: { max: 30, windowMs: 5 * 60_000 },
  signUp: { max: 20, windowMs: 15 * 60_000 },
  /** E-mails (reenviar confirmação / esqueci a senha): por IP. */
  email: { max: 10, windowMs: 15 * 60_000 },
  /**
   * E-mails para o MESMO endereço: evita encher a caixa de alguém. Só conta pedidos
   * que passaram pelo CAPTCHA (senão qualquer um bloquearia o e-mail de outra pessoa).
   */
  emailTarget: { max: 3, windowMs: 15 * 60_000 },
  /** Trocar a senha (por aluno logado). */
  updatePassword: { max: 10, windowMs: 15 * 60_000 },
  /**
   * Senha errada para o MESMO e-mail, venha de qualquer IP. Segura quem tenta
   * adivinhar a senha de uma conta (por exemplo, a do proprietário) espalhando os
   * pedidos por vários IPs. Login certo zera a contagem.
   */
  signInFailures: { max: 10, windowMs: 15 * 60_000 },
} satisfies Record<string, Rule>

/* Contagem em memória, por servidor (veja limiter.ts). */
const limiter = createLimiter()
export const { hit, limited, allow, reset } = limiter
