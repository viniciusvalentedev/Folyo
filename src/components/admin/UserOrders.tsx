'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useApp } from '@/components/providers/AppState'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/controls'
import { Modal } from '@/components/ui/Modal'
import { refundOrderAction } from '@/lib/actions/refund'
import { formatBRL } from '@/lib/cart'
import { orderNumber, type AdminOrder } from '@/lib/payments/order'
import { Badge, fmtDateTime } from './ui'

/**
 * Ficha do aluno › Compras: os pedidos pagos e estornados, com o botão "Estornar" (estorno TOTAL pelo Mercado Pago).
 * A tela só mostra o botão; quem confere o papel (administrador ou acima, com a verificação em duas etapas), o pedido e
 * registra no histórico quem estornou é o banco (admin_refund_begin). O acesso aos cursos só sai depois que o Mercado Pago confirma.
 */
export function UserOrders({ orders }: { orders: AdminOrder[] }) {
  const { toast } = useApp()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [target, setTarget] = useState<AdminOrder | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const ask = (order: AdminOrder) => {
    setReason('')
    setError('')
    setTarget(order)
  }

  const confirm = () => {
    if (!target) return
    start(async () => {
      setError('')
      const r = await refundOrderAction({ orderId: target.id, reason: reason.trim() })
      if (!r.ok) {
        setError(r.error)
        return
      }
      toast(r.done ? 'Compra estornada. O acesso aos cursos foi encerrado.' : 'Estorno pedido ao Mercado Pago. O acesso é encerrado assim que ele confirmar.', 'ok')
      setTarget(null)
      router.refresh()
    })
  }

  if (!orders.length) return <p className="muted">Este aluno ainda não tem compras pagas.</p>

  return (
    <>
      <ul className="ad-access">
        {orders.map((o) => {
          const refunded = o.status === 'reembolsado'
          return (
            <li key={o.id}>
              <div className="ad-access-t">
                <b>
                  Pedido {orderNumber(o.id)} · {formatBRL(o.totalCents)}
                </b>
                <small>
                  {refunded ? `Estornado em ${fmtDateTime(o.refundedAt)}` : `Pago em ${fmtDateTime(o.paidAt ?? o.createdAt)}`} · {o.items.map((i) => i.title).join(', ')}
                </small>
              </div>
              <div className="ad-access-b">
                <Badge tone={refunded ? 'warn' : 'ok'}>{refunded ? 'Estornado' : 'Pago'}</Badge>
                {o.refundable && (
                  <Button size="sm" variant="ghost" icon="Undo2" disabled={pending} onClick={() => ask(o)}>
                    Estornar
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <Modal
        open={!!target}
        onClose={() => !pending && setTarget(null)}
        size="sm"
        title="Estornar esta compra?"
        footer={
          <>
            <Button variant="ghost" disabled={pending} onClick={() => setTarget(null)}>
              Cancelar
            </Button>
            <Button variant="danger" disabled={pending} aria-busy={pending} onClick={confirm}>
              {pending ? 'Estornando…' : `Estornar ${target ? formatBRL(target.totalCents) : ''}`}
            </Button>
          </>
        }
      >
        {target && (
          <>
            <p className="muted">
              O Mercado Pago devolve {formatBRL(target.totalCents)} ao aluno (o estorno é total) e o acesso aos cursos deste pedido é encerrado:{' '}
              {target.items.map((i) => i.title).join(', ')}. Não dá para desfazer.
            </p>
            <Field label="Motivo (fica registrado no histórico)" id="refund-r" error={error || undefined} hint={`${reason.length}/300`}>
              <textarea id="refund-r" className="ta" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </>
        )}
      </Modal>
    </>
  )
}
