/**
 * Camada de limite COMPARTILHADA entre os servidores (opcional).
 *
 * O limite em memória (limiter.ts) conta por servidor: na Vercel, cada instância tem a sua
 * contagem, então quem espalha os pedidos por várias instâncias passa do limite. Esta camada
 * guarda a contagem num Redis da Upstash (HTTP/REST, sem biblioteca), igual para todas as
 * instâncias. Ela é um REFORÇO: o limite em memória continua valendo por baixo.
 *
 * Só liga se as duas variáveis existirem (veja .env.example); sem elas, tudo segue como antes.
 * Se o Redis cair ou demorar, o pedido NÃO é barrado (falha aberta): o login não pode depender
 * de um serviço externo. Por isso o limite em memória e o CAPTCHA continuam sendo a base.
 *
 * Privacidade: a chave (que pode ter e-mail ou IP) vai para o Redis só como hash SHA-256.
 * Sem "server-only" de propósito: o proxy também usa este arquivo (e roda só no servidor).
 */
import { createHash } from 'node:crypto'
import type { Rule } from './limiter'

const TIMEOUT_MS = 1000

function config() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN
  if (!url || !token || !url.startsWith('https://')) return null
  return { url: url.replace(/\/+$/, ''), token }
}

/** A camada compartilhada está ligada? */
export const sharedLimitEnabled = () => config() !== null

/** Janela fixa: a chave muda a cada `windowMs`, então a contagem zera sozinha ao virar a janela. */
function redisKey(key: string, rule: Rule, now: number) {
  const hash = createHash('sha256').update(key).digest('hex').slice(0, 32)
  return `folyo:rl:${hash}:${Math.floor(now / rule.windowMs)}`
}

async function run(commands: (string | number)[][]): Promise<unknown[] | null> {
  const cfg = config()
  if (!cfg) return null
  try {
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) {
      console.error('Limite compartilhado indisponível', { status: res.status })
      return null
    }
    const rows = (await res.json()) as { result?: unknown; error?: string }[]
    if (!Array.isArray(rows) || rows.some((r) => r?.error)) {
      console.error('Limite compartilhado respondeu com erro')
      return null
    }
    return rows.map((r) => r.result)
  } catch (error) {
    console.error('Limite compartilhado indisponível', { name: error instanceof Error ? error.name : 'erro' })
    return null
  }
}

/** Conta uma tentativa e devolve quantas já houve na janela (null = camada desligada ou fora do ar). */
export async function sharedHit(key: string, rule: Rule, now = Date.now()): Promise<number | null> {
  const k = redisKey(key, rule, now)
  const out = await run([
    ['INCR', k],
    ['PEXPIRE', k, rule.windowMs],
  ])
  const count = Number(out?.[0])
  return Number.isFinite(count) ? count : null
}

/** Conta uma tentativa e diz se ainda está dentro do limite (sem Redis: sempre true). */
export async function sharedAllow(key: string, rule: Rule, now = Date.now()): Promise<boolean> {
  const count = await sharedHit(key, rule, now)
  return count === null || count <= rule.max
}

/** Já passou do limite? Só olha, não conta (sem Redis: false). */
export async function sharedLimited(key: string, rule: Rule, now = Date.now()): Promise<boolean> {
  const out = await run([['GET', redisKey(key, rule, now)]])
  const count = Number(out?.[0] ?? 0)
  return Number.isFinite(count) && count >= rule.max
}

/** Esquece as tentativas da janela atual (ex.: login deu certo). */
export async function sharedReset(key: string, rule: Rule, now = Date.now()): Promise<void> {
  await run([['DEL', redisKey(key, rule, now)]])
}
