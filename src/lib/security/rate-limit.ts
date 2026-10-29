import 'server-only'
import { isIP } from 'node:net'
import { headers } from 'next/headers'
import { createLimiter, type Rule } from './limiter'
import { sharedAllow, sharedHit, sharedLimited, sharedReset } from './shared-limit'

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
  /** Cadastros com o MESMO e-mail (cada um dispara um e-mail de confirmação): por endereço, de qualquer IP. */
  signUpTarget: { max: 5, windowMs: 15 * 60_000 },
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
  /**
   * Senha errada vinda do MESMO IP (para qualquer e-mail): segura quem testa várias contas.
   * Folgado, porque uma sala inteira pode sair pelo mesmo IP e errar a senha de vez em quando.
   */
  signInIpFailures: { max: 25, windowMs: 15 * 60_000 },
  /** Confirmar o link do e-mail (por IP). O link já é longo e de uso único; isto só corta a insistência. */
  verifyLink: { max: 20, windowMs: 15 * 60_000 },
  /** Cadastrar o aplicativo autenticador (por conta da equipe). */
  mfaEnroll: { max: 10, windowMs: 15 * 60_000 },
  /**
   * Código do autenticador errado (por conta, de qualquer IP). O código tem só 6 números,
   * então o limite é baixo; acertar zera a contagem. O Supabase tem o limite dele também.
   */
  mfaFailures: { max: 8, windowMs: 10 * 60_000 },
  /** Baixar os próprios dados (LGPD), por conta. */
  accountExport: { max: 5, windowMs: 15 * 60_000 },
  /** Excluir a própria conta (LGPD), por conta: cada pedido conta, certo ou errado. */
  accountDelete: { max: 5, windowMs: 15 * 60_000 },
  /** Escolher ou trocar o endereço do perfil público, por conta (o banco ainda segura trocas seguidas). */
  slugChange: { max: 10, windowMs: 15 * 60_000 },
} satisfies Record<string, Rule>

/** Limites das rotas /api (por conta logada). */
export const API_LIMITS = {
  /** Abrir ou baixar PDFs (trabalhos, materiais, mídia do painel): folgado para uso normal, corta robô. */
  download: { max: 120, windowMs: 60_000 },
  /** PDFs do perfil público (visitantes, sem login): por IP. */
  publicDownload: { max: 60, windowMs: 60_000 },
} satisfies Record<string, Rule>

/* Contagem em memória, por servidor (veja limiter.ts). */
const limiter = createLimiter()
export const { hit, limited, allow, reset } = limiter

/*
 * Versões "reforçadas": contam em memória E, se a Upstash estiver ligada (shared-limit.ts),
 * também no Redis compartilhado entre os servidores. Usadas nas telas de entrada, onde um
 * limite por servidor é pouco. Sem a Upstash, o comportamento é o de sempre (só memória).
 */

/** Conta uma tentativa e diz se ainda está dentro do limite. */
export async function allowShared(key: string, rule: Rule): Promise<boolean> {
  if (!allow(key, rule)) return false
  return sharedAllow(key, rule)
}

/** Já passou do limite? (só olha) */
export async function limitedShared(key: string, rule: Rule): Promise<boolean> {
  return limited(key, rule) || (await sharedLimited(key, rule))
}

/** Conta uma tentativa (ex.: senha errada). */
export async function hitShared(key: string, rule: Rule): Promise<void> {
  hit(key, rule)
  await sharedHit(key, rule)
}

/** Esquece as tentativas (ex.: login deu certo). */
export async function resetShared(key: string, rule: Rule): Promise<void> {
  reset(key)
  await sharedReset(key, rule)
}
