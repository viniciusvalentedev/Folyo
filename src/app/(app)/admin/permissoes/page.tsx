import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { GrantAccess } from '@/components/admin/GrantAccess'
import { SectionDenied, SectionLoading } from '@/components/admin/sections'
import { AdminHead, Badge, fmtDateTime } from '@/components/admin/ui'
import { Icon } from '@/components/ui/Icon'
import { Avatar, EmptyState } from '@/components/ui/indicators'
import { AUDIT_LABELS, isRole, ROLE_KEYS, ROLE_MATRIX, ROLES, rankOf, roleChangeText, type Role } from '@/lib/admin/roles'
import { allowed, AUDIT_KINDS, getAudit, getStaff, type AuditKind } from '@/lib/data/admin'

export const metadata: Metadata = { title: 'Administração e permissões' }

export default function AdminPermissionsPage({ searchParams }: PageProps<'/admin/permissoes'>) {
  return (
    <Suspense fallback={<SectionLoading />}>
      <Permissions searchParams={searchParams} />
    </Suspense>
  )
}

const KIND_LABELS: Record<AuditKind, string> = { all: 'Todas as ações', permissao: 'Permissões', usuario: 'Usuários', conteudo: 'Conteúdo' }

async function Permissions({ searchParams }: { searchParams: PageProps<'/admin/permissoes'>['searchParams'] }) {
  const ctx = await allowed('permissoes')
  if (!ctx) return <SectionDenied />
  const sp = await searchParams
  const raw = Array.isArray(sp.tipo) ? sp.tipo[0] : sp.tipo
  const kind: AuditKind = (AUDIT_KINDS as readonly string[]).includes(raw ?? '') ? (raw as AuditKind) : 'all'
  const [staff, audit] = await Promise.all([getStaff(), getAudit(kind)])

  // Papéis que eu posso dar a um ALUNO (a regra de verdade está no banco).
  const grantable: Role[] = ctx.role === 'proprietario' ? ROLE_KEYS : ROLE_KEYS.filter((r) => rankOf(r) < rankOf(ctx.role))

  return (
    <div className="ad-page">
      <AdminHead
        title="Administração e permissões"
        lead="Quem pode fazer o quê no painel, e o histórico de tudo o que foi alterado."
        actions={<GrantAccess grantable={grantable} />}
      />

      <section className="ad-grid-2 wide-left">
        <div className="panel flush">
          <header className="ad-sec-head pad">
            <h2>Equipe</h2>
            <small className="muted">
              {staff.length} {staff.length === 1 ? 'pessoa' : 'pessoas'} com acesso ao painel
            </small>
          </header>
          {staff.length ? (
            <div className="ad-table-wrap">
              <table className="ad-table">
                <caption className="sr-only">Equipe</caption>
                <thead>
                  <tr>
                    <th>Conta</th>
                    <th>Papel</th>
                    <th>Desde</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <Link href={`/admin/usuarios/${m.id}`} className="ad-ucell">
                          <Avatar name={m.name || m.email} size={30} />
                          <span>
                            <b>
                              {m.name || 'Sem nome'}
                              {m.id === ctx.id && <em className="ad-demo">você</em>}
                            </b>
                            <small>{m.email}</small>
                          </span>
                        </Link>
                      </td>
                      <td>
                        {ROLES[m.role].label} {m.suspended && <Badge tone="err">Suspenso</Badge>}
                      </td>
                      <td>
                        <span className="ad-sub">
                          {fmtDateTime(m.grantedAt)}
                          {m.grantedBy ? ` · por ${m.grantedBy}` : ' · configuração inicial'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="pad">
              <p className="muted">Ninguém com papel ainda.</p>
            </div>
          )}
        </div>
        <div className="panel">
          <header className="ad-sec-head">
            <h2>O que cada papel pode fazer</h2>
          </header>
          <table className="ad-table ad-matrix">
            <thead>
              <tr>
                <th>Ação</th>
                {(['editor', 'admin', 'proprietario'] as const).map((r) => (
                  <th key={r} className="c">
                    {ROLES[r].label.split(' ')[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROLE_MATRIX.map(([action, min]) => (
                <tr key={action}>
                  <td>{action}</td>
                  {[1, 2, 3].map((rank) => (
                    <td key={rank} className="c">
                      {rank >= min ? (
                        <Icon name="Check" size={15} aria-label="sim" />
                      ) : (
                        <span aria-label="não" className="muted">
                          —
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="ad-help">Ninguém altera o próprio papel. Administradores só gerenciam contas com papel abaixo do deles.</p>
        </div>
      </section>

      <section className="panel flush">
        <header className="ad-sec-head pad">
          <h2>Histórico de auditoria</h2>
          <div className="seg seg-sm" role="group" aria-label="Tipo de ação">
            {AUDIT_KINDS.map((k) => (
              <Link key={k} href={k === 'all' ? '/admin/permissoes' : `/admin/permissoes?tipo=${k}`} className={kind === k ? 'on' : ''} aria-current={kind === k ? 'true' : undefined}>
                {KIND_LABELS[k]}
              </Link>
            ))}
          </div>
        </header>
        {audit.length ? (
          <div className="ad-table-wrap">
            <table className="ad-table">
              <caption className="sr-only">Histórico de auditoria</caption>
              <thead>
                <tr>
                  <th>Data e hora</th>
                  <th>Ação</th>
                  <th>Conta</th>
                  <th>Detalhe</th>
                  <th>Por</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => {
                  const meta = AUDIT_LABELS[a.action] ?? { label: a.action, icon: 'Info' }
                  return (
                    <tr key={a.id}>
                      <td>
                        <span className="ad-sub">{fmtDateTime(a.at)}</span>
                      </td>
                      <td>
                        <span className="ad-sub">
                          <Icon name={meta.icon} size={14} /> {meta.label}
                        </span>
                      </td>
                      <td>{a.targetId ? <Link href={`/admin/usuarios/${a.targetId}`}>{a.target}</Link> : a.target || '—'}</td>
                      <td>
                        <span className="ad-sub">{(a.action === 'permissao.alterada' ? roleChangeText(a.detail) : a.detail) || '—'}</span>
                      </td>
                      <td>
                        {a.actor} ({isRole(a.actorRole) ? ROLES[a.actorRole].label : a.actorRole})
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="pad">
            <EmptyState icon="History" title="Nada registrado ainda">
              Mudanças de papel, suspensões, reativações e alterações em cursos e categorias aparecem aqui.
            </EmptyState>
          </div>
        )}
      </section>
    </div>
  )
}
