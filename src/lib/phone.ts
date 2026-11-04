import { formatPhoneBR } from '@/lib/format'

/**
 * Celular da conta (pedido na tela "Concluir cadastro"). Arquivo sem dependências de servidor: roda na tela e nas ações.
 *
 * Só números do Brasil, com DDD. Guardamos sempre no formato internacional (+55DDNNNNNNNNN), que é o que
 * serviços de WhatsApp e SMS esperam; na tela mostramos "(35) 99876-5432". O banco confere o mesmo formato
 * (supabase/migrations/20261104000002_dados_do_cadastro.sql).
 *
 * Não confundir com o "Telefone" do currículo (`phone` do perfil), que é texto livre e pode ficar vazio.
 */

/** DDDs que existem no Brasil (Anatel). */
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92,
  93, 94, 95, 96, 97, 98, 99,
])

/** Mesmo padrão do CHECK do banco: DDD + celular (9 e mais 8 dígitos) ou fixo (começa com 2 a 5, 8 dígitos). */
const ACCOUNT_PHONE = /^\+55([1-9]{2})(9\d{8}|[2-5]\d{7})$/

/**
 * Transforma o que a pessoa digitou em "+55DDNNNNNNNNN", ou null se não for um número brasileiro válido.
 * Aceita "(35) 99876-5432", "35998765432", "+55 35 99876-5432" e "055...". Não aceita outros países.
 */
export function normalizeAccountPhone(raw: string): string | null {
  const text = raw.trim()
  if (text.length > 30) return null
  let digits = text.replace(/\D/g, '')
  if (text.startsWith('+')) {
    if (!digits.startsWith('55')) return null
    digits = digits.slice(2)
  } else if (digits.length > 11) {
    // Colou com o código do país (55...) ou com o zero da operadora antes (055...).
    digits = digits.replace(/^0?55/, '')
  }
  const e164 = '+55' + digits
  const match = ACCOUNT_PHONE.exec(e164)
  if (!match || !DDDS.has(Number(match[1]))) return null
  return e164
}

/** "+5535998765432" → "(35) 99876-5432". Vazio continua vazio. */
export function formatAccountPhone(e164: string | null | undefined) {
  return e164 ? formatPhoneBR(e164.replace(/^\+55/, '')) : ''
}
