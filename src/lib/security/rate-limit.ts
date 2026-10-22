import 'server-only'
import { isIP } from 'node:net'
import { headers } from 'next/headers'

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

type Rule = { max: number; windowMs: number }

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
} satisfies Record<string, Rule>

/*
 * Contagem em memória, por servidor. Na Vercel, cada servidor que estiver de pé
 * tem a sua contagem (não é um limite global exato), mas já corta quem fica
 * martelando o mesmo formulário. O tamanho é limitado para não gastar memória.
 */
const MAX_KEYS = 10_000
const hits = new Map<string, { count: number; resetAt: number }>()

function sweep(now: number) {
  for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key)
  // Ainda cheio (muitos IPs diferentes): descarta os mais antigos.
  while (hits.size >= MAX_KEYS) {
    const oldest = hits.keys().next().value
    if (oldest === undefined) break
    hits.delete(oldest)
  }
}

/** Conta uma tentativa. */
export function hit(key: string, rule: Rule, now = Date.now()) {
  const entry = hits.get(key)
  if (!entry || entry.resetAt <= now) {
    if (hits.size >= MAX_KEYS) sweep(now)
    hits.set(key, { count: 1, resetAt: now + rule.windowMs })
    return 1
  }
  return ++entry.count
}

/** Já passou do limite? (só olha, não conta) */
export function limited(key: string, rule: Rule, now = Date.now()) {
  const entry = hits.get(key)
  return !!entry && entry.resetAt > now && entry.count >= rule.max
}

/** Conta uma tentativa e diz se ela ainda está dentro do limite. */
export function allow(key: string, rule: Rule, now = Date.now()) {
  return hit(key, rule, now) <= rule.max
}
