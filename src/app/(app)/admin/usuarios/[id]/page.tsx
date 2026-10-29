import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { Ago } from '@/components/admin/Ago'
import { CourseAccessPanel } from '@/components/admin/CourseAccessPanel'
import { SectionDenied, SectionLoading } from '@/components/admin/sections'
import { AdminHead, Badge, fmtDate, fmtDateTime, fmtNum, Metric, Notice } from '@/components/admin/ui'
import { RoleChanger, SuspendButton } from '@/components/admin/UserActions'
import { ButtonLink } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { EmptyState, Progress } from '@/components/ui/indicators'
import { assignableRoles, canManage, ROLES } from '@/lib/admin/roles'
import { allowed, getUserDetail } from '@/lib/data/admin'
import { courseCounts } from '@/lib/admin/catalog'
import { getFullCatalog, getTrails } from '@/lib/data/catalog'
import { getUserCourseAccess } from '@/lib/data/shop'
import { findTrail, LIFE_STAGES } from '@/lib/trails'
import { uuidSchema } from '@/lib/validation'

export const metadata: Metadata = { title: 'Usuário' }

export default function AdminUserPage({ params }: PageProps<'/admin/usuarios/[id]'>) {
  return (
    <Suspense fallback={<SectionLoading />}>
      <UserPage params={params} />
    </Suspense>
  )
}

function NotFound() {
  return (
    <div className="ad-page">
      <EmptyState icon="SearchX" title="Usuário não encontrado" action={<ButtonLink href="/admin/usuarios">Voltar para usuários</ButtonLink>} />
    </div>
  )
}

async function UserPage({ params }: { params: PageProps<'/admin/usuarios/[id]'>['params'] }) {
  const ctx = await allowed('usuarios')
  if (!ctx) return <SectionDenied />
  const { id } = await params
  // Id com formato estranho nem chega ao banco.
  if (!uuidSchema.safeParse(id).success) return <NotFound />
  const [u, catalog, access, { trails }] = await Promise.all([getUserDetail(id), getFullCatalog(), getUserCourseAccess(id), getTrails()])
  if (!u) return <NotFound />
  const paid = catalog.courses.flatMap((c) => (c.priceCents ? [{ id: c.id, title: c.title, priceCents: c.priceCents }] : []))

  const me = { id: ctx.id, role: ctx.role }
  const target = { id: u.id, role: u.role }
  const manage = canManage(me, target)
  const roles = assignableRoles(me, target)
  const goal = findTrail(trails, u.goal)?.title
  const stage = LIFE_STAGES.find((x) => x.id === u.stage)?.title
  const display = u.name || u.email

  return (
    <div className="ad-page">
      <Link href="/admin/usuarios" className="ad-back">
        <Icon name="ArrowLeft" size={16} />
        Usuários
      </Link>
      <AdminHead
        title={display}
        lead={u.email}
        actions={manage ? <SuspendButton userId={u.id} name={display} suspended={!!u.suspension} /> : null}
      >
        <div className="ad-ed-meta">
          {u.suspension ? <Badge tone="err">Suspenso</Badge> : <Badge tone="ok">Ativo</Badge>}
          <span>{ROLES[u.role].label}</span>
          {u.id === ctx.id && <em className="ad-demo">você</em>}
        </div>
      </AdminHead>

      {u.suspension && (
        <Notice tone="warn">
          Acesso suspenso em {fmtDateTime(u.suspension.at)}
          {u.suspension.by ? ` por ${u.suspension.by}` : ''}
          {u.suspension.reason ? `: ${u.suspension.reason}` : ''}. O histórico e o progresso continuam guardados.
        </Notice>
      )}

      <section className="ad-metrics small">
        <Metric label="Cadastro" value={fmtDate(u.createdAt)} />
        <Metric label="Último login" value={<Ago value={u.lastSignInAt} />} hint={u.lastSignInAt ? fmtDateTime(u.lastSignInAt) : undefined} />
        <Metric label="Dias ativos (30 dias)" value={fmtNum(u.activeDays30)} />
        <Metric
          label="Aulas concluídas"
          value={fmtNum(u.lessons)}
          hint={`${fmtNum(u.works)} projetos enviados · ${fmtNum(u.skills)} competências`}
        />
      </section>

      <section className="ad-grid-2">
        <div className="panel">
          <header className="ad-sec-head">
            <h2>Progresso nos cursos</h2>
          </header>
          {u.progress.length ? (
            <ul className="ad-prog">
              {u.progress.map((p) => {
                const course = catalog.courses.find((c) => c.id === p.courseId)
                const total = course ? courseCounts(course).published : 0
                const pct = total ? Math.min(100, Math.round((p.done / total) * 100)) : 0
                const title = course?.title ?? `Curso removido (${p.courseId})`
                return (
                  <li key={p.courseId}>
                    <div className="ad-prog-t">
                      <b>{title}</b>
                      <span>
                        {p.done}/{total || '?'} aulas · {pct}%
                      </span>
                    </div>
                    <Progress value={pct} tone="blue" size="sm" label={`Progresso em ${title}`} />
                    <small>
                      Matrícula em {fmtDate(p.startedAt)}
                      {p.lastAt ? ` · última aula concluída em ${fmtDate(p.lastAt)}` : ''}
                    </small>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="muted">Ainda não começou nenhum curso.</p>
          )}
        </div>
        <div className="panel">
          <header className="ad-sec-head">
            <h2>Perfil e acesso</h2>
          </header>
          <dl className="ad-dl">
            <div>
              <dt>Momento</dt>
              <dd>{stage || '—'}</dd>
            </div>
            <div>
              <dt>Objetivo</dt>
              <dd>{goal || '—'}</dd>
            </div>
            <div>
              <dt>Primeiro acesso concluído</dt>
              <dd>{u.onboarded ? 'Sim' : 'Não'}</dd>
            </div>
          </dl>
          <RoleChanger
            key={u.role}
            userId={u.id}
            current={u.role}
            options={roles}
            lockedHint={u.id === ctx.id ? 'Você não pode alterar o próprio papel.' : 'Seu papel não permite alterar o papel desta conta.'}
          />
        </div>
      </section>
      <section className="panel">
        <header className="ad-sec-head">
          <h2>Cursos pagos</h2>
        </header>
        {access ? (
          <CourseAccessPanel userId={u.id} courses={paid} access={access} />
        ) : (
          <p className="muted">Para ver e liberar cursos pagos, rode no Supabase o SQL do cupom de lançamento (veja supabase/README.md).</p>
        )}
      </section>
      <p className="ad-help">
        Por privacidade, a equipe vê só este resumo. Anotações, conteúdo dos projetos e currículo ficam visíveis apenas
        para o próprio aluno.
      </p>
    </div>
  )
}
