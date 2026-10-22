import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { Ago } from '@/components/admin/Ago'
import { SectionDenied, SectionLoading } from '@/components/admin/sections'
import { AdminHead, Badge, fmtDate, fmtNum, Metric, Pager } from '@/components/admin/ui'
import { UserFilters } from '@/components/admin/UserFilters'
import { Avatar, EmptyState } from '@/components/ui/indicators'
import { ROLES } from '@/lib/admin/roles'
import { allowed, listUsers, parseUserFilters, type UserFilters as Filters } from '@/lib/data/admin'

export const metadata: Metadata = { title: 'Alunos e usuários' }

export default function AdminUsersPage({ searchParams }: PageProps<'/admin/usuarios'>) {
  return (
    <Suspense fallback={<SectionLoading />}>
      <Users searchParams={searchParams} />
    </Suspense>
  )
}

function pageHref(f: Filters, page: number) {
  const qs = new URLSearchParams()
  if (f.q) qs.set('q', f.q)
  if (f.status !== 'all') qs.set('status', f.status)
  if (f.role !== 'all') qs.set('papel', f.role)
  if (f.since !== 'all') qs.set('desde', f.since)
  if (f.sort !== 'created') qs.set('ordem', f.sort)
  if (page > 1) qs.set('pagina', String(page))
  const s = qs.toString()
  return '/admin/usuarios' + (s ? '?' + s : '')
}

async function Users({ searchParams }: { searchParams: PageProps<'/admin/usuarios'>['searchParams'] }) {
  if (!(await allowed('usuarios'))) return <SectionDenied />
  const filters = parseUserFilters(await searchParams)
  const list = await listUsers(filters)

  return (
    <div className="ad-page">
      <AdminHead
        title="Alunos e usuários"
        lead="Contas cadastradas na Folyo, com papel e um resumo do progresso. Anotações, projetos e currículo dos alunos não aparecem aqui."
      />
      <section className="ad-metrics small">
        <Metric icon="Users" label="Contas" value={fmtNum(list.summary.accounts)} />
        <Metric icon="Activity" label="Ativas nos últimos 7 dias" value={fmtNum(list.summary.active7)} />
        <Metric icon="Ban" label="Suspensas" value={fmtNum(list.summary.suspended)} href="/admin/usuarios?status=suspenso" />
      </section>

      <Suspense fallback={null}>
        <UserFilters />
      </Suspense>

      <div className="panel flush">
        {list.rows.length ? (
          <>
            <div className="ad-table-wrap">
              <table className="ad-table">
                <caption className="sr-only">Usuários</caption>
                <thead>
                  <tr>
                    <th>Usuário</th>
                    <th>Cadastro</th>
                    <th>Última atividade</th>
                    <th className="num">Cursos</th>
                    <th className="num">Aulas concluídas</th>
                    <th>Papel</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <Link href={`/admin/usuarios/${u.id}`} className="ad-ucell">
                          <Avatar name={u.name || u.email} size={32} />
                          <span>
                            <b>{u.name || 'Sem nome'}</b>
                            <small>{u.email}</small>
                          </span>
                        </Link>
                      </td>
                      <td>
                        <span className="ad-sub">{fmtDate(u.createdAt)}</span>
                      </td>
                      <td>
                        <span className="ad-sub"><Ago value={u.lastActiveAt} /></span>
                      </td>
                      <td className="num">{fmtNum(u.courses)}</td>
                      <td className="num">{fmtNum(u.lessons)}</td>
                      <td>
                        <span className="ad-sub">{ROLES[u.role].label}</span>
                      </td>
                      <td>{u.suspended ? <Badge tone="err">Suspenso</Badge> : <Badge tone="ok">Ativo</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={filters.page} pageSize={list.pageSize} total={list.total} href={(p) => pageHref(filters, p)} />
          </>
        ) : (
          <div className="pad">
            <EmptyState icon="Users" title={list.summary.accounts ? 'Nenhum usuário com esses filtros' : 'Nenhuma conta ainda'}>
              {list.summary.accounts ? 'Ajuste a busca ou os filtros.' : 'As contas aparecem aqui depois do cadastro.'}
            </EmptyState>
          </div>
        )}
      </div>
    </div>
  )
}
