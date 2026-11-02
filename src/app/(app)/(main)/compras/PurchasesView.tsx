import { ButtonLink } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { EmptyState } from '@/components/ui/indicators'
import { PageHead } from '@/components/ui/PageHead'
import { formatBRL } from '@/lib/cart'
import { FALLBACK_SUPPORT_EMAIL } from '@/lib/app-config'
import { isMercadoPagoUrl, longDate, orderNumber, type MyOrder } from '@/lib/payments/order'

const STATUS: Record<MyOrder['status'], { label: string; pill: string }> = {
  pago: { label: 'Pago', pill: 'pill-ok' },
  pendente: { label: 'Aguardando pagamento', pill: 'pill-warn' },
  reembolsado: { label: 'Estornado', pill: 'pill-neutral' },
  cancelado: { label: 'Cancelado', pill: 'pill-neutral' },
  expirado: { label: 'Vencido', pill: 'pill-neutral' },
}

/** "Minhas compras": os pedidos da própria conta, com o recibo de cada um e o caminho para os cursos. */
export function PurchasesView({ orders }: { orders: MyOrder[] }) {
  return (
    <div className="page surface-ink buy-page">
      <PageHead eyebrow="Conta" title="Minhas compras" lead="Os cursos que você comprou, com o comprovante de cada pedido." />

      {orders.length === 0 ? (
        <EmptyState
          icon="ShoppingBag"
          title="Você ainda não fez nenhuma compra"
          action={
            <ButtonLink variant="go" iconRight="ArrowRight" href="/cursos">
              Explorar cursos
            </ButtonLink>
          }
        >
          Quando você comprar um curso, o pedido e o comprovante aparecem aqui.
        </EmptyState>
      ) : (
        <ul className="buy-list">
          {orders.map((order) => (
            <li key={order.id}>
              <OrderCard order={order} />
            </li>
          ))}
        </ul>
      )}

      <p className="buy-help">
        Dúvida sobre uma compra? Escreva para <a href={`mailto:${FALLBACK_SUPPORT_EMAIL}`}>{FALLBACK_SUPPORT_EMAIL}</a> e cite o número do pedido.
      </p>
    </div>
  )
}

function OrderCard({ order }: { order: MyOrder }) {
  const status = STATUS[order.status]
  const number = orderNumber(order.id)
  const date = longDate(order.status === 'pago' || order.status === 'reembolsado' ? (order.paidAt ?? order.createdAt) : order.createdAt)
  const owned = order.status === 'pago'
  // Só segue para o Mercado Pago um endereço do Mercado Pago (o banco já confere; aqui confere de novo).
  const payUrl = order.status === 'pendente' && isMercadoPagoUrl(order.checkoutUrl) ? order.checkoutUrl : null

  return (
    <article className="buy-card" aria-labelledby={`pedido-${order.id}`}>
      <header className="buy-head">
        <div>
          <h2 id={`pedido-${order.id}`}>Pedido {number}</h2>
          {date && <p className="buy-date">{order.status === 'pendente' ? 'Criado em' : 'Pago em'} {date}</p>}
        </div>
        <span className={`pill ${status.pill}`}>{status.label}</span>
      </header>

      <ul className="buy-items">
        {order.items.map((item) => (
          <li key={item.courseId}>
            <span className="buy-item-t">{item.title}</span>
            <span className="buy-price">{formatBRL(item.priceCents)}</span>
            {owned && (
              <ButtonLink variant="quiet" size="sm" href={`/cursos/${item.courseId}`} aria-label={`Abrir ${item.title}`}>
                Abrir curso
              </ButtonLink>
            )}
          </li>
        ))}
      </ul>

      <footer className="buy-foot">
        <p className="buy-total">
          <span>{order.status === 'pago' ? 'Total pago' : 'Total'}</span>
          <b>{formatBRL(order.totalCents)}</b>
        </p>
        {order.status === 'pendente' && (
          <div className="buy-note">
            <p>
              <Icon name="Clock" size={15} /> O pagamento ainda não foi confirmado. Pix e boleto podem levar alguns minutos; o acesso chega sozinho quando o pagamento for confirmado.
            </p>
            {payUrl && (
              <a className="btn btn-go btn-md" href={payUrl} rel="noopener noreferrer">
                <span>Continuar pagamento</span>
                <Icon name="ExternalLink" size={17} />
              </a>
            )}
          </div>
        )}
        {order.status === 'reembolsado' && (
          <p className="buy-note-line">
            <Icon name="Info" size={15} /> Este pagamento foi estornado e o acesso aos cursos deste pedido foi encerrado.
          </p>
        )}
      </footer>
    </article>
  )
}

export function PurchasesSkeleton() {
  return (
    <div className="page surface-ink buy-page" aria-busy="true" aria-label="Carregando suas compras">
      <header className="pagehead">
        <p className="eyebrow">Conta</p>
        <h1>Minhas compras</h1>
      </header>
      <div className="buy-skel" />
      <div className="buy-skel" />
    </div>
  )
}
