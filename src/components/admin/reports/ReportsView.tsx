'use client'

import { useMemo, useState, useTransition, type ReactNode } from 'react'
import { useApp } from '@/components/providers/AppState'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/controls'
import { Icon, type IconName } from '@/components/ui/Icon'
import { EmptyState } from '@/components/ui/indicators'
import { logExportAction } from '@/lib/actions/reports'
import { downloadCsv, toCsv } from '@/lib/admin/csv'
import { fmtDayFull, type Period } from '@/lib/admin/period'
import { STATUS_INFO, type CourseStatus } from '@/lib/admin/catalog'
import type { Report } from '@/lib/data/audience'
import { DataTable, type Column } from '../catalog/DataTable'
import { LineChart } from '../LineChart'
import { PeriodBar } from '../PeriodBar'
import { AdminHead, fmtDateTime, fmtDuration, fmtNum, fmtPct, Notice } from '../ui'

export type ReportCourse = { id: string; title: string; status: CourseStatus; lessons: { id: string; title: string }[] }

type Kind = 'crescimento' | 'matriculas' | 'cursos' | 'aulas' | 'atividade'
const KINDS: { id: Kind; label: string; icon: IconName; hint?: string }[] = [
  { id: 'crescimento', label: 'Crescimento de usuários', icon: 'TrendingUp' },
  { id: 'matriculas', label: 'Matrículas por período', icon: 'LogIn', hint: 'A série diária considera todos os cursos' },
  { id: 'cursos', label: 'Desempenho por curso', icon: 'BookOpen', hint: 'Visualizações, tempo assistido, progresso médio e conclusão' },
  { id: 'aulas', label: 'Aulas mais assistidas', icon: 'Play' },
  { id: 'atividade', label: 'Atividade dos usuários', icon: 'Activity', hint: 'As 2.000 contas mais ativas do período' },
]

const DEFINITIONS: [string, string][] = [
  ['Usuário cadastrado', 'Conta criada na Folyo. Data de cadastro = criação da conta.'],
  ['Usuário ativo no dia', 'Conta que abriu a plataforma naquele dia (uma por conta por dia).'],
  ['Matrícula', 'Primeira vez que a conta começa um curso (abre uma aula dele). Uma por conta por curso.'],
  ['Visualização', 'Primeiro play de uma aula por uma conta em um dia. Plays repetidos no mesmo dia somam tempo, mas não contam outra visualização. Abrir a página do curso não conta.'],
  ['Visualização concluída', 'A reprodução chegou a 90% da duração da aula ou o vídeo terminou.'],
  ['Tempo assistido', 'Tempo com o player em reprodução, medido a cada sinal. Cada sinal soma no máximo o tempo real desde o anterior, então não dá para inflar o número.'],
  ['Progresso médio', 'Média, entre as matrículas, de aulas concluídas ÷ aulas publicadas do curso.'],
  ['Conclusão de curso', 'Todas as aulas publicadas do curso marcadas como concluídas pela conta.'],
  ['Taxa de conclusão', 'Matrículas concluídas ÷ matrículas iniciadas.'],
  ['Alcance médio da aula', 'Média de até onde cada visualização chegou (maior posição ÷ duração).'],
]

type Row = { id: string } & Record<string, string | number | null>
type Def = {
  rows: Row[]
  columns: Column<Row>[]
  csv: { label: string; get: (r: Row) => string | number | null }[]
  chart?: { title: string; data: { d: string; v: number }[] }
}

const num = (key: string, label: string, render?: (r: Row) => ReactNode, csvGet?: (r: Row) => string | number | null) =>
  ({ col: { key, label, num: true, sortValue: (r: Row) => Number(r[key] ?? -1), render: render ?? ((r: Row) => fmtNum(Number(r[key] ?? 0))) } satisfies Column<Row>, csv: { label, get: csvGet ?? ((r: Row) => r[key]) } })
const txt = (key: string, label: string, render?: (r: Row) => ReactNode, csvGet?: (r: Row) => string | number | null) =>
  ({ col: { key, label, render } satisfies Column<Row>, csv: { label, get: csvGet ?? ((r: Row) => r[key]) } })

export function ReportsView({ report, courses, period, initialKind }: { report: Report | null; courses: ReportCourse[]; period: Period; initialKind: Kind }) {
  const { toast } = useApp()
  const [kind, setKind] = useState<Kind>(initialKind)
  const [course, setCourse] = useState('all')
  const [withEmail, setWithEmail] = useState(false)
  const [pending, start] = useTransition()

  const def = useMemo<Def | null>(() => {
    if (!report) return null
    const build = (parts: ReturnType<typeof num | typeof txt>[], rows: Row[], chart?: Def['chart']): Def => ({
      rows,
      columns: parts.map((p) => p.col),
      csv: parts.map((p) => p.csv),
      chart,
    })
    const titleOf = new Map(courses.map((c) => [c.id, c.title]))
    const lessonOf = new Map(courses.flatMap((c) => c.lessons.map((l, i) => [l.id, { title: l.title, n: i + 1 }] as const)))

    if (kind === 'crescimento') {
      let total = report.usersBefore
      const rows: Row[] = report.daily.map((d) => {
        total += d.newUsers
        return { id: d.d, dia: d.d, novos: d.newUsers, total, ativos: d.active }
      })
      return build(
        [txt('dia', 'Dia', (r) => fmtDayFull(String(r.dia))), num('novos', 'Novas contas'), num('total', 'Total acumulado'), num('ativos', 'Usuários ativos')],
        rows,
        { title: 'Total de contas ao fim de cada dia', data: rows.map((r) => ({ d: String(r.dia), v: Number(r.total) })) },
      )
    }
    if (kind === 'matriculas') {
      const rows: Row[] = report.daily.map((d) => ({ id: d.d, dia: d.d, matriculas: d.enrollments, conclusoes: d.completions }))
      return build(
        [txt('dia', 'Dia', (r) => fmtDayFull(String(r.dia))), num('matriculas', 'Matrículas'), num('conclusoes', 'Cursos concluídos')],
        rows,
        { title: 'Matrículas por dia', data: rows.map((r) => ({ d: String(r.dia), v: Number(r.matriculas) })) },
      )
    }
    if (kind === 'cursos') {
      const byId = new Map(report.courses.map((c) => [c.id, c]))
      const rows: Row[] = courses
        .filter((c) => course === 'all' || c.id === course)
        .map((c) => {
          const r = byId.get(c.id)
          return {
            id: c.id,
            title: c.title,
            status: STATUS_INFO[c.status].label,
            enrolled: r?.enrolled ?? 0,
            views: r?.views ?? 0,
            watched: r?.watched ?? 0,
            avgProgress: r?.avgProgress ?? null,
            completed: r?.completed ?? 0,
            rate: r && r.enrolled ? Math.round((r.completed / r.enrolled) * 1000) / 10 : null,
          }
        })
      return build(
        [
          txt('title', 'Curso'),
          txt('status', 'Status'),
          num('enrolled', 'Matrículas (total)'),
          num('views', 'Visualizações no período'),
          num('watched', 'Tempo assistido', (r) => fmtDuration(Number(r.watched)), (r) => Math.round(Number(r.watched) / 60)),
          num('avgProgress', 'Progresso médio', (r) => fmtPct(r.avgProgress as number | null), (r) => r.avgProgress ?? ''),
          num('completed', 'Concluídos'),
          num('rate', 'Taxa de conclusão', (r) => fmtPct(r.rate as number | null), (r) => r.rate ?? ''),
        ],
        rows,
      )
    }
    if (kind === 'aulas') {
      const rows: Row[] = report.lessons
        .filter((l) => lessonOf.has(l.id) && (course === 'all' || l.courseId === course))
        .map((l) => ({ id: l.id, lesson: `${lessonOf.get(l.id)!.n}. ${lessonOf.get(l.id)!.title}`, course: titleOf.get(l.courseId) ?? l.courseId, views: l.views, viewers: l.viewers, completed: l.completed, watched: l.watched, reach: l.reach }))
      return build(
        [
          txt('lesson', 'Aula'),
          txt('course', 'Curso'),
          num('views', 'Visualizações'),
          num('viewers', 'Pessoas'),
          num('completed', 'Concluídas'),
          num('watched', 'Tempo assistido', (r) => fmtDuration(Number(r.watched)), (r) => Math.round(Number(r.watched) / 60)),
          num('reach', 'Alcance médio', (r) => fmtPct(r.reach as number | null), (r) => r.reach ?? ''),
        ],
        rows,
      )
    }
    const rows: Row[] = report.activity.map((a) => ({ id: a.id, nome: a.name || '—', email: a.email, dias: a.days, views: a.views, tempo: a.watched, ultima: a.last, status: a.suspended ? 'Suspensa' : 'Ativa' }))
    return build(
      [
        txt('nome', 'Nome'),
        ...(withEmail ? [txt('email', 'E-mail')] : []),
        num('dias', 'Dias ativos'),
        num('views', 'Visualizações'),
        num('tempo', 'Tempo assistido', (r) => fmtDuration(Number(r.tempo)), (r) => Math.round(Number(r.tempo) / 60)),
        txt('ultima', 'Última atividade', (r) => (r.ultima ? fmtDateTime(String(r.ultima)) : '—'), (r) => r.ultima ?? ''),
        txt('status', 'Status'),
      ],
      rows,
    )
  }, [report, courses, kind, course, withEmail])

  const current = KINDS.find((k) => k.id === kind)!
  const exportCsv = () => {
    if (!def) return
    const name = `folyo-${kind}-${period.from}-a-${period.to}.csv`
    downloadCsv(name, toCsv(def.rows, def.csv))
    toast('Arquivo CSV gerado.', 'ok')
    // Fica no histórico de auditoria quem exportou o quê (erro aqui não atrapalha o arquivo já baixado).
    start(async () => {
      await logExportAction({ report: kind, rows: def.rows.length, from: period.from, to: period.to })
    })
  }

  return (
    <div className="ad-page">
      <AdminHead
        title="Relatórios"
        lead="Escolha um relatório, ajuste o período e exporte em CSV (separado por ponto e vírgula, abre direto no Excel)."
        actions={
          <Button icon="Download" onClick={exportCsv} disabled={pending || !def || !def.rows.length}>
            Exportar CSV
          </Button>
        }
      />
      <nav className="ad-rep-nav" aria-label="Relatórios">
        {KINDS.map((k) => (
          <button key={k.id} type="button" className={kind === k.id ? 'on' : ''} aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
            <Icon name={k.icon} size={16} />
            {k.label}
          </button>
        ))}
      </nav>
      <PeriodBar base="/admin/relatorios" extra={{ tipo: kind }} period={period}>
        {(kind === 'cursos' || kind === 'aulas') && (
          <Select id="rp-c" label="Curso" value={course} onChange={setCourse} options={[{ value: 'all', label: 'Todos os cursos' }, ...courses.map((c) => ({ value: c.id, label: c.title }))]} />
        )}
        {kind === 'atividade' && (
          <label className="ad-check">
            <input type="checkbox" checked={withEmail} onChange={(e) => setWithEmail(e.target.checked)} />
            <span>Incluir e-mail</span>
          </label>
        )}
      </PeriodBar>

      {!def ? (
        <Notice tone="err">Não foi possível carregar os dados agora.</Notice>
      ) : (
        <>
          {current.hint && <p className="ad-help">{current.hint}.</p>}
          {def.chart && (
            <div className="panel">
              <LineChart title={def.chart.title} data={def.chart.data} />
            </div>
          )}
          <div className="panel flush">
            <DataTable
              caption={current.label}
              rows={def.rows}
              columns={def.columns}
              pageSize={15}
              resetKey={kind + course}
              empty={
                <EmptyState icon="FileSpreadsheet" title="Sem dados para este relatório">
                  Nada foi registrado neste período com os filtros escolhidos.
                </EmptyState>
              }
            />
          </div>
        </>
      )}

      <details className="panel ad-defs">
        <summary>
          <Icon name="CircleHelp" size={16} />
          Como cada indicador é calculado
        </summary>
        <dl>
          {DEFINITIONS.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="ad-help">Os eventos começaram a ser registrados quando o player novo foi publicado. Nada anterior é estimado. Dias são contados no horário de Brasília.</p>
      </details>
    </div>
  )
}
