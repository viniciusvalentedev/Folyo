'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useApp } from '@/components/providers/AppState'
import { Button } from '@/components/ui/Button'
import { ConfirmModal } from '@/components/ui/Modal'
import { grantCourseAccessAction, revokeCourseAccessAction } from '@/lib/actions/shop-admin'
import { formatBRL, formatDateBR, type AccessRow } from '@/lib/cart'
import { Badge } from './ui'

type PaidCourse = { id: string; title: string; priceCents: number }

/**
 * Ficha do aluno › Cursos pagos: o que ele pode assistir e por quê (pré-acesso de lançamento,
 * liberação manual ou compra). "Liberar acesso" e "Remover acesso" mexem só na liberação MANUAL;
 * o banco confere o papel (administrador ou acima) e registra no histórico.
 */
export function CourseAccessPanel({ userId, courses, access }: { userId: string; courses: PaidCourse[]; access: AccessRow[] }) {
  const { toast } = useApp()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<PaidCourse | null>(null)

  const run = (course: PaidCourse, grant: boolean) => {
    setBusy(course.id)
    start(async () => {
      const r = grant
        ? await grantCourseAccessAction({ userId, courseId: course.id })
        : await revokeCourseAccessAction({ userId, courseId: course.id })
      setBusy(null)
      if (!r.ok) return toast(r.error, 'err')
      toast(grant ? `Acesso a ${course.title} liberado.` : `Liberação manual de ${course.title} removida.`, 'ok')
      router.refresh()
    })
  }

  if (!courses.length) return <p className="muted">Nenhum curso com preço no catálogo. Cursos sem preço são gratuitos para todos.</p>

  return (
    <>
      <ul className="ad-access">
        {courses.map((c) => {
          const rows = access.filter((a) => a.courseId === c.id)
          const manual = rows.find((a) => a.source === 'manual')
          const promo = rows.find((a) => a.source === 'cupom')
          const bought = rows.find((a) => a.source === 'compra' && a.active)
          return (
            <li key={c.id}>
              <div className="ad-access-t">
                <b>{c.title}</b>
                <small>
                  {formatBRL(c.priceCents)}
                  {promo?.expiresAt &&
                    (promo.active ? ` · pré-acesso de lançamento até ${formatDateBR(promo.expiresAt)}` : ` · pré-acesso de lançamento encerrado`)}
                  {manual && ` · liberado manualmente em ${formatDateBR(manual.grantedAt)}`}
                </small>
              </div>
              <div className="ad-access-b">
                {promo?.active && <Badge tone="info">Pré-acesso</Badge>}
                {manual && <Badge tone="ok">Liberado</Badge>}
                {bought && <Badge tone="ok">Comprado</Badge>}
                {!rows.some((a) => a.active) && <Badge tone="warn">Sem acesso</Badge>}
                {manual ? (
                  <Button size="sm" variant="ghost" disabled={pending && busy === c.id} onClick={() => setRevoking(c)}>
                    Remover acesso
                  </Button>
                ) : (
                  <Button size="sm" variant="quiet" disabled={pending && busy === c.id} onClick={() => run(c, true)}>
                    Liberar acesso
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <ConfirmModal
        open={!!revoking}
        onClose={() => setRevoking(null)}
        onConfirm={() => revoking && run(revoking, false)}
        title="Remover a liberação manual?"
        body={`O aluno deixa de assistir a ${revoking?.title ?? 'este curso'}, a não ser que tenha pré-acesso de lançamento em dia. O progresso continua guardado.`}
        confirmLabel="Remover acesso"
        danger
      />
    </>
  )
}
