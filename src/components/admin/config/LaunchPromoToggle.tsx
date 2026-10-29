'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useApp } from '@/components/providers/AppState'
import { Toggle } from '@/components/ui/controls'
import { ConfirmModal } from '@/components/ui/Modal'
import { setLaunchPromoAction } from '@/lib/actions/shop-admin'
import { PROMO } from '@/lib/cart'
import { Notice } from '../ui'

/**
 * Liga/desliga a promoção de lançamento. Grava na hora (fora do "Salvar" das configurações):
 * quem confere o papel e registra no histórico é o banco. `initial` null = SQL ainda não rodado.
 */
export function LaunchPromoToggle({ initial }: { initial: boolean | null }) {
  const { toast } = useApp()
  const router = useRouter()
  const [on, setOn] = useState(initial ?? false)
  const [asking, setAsking] = useState(false)
  const [pending, start] = useTransition()

  if (initial === null) {
    return <Notice tone="warn">Para usar a promoção de lançamento, rode no Supabase o SQL do cupom (veja supabase/README.md).</Notice>
  }

  const apply = (active: boolean) =>
    start(async () => {
      const r = await setLaunchPromoAction({ active })
      if (!r.ok) return toast(r.error, 'err')
      setOn(active)
      toast(active ? 'Promoção de lançamento ligada.' : 'Promoção de lançamento desligada.', 'ok')
      router.refresh()
    })

  return (
    <>
      <Toggle
        id="s-promo"
        label={`Promoção de lançamento ativa (cupom ${PROMO.code})`}
        hint={
          pending
            ? 'Salvando…'
            : `Ligada: o cupom vale no carrinho e libera ${PROMO.days} dias de pré-acesso aos cursos marcados com "Liberar com cupom". Desligada: o cupom para de valer e os pré-acessos dados por ele se encerram.`
        }
        checked={on}
        onChange={(v) => {
          if (pending) return
          if (v) apply(true)
          else setAsking(true)
        }}
      />
      <ConfirmModal
        open={asking}
        onClose={() => setAsking(false)}
        onConfirm={() => apply(false)}
        title="Desligar a promoção de lançamento?"
        body={`O cupom ${PROMO.code} deixa de valer e todos os pré-acessos dados por ele se encerram agora (os alunos perdem o acesso a esses cursos). Dá para ligar de novo depois.`}
        confirmLabel="Desligar promoção"
        danger
      />
    </>
  )
}
