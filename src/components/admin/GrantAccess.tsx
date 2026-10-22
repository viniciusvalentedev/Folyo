'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { useApp } from '@/components/providers/AppState'
import { Button } from '@/components/ui/Button'
import { Field, Select } from '@/components/ui/controls'
import { Avatar } from '@/components/ui/indicators'
import { Modal } from '@/components/ui/Modal'
import { searchCandidatesAction, setRoleAction, type Candidate } from '@/lib/actions/admin'
import { ROLES, type Role } from '@/lib/admin/roles'

/** "Dar acesso ao painel": procura um aluno e escolhe o papel. Quem confere se pode é o banco. */
export function GrantAccess({ grantable }: { grantable: Role[] }) {
  const { toast } = useApp()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Candidate[]>([])
  const [picked, setPicked] = useState<Candidate | null>(null)
  const roles = grantable.filter((r) => r !== 'aluno')
  const [role, setRole] = useState<Role>(roles.includes('editor') ? 'editor' : roles[0])
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  useEffect(() => {
    if (!open || picked) return
    const term = q.trim()
    if (term.length < 2) return
    let stale = false
    const t = setTimeout(async () => {
      const r = await searchCandidatesAction(term)
      if (stale) return
      if (r.ok) setFound(r.rows)
      else setError(r.error)
    }, 300)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [q, open, picked])

  const grant = () =>
    picked &&
    start(async () => {
      setError('')
      const r = await setRoleAction({ userId: picked.id, role })
      if (!r.ok) return setError(r.error)
      toast(`${picked.name || picked.email} agora é ${ROLES[role].label.toLowerCase()}.`, 'ok')
      setOpen(false)
      router.refresh()
    })

  // Com menos de 2 letras não mostra resultados (nem os de uma busca anterior).
  const shown = q.trim().length >= 2 ? found : []

  if (!roles.length) return null
  return (
    <>
      <Button
        icon="UserCog"
        onClick={() => {
          setQ('')
          setFound([])
          setPicked(null)
          setError('')
          setOpen(true)
        }}
      >
        Dar acesso ao painel
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Dar acesso ao painel"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={!picked || pending} onClick={grant}>
              {pending ? 'Concedendo…' : 'Conceder'}
            </Button>
          </>
        }
      >
        <Field label="Buscar conta" id="pa-q" hint="Digite pelo menos 2 letras do nome ou do e-mail. Só aparecem alunos (contas sem papel).">
          <input
            id="pa-q"
            className="inp"
            value={q}
            maxLength={100}
            onChange={(e) => {
              setQ(e.target.value)
              setPicked(null)
            }}
            placeholder="Nome ou e-mail"
          />
        </Field>
        {!picked && shown.length > 0 && (
          <ul className="ad-simple">
            {shown.map((c) => (
              <li key={c.id}>
                <Avatar name={c.name || c.email} size={28} />
                <span className="grow">
                  {c.name || 'Sem nome'}
                  <small> · {c.email}</small>
                </span>
                <Button size="sm" variant="quiet" onClick={() => setPicked(c)}>
                  Escolher
                </Button>
              </li>
            ))}
          </ul>
        )}
        {!picked && q.trim().length >= 2 && !shown.length && <p className="muted">Nenhum aluno com esse nome ou e-mail.</p>}
        {picked && (
          <>
            <p className="ad-label">Conta escolhida</p>
            <p>
              <b>{picked.name || 'Sem nome'}</b> · {picked.email}
            </p>
            <Field label="Papel" id="pa-r" hint={ROLES[role].desc}>
              <Select<Role> id="pa-r" label="Papel" value={role} onChange={setRole} options={roles.map((r) => ({ value: r, label: ROLES[r].label }))} />
            </Field>
          </>
        )}
        {error && <p className="alert alert-err">{error}</p>}
      </Modal>
    </>
  )
}
