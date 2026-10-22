'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { Select } from '@/components/ui/controls'
import { Icon } from '@/components/ui/Icon'

/**
 * Filtros da lista de usuários. Ficam no endereço (?q=&status=...), então a busca
 * pode ser copiada e o botão "voltar" funciona. Quem valida os valores é o servidor.
 */
export function UserFilters() {
  const router = useRouter()
  const path = usePathname()
  const sp = useSearchParams()
  const [q, setQ] = useState(sp.get('q') ?? '')
  const [, start] = useTransition()

  const push = (changes: Record<string, string>) => {
    const next = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(changes)) {
      if (!v || v === 'all' || (k === 'ordem' && v === 'created')) next.delete(k)
      else next.set(k, v)
    }
    next.delete('pagina')
    const qs = next.toString()
    start(() => router.replace(qs ? `${path}?${qs}` : path, { scroll: false }))
  }

  // Busca enquanto digita, com uma pequena espera.
  useEffect(() => {
    if (q === (sp.get('q') ?? '')) return
    const t = setTimeout(() => push({ q: q.trim().slice(0, 100) }), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  return (
    <div className="ad-filters" role="search">
      <span className="ad-search-inline">
        <Icon name="Search" size={15} />
        <input
          className="inp inp-sm"
          placeholder="Buscar por nome ou e-mail"
          value={q}
          maxLength={100}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar usuários"
        />
      </span>
      <Select
        id="fu-st"
        label="Status"
        value={sp.get('status') ?? 'all'}
        onChange={(v) => push({ status: v })}
        options={[
          { value: 'all', label: 'Todos os status' },
          { value: 'ativo', label: 'Ativos' },
          { value: 'suspenso', label: 'Suspensos' },
        ]}
      />
      <Select
        id="fu-since"
        label="Cadastro"
        value={sp.get('desde') ?? 'all'}
        onChange={(v) => push({ desde: v })}
        options={[
          { value: 'all', label: 'Qualquer data de cadastro' },
          { value: '7', label: 'Cadastro nos últimos 7 dias' },
          { value: '30', label: 'Nos últimos 30 dias' },
          { value: '90', label: 'Nos últimos 90 dias' },
        ]}
      />
      <Select
        id="fu-role"
        label="Papel"
        value={sp.get('papel') ?? 'all'}
        onChange={(v) => push({ papel: v })}
        options={[
          { value: 'all', label: 'Todos os papéis' },
          { value: 'aluno', label: 'Aluno' },
          { value: 'equipe', label: 'Equipe (qualquer papel)' },
          { value: 'editor', label: 'Editor de conteúdo' },
          { value: 'admin', label: 'Administrador' },
          { value: 'proprietario', label: 'Proprietário' },
        ]}
      />
      <Select
        id="fu-sort"
        label="Ordenar"
        value={sp.get('ordem') ?? 'created'}
        onChange={(v) => push({ ordem: v })}
        options={[
          { value: 'created', label: 'Mais recentes primeiro' },
          { value: 'active', label: 'Última atividade' },
          { value: 'name', label: 'Nome (A–Z)' },
        ]}
      />
    </div>
  )
}
