'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckoutHeader } from '@/components/cart/CartParts'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Field, Tabs } from '@/components/ui/controls'
import { Icon } from '@/components/ui/Icon'
import { checkPaymentAction, orderStatusAction, payOrderAction } from '@/lib/actions/checkout'
import { formatBRL } from '@/lib/cart'
import { plural } from '@/lib/format'
import {
  declineMessage,
  formatCpf,
  isMercadoPagoOrigin,
  isMercadoPagoUrl,
  isThreeDsUrl,
  isValidCpf,
  MAX_INSTALLMENTS,
  onlyDigits,
  orderIdSchema,
  type OrderStatusInfo,
  type PayResult,
  type PixInfo,
} from '@/lib/payments/order'

/**
 * Pagamento dentro do site. Aqui o aluno escolhe cartão de crédito (parcelado) ou Pix.
 *
 * Cartão: número, validade e código são digitados em campos SEGUROS do Mercado Pago (iframes deles, via MercadoPago.js).
 * O nosso código nunca vê esses dados: só recebe um token de uso único, que vai para o servidor junto com o CPF.
 * O valor NÃO é enviado daqui: o servidor usa o total do pedido gravado no banco.
 * Nada é liberado nesta tela: ela espera o servidor confirmar o pagamento com o Mercado Pago e então leva para a página
 * "Pagamento confirmado".
 */

const POLL_MS = 3_000
/** De quantas em quantas consultas ao banco a tela também pede ao servidor para conferir no Mercado Pago (rede de segurança do aviso). */
const SYNC_EVERY = 5

// ---------- MercadoPago.js (o mínimo que usamos) ----------

type MpField = { mount: (id: string) => unknown; unmount: () => void; on: (event: string, handler: (data: { bin?: string }) => void) => void }
type MpInstance = {
  fields: {
    create: (type: 'cardNumber' | 'expirationDate' | 'securityCode', options?: { placeholder?: string }) => MpField
    createCardToken: (data: { cardholderName: string; identificationType: string; identificationNumber: string }) => Promise<{ id: string }>
  }
  getPaymentMethods: (query: { bin: string }) => Promise<{ results?: { id: string; payment_type_id: string }[] }>
  getInstallments: (query: { amount: string; bin: string; paymentTypeId: string }) => Promise<{ payer_costs?: { installments: number; recommended_message: string }[] }[]>
}
declare global {
  interface Window {
    MercadoPago?: new (publicKey: string, options?: { locale: string }) => MpInstance
    MP_DEVICE_SESSION_ID?: string
  }
}

let sdk: Promise<void> | null = null
/** Carrega o MercadoPago.js (uma vez só). A página de pagamento é a única que a CSP deixa carregá-lo. */
function loadSdk(): Promise<void> {
  if (typeof window !== 'undefined' && window.MercadoPago) return Promise.resolve()
  sdk ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://sdk.mercadopago.com/js/v2'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      sdk = null
      reject(new Error('sdk'))
    }
    document.head.appendChild(script)
  })
  return sdk
}

/** Identificador do dispositivo que o MercadoPago.js gera (antifraude). Sem ele o pagamento segue. */
const deviceId = () => (typeof window !== 'undefined' && /^[A-Za-z0-9_-]{8,200}$/.test(window.MP_DEVICE_SESSION_ID ?? '') ? window.MP_DEVICE_SESSION_ID : undefined)

const GENERIC_ERROR = 'Não foi possível concluir agora. Nada foi cobrado. Tente de novo em instantes.'
const CARD_DATA_ERROR = 'Confira os dados do cartão (número, validade e código) e tente de novo.'

// ---------- Tela ----------

export function PaymentView({ orderId, publicKey }: { orderId: string | null; publicKey: string | null }) {
  const valid = orderId !== null && orderIdSchema.safeParse(orderId).success
  const router = useRouter()
  const [order, setOrder] = useState<OrderStatusInfo | null>(null)
  const [loadFailed, setLoadFailed] = useState(!valid)
  const [method, setMethod] = useState<'cartao' | 'pix'>('cartao')
  const [threeDs, setThreeDs] = useState<string | null>(null)
  const [localPix, setLocalPix] = useState<PixInfo | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const loaded = useRef(false)

  const refresh = useCallback(
    async (sync: boolean) => {
      if (!valid || !orderId) return
      try {
        const r = await (sync ? checkPaymentAction(orderId) : orderStatusAction(orderId))
        if (!r.ok) {
          if (!loaded.current) setLoadFailed(true)
          return
        }
        loaded.current = true
        setOrder(r.order)
      } catch {
        // Sem conexão: tenta de novo na próxima volta.
      }
    },
    [valid, orderId],
  )

  // Primeira leitura do pedido.
  useEffect(() => {
    if (!valid || !orderId) return
    let stopped = false
    const load = async () => {
      try {
        const r = await orderStatusAction(orderId)
        if (stopped) return
        if (!r.ok) {
          setLoadFailed(true)
          return
        }
        loaded.current = true
        setOrder(r.order)
      } catch {
        if (!stopped) setLoadFailed(true)
      }
    }
    void load()
    return () => {
      stopped = true
    }
  }, [valid, orderId])

  // Pago: segue para a página de confirmação (ela limpa o carrinho e mostra os cursos).
  useEffect(() => {
    if (order?.status === 'pago' && orderId) router.replace('/finalizar/retorno?pedido=' + orderId)
  }, [order?.status, orderId, router])

  // Enquanto há um pagamento em andamento, pergunta ao banco a cada poucos segundos e, de vez em quando, ao Mercado Pago.
  const waiting = order?.status === 'pendente' && (threeDs !== null || order.attempt?.open === true)
  useEffect(() => {
    if (!waiting) return
    let n = 0
    const timer = setInterval(() => {
      n += 1
      void refresh(n % SYNC_EVERY === 0)
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [waiting, refresh])

  const check = async () => {
    if (checking) return
    setChecking(true)
    await refresh(true)
    setChecking(false)
  }

  const handleResult = async (r: PayResult) => {
    if (!r.ok) {
      setNotice(r.error)
      await refresh(false)
      return
    }
    setNotice(null)
    if (r.state === 'aguardando_acao') setThreeDs(r.threeDsUrl)
    else if (r.state === 'aguardando_pix') setLocalPix(r.pix)
    await refresh(r.state === 'aprovado')
  }

  const attempt = order?.attempt ?? null
  const open = order?.status === 'pendente' && attempt?.open === true
  const pix = open && attempt?.method === 'pix' ? (attempt.pix ?? localPix) : attempt && !attempt.open ? null : localPix
  const declined: string | null =
    order?.status === 'pendente' && attempt && !attempt.open && attempt.status === 'recusado' && attempt.method === 'cartao' && method === 'cartao'
      ? declineMessage(attempt.statusDetail)
      : null

  return (
    <div className="shop shop-dark surface-ink">
      <CheckoutHeader back={{ href: '/carrinho', label: 'Voltar ao carrinho' }} dark />
      <main id="main" tabIndex={-1} className="shop-main">
        {loadFailed && !order ? (
          <Notice icon="CircleAlert" title="Não encontramos este pedido." text="Confira se você está na conta certa e volte ao carrinho para começar de novo.">
            <ButtonLink href="/carrinho" variant="go" size="lg" icon="ArrowLeft">
              Voltar ao carrinho
            </ButtonLink>
          </Notice>
        ) : !order ? (
          <div className="fin-wait" aria-busy="true" aria-label="Carregando">
            <span className="cart-skel cart-skel-title" />
            <span className="cart-skel cart-skel-line" />
            <span className="cart-skel cart-skel-line" />
          </div>
        ) : order.status === 'pago' ? (
          <Notice icon="Check" title="Pagamento confirmado!" text="Estamos liberando os seus cursos…" />
        ) : order.status !== 'pendente' ? (
          <Notice icon="Info" title="Este pedido não está mais disponível." text="Ele já venceu ou foi substituído. Nada foi cobrado por ele. Volte ao carrinho para começar de novo.">
            <ButtonLink href="/carrinho" variant="go" size="lg" icon="ArrowLeft">
              Voltar ao carrinho
            </ButtonLink>
          </Notice>
        ) : (
          <div className="fin-grid">
            <section className="fin-main" aria-labelledby="pay-h">
              <p className="fin-badge">
                <Icon name="Lock" size={14} />
                Pagamento seguro
              </p>
              <h1 id="pay-h" className="display-xl fin-h">
                Finalize a sua compra.
              </h1>
              <div className="fin-sum surface-paper pay-card">
                {threeDs ? (
                  <ThreeDsFrame
                    url={threeDs}
                    onDone={() => {
                      setThreeDs(null)
                      void refresh(true)
                    }}
                  />
                ) : pix ? (
                  <PixPanel pix={pix} checking={checking} onCheck={check} />
                ) : open ? (
                  <WaitingPanel review={attempt?.status === 'processando'} checking={checking} onCheck={check} />
                ) : (
                  <>
                    <Tabs
                      label="Forma de pagamento"
                      value={method}
                      onChange={(v) => {
                        setMethod(v)
                        setNotice(null)
                      }}
                      tabs={[
                        { value: 'cartao', label: 'Cartão de crédito', icon: 'Wallet' },
                        { value: 'pix', label: 'Pix' },
                      ]}
                    />
                    {(notice ?? declined) && (
                      <p className="alert alert-err" role="alert">
                        <Icon name="CircleAlert" size={18} />
                        <span>{notice ?? declined}</span>
                      </p>
                    )}
                    <div role="tabpanel" aria-label={method === 'cartao' ? 'Cartão de crédito' : 'Pix'}>
                      {method === 'cartao' ? (
                        <CardForm order={order} orderId={orderId ?? ''} publicKey={publicKey} onResult={handleResult} />
                      ) : (
                        <PixForm order={order} orderId={orderId ?? ''} onResult={handleResult} />
                      )}
                    </div>
                  </>
                )}
              </div>
              <p className="fin-note">
                <Icon name="ShieldCheck" size={14} /> Os dados do cartão vão direto para o Mercado Pago: a Folyo não os vê nem os guarda. O acesso aos cursos é liberado
                assim que o pagamento for confirmado.
              </p>
            </section>
            <Summary order={order} />
          </div>
        )}
      </main>
    </div>
  )
}

function Notice({ icon, title, text, children }: { icon: 'Check' | 'CircleAlert' | 'Info'; title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="fin-grid">
      <section className="fin-main" aria-labelledby="pay-n" aria-live="polite">
        <span className="fin-clock" aria-hidden="true">
          <Icon name={icon} size={22} />
        </span>
        <h1 id="pay-n" className="display-xl fin-h">
          {title}
        </h1>
        <p className="lead fin-lead">{text}</p>
        {children && <div className="fin-actions">{children}</div>}
      </section>
    </div>
  )
}

/** Resumo do pedido (itens e total vêm do banco, não do navegador). */
function Summary({ order }: { order: OrderStatusInfo }) {
  return (
    <aside className="fin-sum surface-paper" aria-label="Resumo">
      <p className="eyebrow blue">Resumo</p>
      <ul className="fin-items">
        {order.items.map((i) => (
          <li key={i.courseId}>
            <span className="fin-item-t">
              <b>{i.title}</b>
            </span>
            <span className="fin-item-p">
              <b>{formatBRL(i.priceCents)}</b>
            </span>
          </li>
        ))}
      </ul>
      <p className="totals-row">
        <span>Subtotal · {plural(order.items.length, 'curso', 'cursos')}</span>
        <b>{formatBRL(order.totalCents)}</b>
      </p>
      <div className="totals-total">
        <span className="totals-k">Total</span>
        <span className="totals-v">
          <b>{formatBRL(order.totalCents)}</b>
        </span>
      </div>
    </aside>
  )
}

// ---------- Cartão ----------

type Installment = { value: number; label: string }

function CardForm({ order, orderId, publicKey, onResult }: { order: OrderStatusInfo; orderId: string; publicKey: string | null; onResult: (r: PayResult) => Promise<void> }) {
  const mp = useRef<MpInstance | null>(null)
  const lastBin = useRef('')
  const [ready, setReady] = useState(false)
  const [sdkFailed, setSdkFailed] = useState(false)
  const [brand, setBrand] = useState<string | null>(null)
  const [options, setOptions] = useState<Installment[]>([])
  const [installments, setInstallments] = useState(1)
  const [name, setName] = useState('')
  const [cpf, setCpf] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const amount = (order.totalCents / 100).toFixed(2)

  useEffect(() => {
    if (!publicKey) return
    let cancelled = false
    const fields: MpField[] = []
    const onBin = async (instance: MpInstance, bin: string) => {
      lastBin.current = bin
      if (bin.length < 8) {
        setBrand(null)
        setOptions([])
        return
      }
      try {
        const methods = await instance.getPaymentMethods({ bin })
        const found = methods.results?.[0]
        if (lastBin.current !== bin) return
        if (!found || found.payment_type_id !== 'credit_card') {
          setBrand(null)
          setOptions([])
          setError('Use um cartão de crédito. Para outros cartões, pague com Pix.')
          return
        }
        setError(null)
        setBrand(found.id)
        const costs = await instance.getInstallments({ amount, bin, paymentTypeId: 'credit_card' })
        if (lastBin.current !== bin) return
        const list = (costs[0]?.payer_costs ?? [])
          .filter((c) => c.installments >= 1 && c.installments <= MAX_INSTALLMENTS)
          .map((c) => ({ value: c.installments, label: c.recommended_message }))
        setOptions(list)
        setInstallments((current) => (list.some((o) => o.value === current) ? current : (list[0]?.value ?? 1)))
      } catch {
        // Sem a lista de parcelas, o cartão ainda pode ser pago à vista.
        if (lastBin.current === bin) setOptions([{ value: 1, label: `1x de R$ ${amount.replace('.', ',')}` }])
      }
    }

    loadSdk()
      .then(() => {
        if (cancelled || !window.MercadoPago) return
        const instance = new window.MercadoPago(publicKey, { locale: 'pt-BR' })
        mp.current = instance
        const number = instance.fields.create('cardNumber', { placeholder: '0000 0000 0000 0000' })
        const expiry = instance.fields.create('expirationDate', { placeholder: 'MM/AA' })
        const code = instance.fields.create('securityCode', { placeholder: 'CVV' })
        fields.push(number, expiry, code)
        number.mount('pay-card-number')
        expiry.mount('pay-card-expiry')
        code.mount('pay-card-code')
        number.on('binChange', (data) => void onBin(instance, data.bin ?? ''))
        setReady(true)
      })
      .catch(() => {
        if (!cancelled) setSdkFailed(true)
      })

    return () => {
      cancelled = true
      for (const f of fields) {
        try {
          f.unmount()
        } catch {
          // O campo já saiu da tela.
        }
      }
      mp.current = null
      setReady(false)
    }
  }, [publicKey, amount])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (pending || !mp.current) return
    const holder = name.trim()
    if (holder.length < 3) return setError('Digite o nome como está no cartão.')
    if (!isValidCpf(cpf)) return setError('Digite um CPF válido.')
    if (!brand) return setError('Digite o número de um cartão de crédito válido.')
    setPending(true)
    setError(null)
    try {
      const token = await mp.current.fields.createCardToken({ cardholderName: holder, identificationType: 'CPF', identificationNumber: onlyDigits(cpf) })
      const result = await payOrderAction({ method: 'cartao', orderId, token: token.id, paymentMethodId: brand, installments, cpf, deviceId: deviceId() })
      // O motivo da recusa aparece no aviso do topo (handleResult); aqui só os erros de preenchimento.
      await onResult(result)
    } catch {
      // createCardToken recusa dados de cartão inválidos; não mostramos o texto cru deles.
      setError(CARD_DATA_ERROR)
    } finally {
      setPending(false)
    }
  }

  if (!publicKey || sdkFailed) {
    return (
      <p className="alert alert-err" role="alert">
        <Icon name="CircleAlert" size={18} />
        <span>
          {sdkFailed ? 'Não foi possível carregar o pagamento com cartão. Verifique a conexão e recarregue a página, ou pague com Pix.' : 'O pagamento com cartão não está disponível agora. Pague com Pix.'}
        </span>
      </p>
    )
  }

  return (
    <form className="pay-form" onSubmit={submit} noValidate aria-busy={pending}>
      <Field label="Número do cartão">
        <div id="pay-card-number" className="pay-secure" />
      </Field>
      <div className="pay-row">
        <Field label="Validade">
          <div id="pay-card-expiry" className="pay-secure" />
        </Field>
        <Field label="Código de segurança">
          <div id="pay-card-code" className="pay-secure" />
        </Field>
      </div>
      <Field label="Nome impresso no cartão" id="pay-name">
        <input id="pay-name" className="inp" autoComplete="cc-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Como está no cartão" />
      </Field>
      <Field label="CPF do titular" id="pay-cpf" hint="Pedido pelo Mercado Pago. Não fica salvo na Folyo.">
        <input id="pay-cpf" className="inp" inputMode="numeric" autoComplete="off" value={cpf} onChange={(e) => setCpf(formatCpf(e.target.value))} placeholder="000.000.000-00" />
      </Field>
      <Field label="Parcelas" id="pay-installments">
        <div className="select">
          <select id="pay-installments" value={installments} disabled={!options.length} onChange={(e) => setInstallments(Number(e.target.value))}>
            {options.length ? (
              options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))
            ) : (
              <option value={1}>Digite o número do cartão</option>
            )}
          </select>
          <Icon name="ChevronDown" size={16} />
        </div>
      </Field>
      {error && (
        <p className="alert alert-err" role="alert">
          <Icon name="CircleAlert" size={18} />
          <span>{error}</span>
        </p>
      )}
      <Button type="submit" variant="go" size="lg" disabled={pending || !ready} aria-busy={pending}>
        {pending ? (
          <>
            <span className="cart-spin" aria-hidden="true" /> Processando…
          </>
        ) : (
          `Pagar ${formatBRL(order.totalCents)}`
        )}
      </Button>
    </form>
  )
}

// ---------- Pix ----------

function PixForm({ order, orderId, onResult }: { order: OrderStatusInfo; orderId: string; onResult: (r: PayResult) => Promise<void> }) {
  const [cpf, setCpf] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (pending) return
    if (!isValidCpf(cpf)) return setError('Digite um CPF válido.')
    setPending(true)
    setError(null)
    try {
      const result = await payOrderAction({ method: 'pix', orderId, cpf, deviceId: deviceId() })
      // O motivo da recusa aparece no aviso do topo (handleResult); aqui só os erros de preenchimento.
      await onResult(result)
    } catch {
      setError(GENERIC_ERROR)
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="pay-form" onSubmit={submit} noValidate aria-busy={pending}>
      <p className="pay-hint">Você recebe um QR code e um código para colar no app do seu banco. A confirmação costuma levar poucos segundos.</p>
      <Field label="CPF do pagador" id="pix-cpf" hint="Pedido pelo Mercado Pago. Não fica salvo na Folyo.">
        <input id="pix-cpf" className="inp" inputMode="numeric" autoComplete="off" value={cpf} onChange={(e) => setCpf(formatCpf(e.target.value))} placeholder="000.000.000-00" />
      </Field>
      {error && (
        <p className="alert alert-err" role="alert">
          <Icon name="CircleAlert" size={18} />
          <span>{error}</span>
        </p>
      )}
      <Button type="submit" variant="go" size="lg" disabled={pending} aria-busy={pending}>
        {pending ? (
          <>
            <span className="cart-spin" aria-hidden="true" /> Gerando o Pix…
          </>
        ) : (
          `Gerar Pix de ${formatBRL(order.totalCents)}`
        )}
      </Button>
    </form>
  )
}

function minutesLeft(iso: string | null, now: number): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : Math.max(0, Math.ceil((t - now) / 60_000))
}

function PixPanel({ pix, checking, onCheck }: { pix: PixInfo; checking: boolean; onCheck: () => void }) {
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const first = setTimeout(tick, 0)
    const timer = setInterval(tick, 20_000)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [])
  const left = now === null ? null : minutesLeft(pix.expiresAt, now)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pix.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Sem permissão para copiar: o código está na caixa para selecionar e copiar à mão.
    }
  }

  return (
    <div className="pay-pix" aria-live="polite">
      <h2 className="pay-h2">Pague com Pix</h2>
      <p className="pay-hint">Abra o app do seu banco, escolha Pix e leia o QR code ou use o “Pix Copia e Cola”. Esta tela confirma sozinha quando o pagamento chegar.</p>
      {pix.qrBase64 && (
        // eslint-disable-next-line @next/next/no-img-element -- QR code em base64 vindo do nosso banco (data:), não há o que otimizar.
        <img className="pay-qr" src={`data:image/png;base64,${pix.qrBase64}`} alt="QR code do Pix" width={220} height={220} />
      )}
      <Field label="Pix Copia e Cola" id="pix-code">
        <input id="pix-code" className="inp pay-code" readOnly value={pix.code} onFocus={(e) => e.currentTarget.select()} />
      </Field>
      <div className="pay-actions">
        <Button variant="go" size="lg" icon={copied ? 'Check' : 'Copy'} onClick={copy}>
          {copied ? 'Código copiado' : 'Copiar código'}
        </Button>
        <Button variant="quiet" size="lg" icon="RefreshCw" onClick={onCheck} disabled={checking} aria-busy={checking}>
          {checking ? 'Conferindo…' : 'Já paguei'}
        </Button>
      </div>
      {left !== null && (
        <p className="pay-hint">
          <Icon name="Clock" size={14} /> {left > 0 ? `O código vale por mais ${plural(left, 'minuto', 'minutos')}.` : 'O código expirou. Atualize a página para gerar outro.'}
        </p>
      )}
      {isMercadoPagoUrl(pix.ticketUrl) && (
        <a className="link-btn" href={pix.ticketUrl} target="_blank" rel="noopener noreferrer">
          Abrir no Mercado Pago <Icon name="ExternalLink" size={13} />
        </a>
      )}
    </div>
  )
}

// ---------- Confirmação do banco (3D Secure) e espera ----------

function ThreeDsFrame({ url, onDone }: { url: string; onDone: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const safe = isThreeDsUrl(url)

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // Só vale aviso que vem do iframe do banco, de um endereço do Mercado Pago. "COMPLETE" não prova nada:
      // o servidor confere o resultado no Mercado Pago.
      if (event.source !== frame.current?.contentWindow || !isMercadoPagoOrigin(event.origin)) return
      const data: unknown = event.data
      if (typeof data === 'object' && data !== null && 'status' in data && data.status === 'COMPLETE') onDone()
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [onDone])

  if (!safe) return <WaitingPanel review={false} checking={false} onCheck={onDone} />
  return (
    <div className="pay-3ds">
      <h2 className="pay-h2">Confirme com o seu banco</h2>
      <p className="pay-hint">O banco do cartão pede uma confirmação para liberar este pagamento. Siga as instruções abaixo.</p>
      <iframe
        ref={frame}
        src={url}
        title="Confirmação do pagamento pelo seu banco"
        className="pay-3ds-frame"
        sandbox="allow-forms allow-scripts allow-same-origin allow-popups"
        referrerPolicy="no-referrer"
      />
    </div>
  )
}

function WaitingPanel({ review, checking, onCheck }: { review: boolean; checking: boolean; onCheck: () => void }) {
  return (
    <div className="pay-wait" aria-live="polite">
      <span className="cart-spin" aria-hidden="true" />
      <h2 className="pay-h2">{review ? 'Pagamento em análise' : 'Confirmando o pagamento…'}</h2>
      <p className="pay-hint">
        {review
          ? 'O Mercado Pago está analisando o pagamento. Pode levar alguns minutos. Você pode fechar esta página: os cursos são liberados na sua conta assim que ele for aprovado.'
          : 'Estamos confirmando com o banco. Esta tela atualiza sozinha. Se a janela do banco foi fechada, você poderá tentar de novo em alguns minutos.'}
      </p>
      <div className="pay-actions">
        <Button variant="quiet" size="lg" icon="RefreshCw" onClick={onCheck} disabled={checking} aria-busy={checking}>
          {checking ? 'Conferindo…' : 'Conferir pagamento'}
        </Button>
        <ButtonLink href="/compras" variant="ghost" size="lg">
          Ver minhas compras
        </ButtonLink>
      </div>
    </div>
  )
}
