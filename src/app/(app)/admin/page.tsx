import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { LineChart } from '@/components/admin/LineChart'
import { SectionDenied, SectionLoading } from '@/components/admin/sections'
import { AdminHead, Bars, delta, fmtDate, fmtDateTime, fmtNum, fmtPct, Metric, Notice } from '@/components/admin/ui'
import { Icon } from '@/components/ui/Icon'
import { AUDIT_LABELS, can, roleChangeText } from '@/lib/admin/roles'
import { allowed, getOverview } from '@/lib/data/admin'
import { getCatalog } from '@/lib/data/catalog'

export const metadata: Metadata = { title: 'Visão geral' }

const PERIODS = [7, 30, 90] as const

export default function AdminOverviewPage({ searchParams }: PageProps<'/admin'>) {
  return (
    <Suspense fallback={<SectionLoading />}>
      <Overview searchParams={searchParams} />
    </Suspense>
  )
}

async function Overview({ searchParams }: { searchParams: PageProps<'/admin'>['searchParams'] }) {
  const ctx = await allowed('painel')
  if (!ctx) return <SectionDenied />
  const sp = await searchParams
  const asked = Number(Array.isArray(sp.dias) ? sp.dias[0] : sp.dias)
  const days = (PERIODS as readonly number[]).includes(asked) ? (asked as 7 | 30 | 90) : 30

  const [o, catalog] = await Promise.all([getOverview(days), getCatalog()])
  const cur = o.cur
  const prev = o.prev

  // Conclusão por curso: quem concluiu TODAS as aulas do curso (pelo catálogo atual).
  const courses = catalog.courses.map((c) => {
    const total = c.modules.reduce((n, m) => n + m.lessons.length, 0)
    const enrolled = o.enrolled.find((e) => e.courseId === c.id)?.n ?? 0
    const completed = o.lessonsHist
      .filter((h) => h.courseId === c.id && total > 0 && h.lessons >= total)
      .reduce((n, h) => n + h.users, 0)
    return { id: c.id, title: c.title, enrolled, completed }
  })
  const enrolledAll = courses.reduce((n, c) => n + c.enrolled, 0)
  const completedAll = courses.reduce((n, c) => n + c.completed, 0)
  const rate = enrolledAll ? (completedAll / enrolledAll) * 100 : null
  const seeUsers = can(ctx.role, 'usuarios')

  return (
    <div className="ad-page">
      <AdminHead
        title="Visão geral"
        lead="Indicadores calculados a partir das contas e do progresso salvo no banco."
      >
        <p className="ad-updated">
          <span className="ad-live-dot" />
          Dados de agora · {fmtDate(o.from)} a {fmtDate(o.to)}, comparado a {fmtDate(o.prevFrom)} a {fmtDate(o.prevTo)}
        </p>
      </AdminHead>

      <div className="ad-filters" role="group" aria-label="Período">
        <div className="seg seg-sm">
          {PERIODS.map((p) => (
            <Link key={p} href={p === 30 ? '/admin' : `/admin?dias=${p}`} className={days === p ? 'on' : ''} aria-current={days === p ? 'true' : undefined}>
              {p} dias
            </Link>
          ))}
        </div>
      </div>

      <section className="ad-metrics" aria-label="Indicadores">
        <Metric icon="BookOpen" label="Cursos no catálogo" value={fmtNum(catalog.courses.length)} hint="cadastro de cursos em breve" />
        <Metric
          icon="Users"
          label="Usuários cadastrados"
          value={fmtNum(o.totalUsers)}
          hint={`${fmtNum(o.onboarded)} concluíram o primeiro acesso`}
          href={seeUsers ? '/admin/usuarios' : undefined}
        />
        <Metric icon="Activity" label="Ativos no período" value={fmtNum(cur.activeUsers)} change={delta(cur.activeUsers, prev.activeUsers)} prev={fmtNum(prev.activeUsers)} />
        <Metric icon="UserCheck" label="Novos usuários" value={fmtNum(cur.newUsers)} change={delta(cur.newUsers, prev.newUsers)} prev={fmtNum(prev.newUsers)} />
        <Metric icon="LogIn" label="Matrículas" value={fmtNum(cur.enrollments)} change={delta(cur.enrollments, prev.enrollments)} prev={fmtNum(prev.enrollments)} />
        <Metric icon="CircleCheck" label="Aulas concluídas" value={fmtNum(cur.lessons)} change={delta(cur.lessons, prev.lessons)} prev={fmtNum(prev.lessons)} />
        <Metric icon="FolderKanban" label="Projetos concluídos" value={fmtNum(cur.projectsDone)} change={delta(cur.projectsDone, prev.projectsDone)} prev={fmtNum(prev.projectsDone)} />
        <Metric
          icon="Award"
          label="Taxa de conclusão"
          value={fmtPct(rate)}
          empty={rate === null}
          hint={enrolledAll ? `${fmtNum(completedAll)} de ${fmtNum(enrolledAll)} matrículas` : 'nenhuma matrícula ainda'}
        />
        {seeUsers && (
          <Metric icon="Ban" label="Contas suspensas" value={fmtNum(o.suspended)} href="/admin/usuarios?status=suspenso" />
        )}
      </section>

      <section className="ad-grid-2">
        <div className="panel">
          <LineChart title="Usuários ativos por dia" data={o.daily.map((p) => ({ d: p.d, v: p.active }))} />
        </div>
        <div className="panel">
          <LineChart title="Aulas concluídas por dia" data={o.daily.map((p) => ({ d: p.d, v: p.lessons }))} empty="Nenhuma aula concluída neste período." />
        </div>
        <div className="panel">
          <LineChart title="Matrículas por dia" data={o.daily.map((p) => ({ d: p.d, v: p.enrollments }))} />
        </div>
        <div className="panel">
          <LineChart title="Novos usuários por dia" data={o.daily.map((p) => ({ d: p.d, v: p.newUsers }))} />
        </div>
      </section>

      <section className="ad-grid-3">
        <div className="panel">
          <Bars title="Usuários por curso" items={courses.map((c) => ({ key: c.id, label: c.title, value: c.enrolled }))} empty="Nenhuma matrícula ainda." />
        </div>
        <div className="panel">
          <Bars title="Cursos com mais conclusões" items={courses.map((c) => ({ key: c.id, label: c.title, value: c.completed }))} empty="Nenhum curso concluído ainda." />
        </div>
        <div className="panel">
          <Bars
            title="Taxa de conclusão por curso (%)"
            items={courses.filter((c) => c.enrolled).map((c) => ({ key: c.id, label: c.title, value: Math.round((c.completed / c.enrolled) * 100) }))}
            empty="Nenhuma matrícula ainda."
          />
        </div>
      </section>

      {o.recent ? (
        <section className="panel">
          <header className="ad-sec-head">
            <h2>Atividades recentes</h2>
            <Link href="/admin/permissoes" className="ad-link">
              Ver histórico completo
            </Link>
          </header>
          {o.recent.length ? (
            <ol className="ad-feed">
              {o.recent.slice(0, 10).map((r, i) => {
                const meta = AUDIT_LABELS[r.kind] ?? { label: r.kind, icon: 'Info' }
                const detail = r.kind === 'permissao.alterada' ? roleChangeText(r.detail) : r.detail
                return (
                  <li key={i}>
                    <span className="ad-feed-ico">
                      <Icon name={meta.icon} size={15} />
                    </span>
                    <div>
                      <b>{meta.label}</b>
                      <span>
                        {r.target}
                        {detail ? ` · ${detail}` : ''}
                      </span>
                    </div>
                    <small>
                      {fmtDateTime(r.at)}
                      {r.by ? ` · ${r.by.split(' · ')[0]}` : ''}
                    </small>
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className="muted">Nenhuma atividade registrada ainda.</p>
          )}
        </section>
      ) : (
        <Notice>Atividades recentes e dados de pessoas aparecem para administradores.</Notice>
      )}
    </div>
  )
}
