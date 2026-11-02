import { z } from 'zod'
import { ID_PATTERN } from '@/lib/admin/catalog'
import { formatBRL } from '@/lib/cart'
import { longDate, orderNumber } from '@/lib/payments/order'

/**
 * E-mail de recibo da compra (texto puro, sem dependência de servidor: dá para testar e pré-visualizar).
 *
 * Segurança do conteúdo:
 *  - Tudo que vem de fora (nome da pessoa, título do curso) passa por `esc()` antes de entrar no HTML.
 *  - Os links são SEMPRE montados a partir do endereço do nosso site e de ids de curso validados. Nada que vem do
 *    pedido vira link por conta própria.
 *  - O recibo não leva dado de pagamento: nem id do pagamento, nem meio de pagamento, nem token.
 */

const MAX_ITEMS = 50

/** O que o banco devolve em claim_order_receipt. */
export const receiptSchema = z.object({
  orderId: z.uuid(),
  email: z.email().max(254),
  name: z.string().max(200).nullable(),
  totalCents: z.number().int().min(1).max(100_000_000),
  paidAt: z.string().max(64).nullable(),
  items: z.array(z.object({ courseId: z.string().max(40), title: z.string().max(200), priceCents: z.number().int().min(1) })).min(1).max(MAX_ITEMS),
})
export type ReceiptData = z.infer<typeof receiptSchema>

export { longDate, orderNumber }

export type ReceiptEmail = { subject: string; html: string; text: string }

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
/** Escapa texto para dentro de HTML (conteúdo e atributos). */
export const esc = (value: string) => value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c])

/** Quebras de linha e caracteres de controle viram espaço (títulos e nomes cabem numa linha só). */
const oneLine = (value: string) => value.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').trim()

/** Primeiro nome para o cumprimento ("Ana Souza" → "Ana"); nulo se não houver nome utilizável. */
export function firstName(name: string | null | undefined): string | null {
  const first = oneLine(name ?? '').split(/\s+/)[0] ?? ''
  return first ? first.slice(0, 40) : null
}

/** Endereço do curso no site, ou null se o id não for um id de curso válido. */
function courseUrl(siteUrl: string, courseId: string) {
  return ID_PATTERN.test(courseId) ? `${siteUrl}/cursos/${courseId}` : null
}

export function buildReceiptEmail(data: ReceiptData, opts: { siteUrl: string; supportEmail: string }): ReceiptEmail {
  const site = opts.siteUrl.replace(/\/+$/, '')
  const many = data.items.length > 1
  const name = firstName(data.name)
  const number = orderNumber(data.orderId)
  const date = longDate(data.paidAt)
  const total = formatBRL(data.totalCents)
  const items = data.items.map((i) => ({ title: oneLine(i.title) || 'Curso', price: formatBRL(i.priceCents), url: courseUrl(site, i.courseId) }))

  // Um curso: o botão abre o curso. Vários: abre "Minhas compras", onde cada um tem o seu botão.
  const accessUrl = !many && items[0].url ? items[0].url : `${site}/compras`
  const accessLabel = many ? 'Acessar meus cursos' : 'Acessar meu curso'
  const purchasesUrl = `${site}/compras`
  const termsUrl = `${site}/termos`

  const subject = many ? 'Pagamento confirmado: seus cursos estão liberados' : 'Pagamento confirmado: seu curso está liberado'
  const greeting = name ? `Obrigado pela compra, ${name}!` : 'Obrigado pela compra!'
  const lead = many
    ? 'Recebemos o seu pagamento e os seus cursos já estão liberados. É só entrar na sua conta para começar.'
    : 'Recebemos o seu pagamento e o seu curso já está liberado. É só entrar na sua conta para começar.'

  const rows = items
    .map(
      (i) => `<tr>
<td style="padding:12px 0;border-top:1px solid #E6E4F0;font-size:15px;line-height:1.4;color:#12121B;">${
        i.url ? `<a href="${esc(i.url)}" style="color:#2D24C8;text-decoration:none;font-weight:600;">${esc(i.title)}</a>` : `<b>${esc(i.title)}</b>`
      }</td>
<td align="right" style="padding:12px 0 12px 16px;border-top:1px solid #E6E4F0;font-size:15px;color:#12121B;white-space:nowrap;">${esc(i.price)}</td>
</tr>`,
    )
    .join('\n')

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#F5F4FA;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(lead)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F4FA;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<tr><td style="background:#0B0B12;border-radius:16px 16px 0 0;padding:22px 28px;font-size:22px;font-weight:700;letter-spacing:-0.5px;color:#C9E23F;">Folyo</td></tr>
<tr><td style="background:#FFFFFF;padding:32px 28px 8px;">
<h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#0B0B12;">${esc(greeting)}</h1>
<p style="margin:0 0 24px;font-size:16px;line-height:1.55;color:#34344A;">${esc(lead)}</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:12px;background:#C9E23F;"><a href="${esc(accessUrl)}" style="display:inline-block;padding:14px 26px;font-size:16px;font-weight:700;color:#0B0B12;text-decoration:none;">${esc(accessLabel)}</a></td></tr></table>
</td></tr>
<tr><td style="background:#FFFFFF;padding:28px 28px 8px;">
<p style="margin:0 0 4px;font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:#6B6985;">Recibo da compra</p>
<p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#34344A;">Pedido <b>${esc(number)}</b>${date ? ` · ${esc(date)}` : ''}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${rows}
<tr>
<td style="padding:14px 0 4px;border-top:2px solid #0B0B12;font-size:16px;font-weight:700;color:#0B0B12;">Total pago</td>
<td align="right" style="padding:14px 0 4px 16px;border-top:2px solid #0B0B12;font-size:16px;font-weight:700;color:#0B0B12;white-space:nowrap;">${esc(total)}</td>
</tr>
</table>
</td></tr>
<tr><td style="background:#FFFFFF;border-radius:0 0 16px 16px;padding:20px 28px 30px;font-size:13px;line-height:1.6;color:#6B6985;">
<p style="margin:0 0 10px;">Guarde este e-mail como comprovante da sua compra. O pagamento foi processado pelo Mercado Pago.</p>
<p style="margin:0 0 10px;">Você encontra todas as suas compras em <a href="${esc(purchasesUrl)}" style="color:#2D24C8;">Minhas compras</a>. Sobre cancelamento e reembolso, veja os <a href="${esc(termsUrl)}" style="color:#2D24C8;">Termos de Uso</a>.</p>
<p style="margin:0;">Dúvidas? Responda este e-mail ou escreva para <a href="mailto:${esc(opts.supportEmail)}" style="color:#2D24C8;">${esc(opts.supportEmail)}</a> e cite o pedido ${esc(number)}.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

  const textItems = items.map((i) => `- ${i.title}: ${i.price}${i.url ? `\n  ${i.url}` : ''}`).join('\n')
  const text = [
    greeting,
    '',
    lead,
    '',
    `${accessLabel}: ${accessUrl}`,
    '',
    `RECIBO DA COMPRA`,
    `Pedido ${number}${date ? ` · ${date}` : ''}`,
    textItems,
    `Total pago: ${total}`,
    '',
    'Guarde este e-mail como comprovante da sua compra. O pagamento foi processado pelo Mercado Pago.',
    `Todas as suas compras: ${purchasesUrl}`,
    `Cancelamento e reembolso: ${termsUrl}`,
    `Dúvidas? Responda este e-mail ou escreva para ${opts.supportEmail} e cite o pedido ${number}.`,
  ].join('\n')

  return { subject, html, text }
}
