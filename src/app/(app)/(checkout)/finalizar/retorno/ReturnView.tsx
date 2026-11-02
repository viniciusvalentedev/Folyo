'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { CheckoutHeader } from '@/components/cart/CartParts'
import { useShop } from '@/components/providers/Shop'
import { ButtonLink } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { orderStatusAction } from '@/lib/actions/checkout'
import { orderIdSchema, type OrderStatusInfo } from '@/lib/payments/order'

const POLL_MS = 3_000
/** Depois disto paramos de perguntar (Pix e boleto podem demorar; o acesso chega sozinho quando o pagamento for confirmado). */
const MAX_TRIES = 40

/** Página de retorno do pagamento: acompanha o status do pedido até o Mercado Pago confirmar para o servidor. */
export function ReturnView({ orderId }: { orderId: string | null }) {
  const valid = orderId !== null && orderIdSchema.safeParse(orderId).success
  const [order, setOrder] = useState<OrderStatusInfo | null>(null)
  const [failed, setFailed] = useState(!valid)
  const [gaveUp, setGaveUp] = useState(false)
  const { cart } = useShop()
  const router = useRouter()
  const cleaned = useRef(false)

  useEffect(() => {
    if (!valid || !orderId) return
    let stopped = false
    let tries = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      tries += 1
      try {
        const r = await orderStatusAction(orderId)
        if (stopped) return
        if (!r.ok) {
          setFailed(true)
          return
        }
        setOrder(r.order)
        if (r.order.status !== 'pendente') return
      } catch {
        // Sem conexão: tenta de novo na próxima volta.
      }
      if (tries >= MAX_TRIES) {
        if (!stopped) setGaveUp(true)
        return
      }
      timer = setTimeout(tick, POLL_MS)
    }
    void tick()
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
    }
  }, [valid, orderId])

  // Pago: tira do carrinho o que foi comprado e recarrega os dados da conta (os cursos passam a abrir).
  const paid = order?.status === 'pago'
  const paidIds = paid ? order.items.map((i) => i.courseId) : null
  useEffect(() => {
    if (!paidIds || cleaned.current || !cart.ready) return
    cleaned.current = true
    cart.removeMany(paidIds)
    router.refresh()
  }, [paidIds, cart, router])

  return (
    <div className="shop shop-dark surface-ink">
      <CheckoutHeader back={{ href: '/cursos', label: 'Ver cursos' }} dark />
      <main id="main" tabIndex={-1} className="shop-main">
        <Body order={order} failed={failed} gaveUp={gaveUp} />
      </main>
    </div>
  )
}

function Body({ order, failed, gaveUp }: { order: OrderStatusInfo | null; failed: boolean; gaveUp: boolean }) {
  if (failed && !order) {
    return (
      <Message icon="CircleAlert" title="Não encontramos este pedido." text="Confira se você está na conta certa. Se você acabou de pagar, o acesso chega sozinho quando o pagamento for confirmado.">
        <ButtonLink href="/cursos" variant="go" size="lg">
          Ver cursos
        </ButtonLink>
      </Message>
    )
  }
  if (!order) {
    return (
      <div className="fin-wait" aria-busy="true" aria-label="Conferindo o pagamento">
        <span className="cart-skel cart-skel-title" />
        <span className="cart-skel cart-skel-line" />
      </div>
    )
  }
  if (order.status === 'pago') {
    return (
      <div className="pre-ok">
        <span className="pre-ok-check" aria-hidden="true">
          <Icon name="Check" size={40} strokeWidth={2.5} />
        </span>
        <p className="pre-ok-kicker">Pagamento confirmado</p>
        <h1 tabIndex={-1} className="display-xl pre-ok-h">
          Seus cursos estão liberados.
        </h1>
        <section className="pre-panel" aria-labelledby="ret-courses">
          <h2 id="ret-courses" className="pre-panel-h">
            Cursos
          </h2>
          <ul className="pre-list">
            {order.items.map((c) => (
              <li key={c.courseId}>
                <span className="pre-list-t">
                  <b>{c.title}</b>
                </span>
                <ButtonLink href={'/cursos/' + c.courseId} variant="quiet-dark" size="sm" aria-label={`Abrir ${c.title}`}>
                  Abrir
                </ButtonLink>
              </li>
            ))}
          </ul>
        </section>
        <div className="fin-actions center">
          <ButtonLink href={'/cursos/' + (order.items[0]?.courseId ?? '')} variant="go" size="lg" iconRight="ArrowRight">
            Começar agora
          </ButtonLink>
          <ButtonLink href="/compras" variant="quiet-dark" size="lg">
            Ver minhas compras
          </ButtonLink>
        </div>
      </div>
    )
  }
  if (order.status === 'pendente') {
    return (
      <Message
        icon="Clock"
        title={gaveUp ? 'Ainda aguardando a confirmação.' : 'Conferindo o seu pagamento…'}
        text="Pix e boleto podem levar alguns minutos para serem confirmados. Você pode fechar esta página: os cursos são liberados na sua conta assim que o Mercado Pago confirmar o pagamento."
      >
        <ButtonLink href="/cursos" variant="go" size="lg">
          Ver cursos
        </ButtonLink>
      </Message>
    )
  }
  if (order.status === 'reembolsado') {
    return (
      <Message icon="Info" title="Este pagamento foi estornado." text="O acesso aos cursos deste pedido foi encerrado. Se algo não está certo, fale com a gente em contato@usefolyo.com.">
        <ButtonLink href="/cursos" variant="go" size="lg">
          Ver cursos
        </ButtonLink>
      </Message>
    )
  }
  return (
    <Message icon="CircleAlert" title="O pagamento não foi concluído." text="Nada foi cobrado por este pedido. Você pode voltar ao carrinho e tentar de novo.">
      <ButtonLink href="/carrinho" variant="go" size="lg" icon="ArrowLeft">
        Voltar ao carrinho
      </ButtonLink>
    </Message>
  )
}

function Message({ icon, title, text, children }: { icon: 'Clock' | 'CircleAlert' | 'Info'; title: string; text: string; children: React.ReactNode }) {
  return (
    <div className="fin-grid">
      <section className="fin-main" aria-labelledby="ret-h" aria-live="polite">
        <span className="fin-clock" aria-hidden="true">
          <Icon name={icon} size={22} />
        </span>
        <h1 id="ret-h" className="display-xl fin-h">
          {title}
        </h1>
        <p className="lead fin-lead">{text}</p>
        <div className="fin-actions">{children}</div>
      </section>
    </div>
  )
}
