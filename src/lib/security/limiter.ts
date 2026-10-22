/**
 * Contador de tentativas em memória (por servidor). Sem dependências: é usado
 * tanto pelo proxy (todas as rotas) quanto pelas Server Actions.
 *
 * Na Vercel, cada servidor que estiver de pé tem a sua contagem (não é um limite
 * global exato), mas já corta quem fica martelando. O tamanho é limitado para não
 * gastar memória.
 */

export type Rule = { max: number; windowMs: number }

const MAX_KEYS = 20_000

export function createLimiter() {
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

  /** Conta uma tentativa e devolve quantas já houve na janela. */
  function hit(key: string, rule: Rule, now = Date.now()) {
    const entry = hits.get(key)
    if (!entry || entry.resetAt <= now) {
      if (hits.size >= MAX_KEYS) sweep(now)
      hits.set(key, { count: 1, resetAt: now + rule.windowMs })
      return 1
    }
    return ++entry.count
  }

  /** Já passou do limite? (só olha, não conta) */
  function limited(key: string, rule: Rule, now = Date.now()) {
    const entry = hits.get(key)
    return !!entry && entry.resetAt > now && entry.count >= rule.max
  }

  /** Conta uma tentativa e diz se ela ainda está dentro do limite. */
  function allow(key: string, rule: Rule, now = Date.now()) {
    return hit(key, rule, now) <= rule.max
  }

  /** Esquece as tentativas (ex.: login deu certo). */
  function reset(key: string) {
    hits.delete(key)
  }

  return { hit, limited, allow, reset }
}
