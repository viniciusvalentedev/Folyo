'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useApp } from '@/components/providers/AppState'
import { Button } from '@/components/ui/Button'
import { Field, Select } from '@/components/ui/controls'
import { Modal } from '@/components/ui/Modal'
import { setRoleAction, setSuspendedAction } from '@/lib/actions/admin'
import { ROLES, type Role } from '@/lib/admin/roles'

/**
 * Botões de suspender/reativar e de trocar o papel de uma conta.
 * O servidor recebe só o pedido; o BANCO decide se quem pediu pode (e registra no histórico).
 */
export function SuspendButton({ userId, name, suspended }: { userId: string; name: string; suspended: boolean }) {
  const { toast } = useApp()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  const run = (next: boolean) =>
    start(async () => {
      setError('')
      const r = await setSuspendedAction({ userId, suspended: next, reason: next ? reason.trim() : '' })
      if (!r.ok) {
        setError(r.error)
        if (!next) toast(r.error, 'err')
        return
      }
      toast(next ? 'Conta suspensa.' : 'Conta reativada.', 'ok')
      setOpen(false)
      router.refresh()
    })

  if (suspended) {
    return (
      <Button icon="UserCheck" onClick={() => run(false)} disabled={pending}>
        {pending ? 'Reativando…' : 'Reativar acesso'}
      </Button>
    )
  }
  return (
    <>
      <Button variant="danger" icon="Ban" onClick={() => (setReason(''), setError(''), setOpen(true))}>
        Suspender acesso
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title="Suspender acesso?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant="danger" disabled={pending} onClick={() => run(true)}>
              {pending ? 'Suspendendo…' : 'Suspender'}
            </Button>
          </>
        }
      >
        <p className="muted">
          {name} não vai conseguir usar a Folyo enquanto a conta estiver suspensa. O progresso, os projetos e o
          currículo não são apagados.
        </p>
        <Field label="Motivo (fica registrado no histórico)" id="susp-r" error={error || undefined} hint={`${reason.length}/500`}>
          <textarea id="susp-r" className="ta" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Modal>
    </>
  )
}

export function RoleChanger({ userId, current, options, lockedHint }: { userId: string; current: Role; options: Role[]; lockedHint: string }) {
  const { toast } = useApp()
  const router = useRouter()
  const [value, setValue] = useState<Role>(current)
  const [pending, start] = useTransition()
  const list = options.length ? options : [current]

  const apply = () =>
    start(async () => {
      const r = await setRoleAction({ userId, role: value })
      if (!r.ok) return toast(r.error, 'err')
      toast('Papel atualizado.', 'ok')
      router.refresh()
    })

  return (
    <Field label="Papel" id="u-role" hint={options.length ? ROLES[value].desc : lockedHint}>
      <div className="ad-inline">
        <Select<Role>
          id="u-role"
          label="Papel"
          value={value}
          onChange={setValue}
          options={list.map((r) => ({ value: r, label: ROLES[r].label }))}
        />
        {options.length > 0 && (
          <Button size="sm" disabled={pending || value === current} onClick={apply}>
            {pending ? 'Aplicando…' : 'Aplicar'}
          </Button>
        )}
      </div>
    </Field>
  )
}
