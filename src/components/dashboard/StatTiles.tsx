'use client'

import { useRouter } from 'next/navigation'
import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { useApp } from '@/components/providers/AppState'
import { CountUp } from '@/components/ui/controls'
import { Icon, type IconName } from '@/components/ui/Icon'
import { lastWeeks } from '@/lib/domain/study'
import { plural } from '@/lib/format'
import { useToday } from '@/lib/use-today'

export type StatKey = 'aulas' | 'horas' | 'projetos' | 'certificados' | 'concluidos' | 'iniciados'

type Stat = {
  icon: IconName
  label: string
  value: number
  unit?: string
  decimals?: boolean
  to: string
  note: string
  tip: string
  empty?: boolean
  visual?: ReactNode
}

const oneDecimal = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')

/** Tempo assistido: minutos até 1 h, depois horas (com 1 casa até 10 h). */
function watchTime(seconds: number) {
  if (seconds < 3600) return { value: Math.floor(seconds / 60), unit: 'min' }
  const hours = seconds / 3600
  return hours < 10 ? { value: hours, unit: 'h', decimals: true } : { value: Math.round(hours), unit: 'h' }
}

/** Barrinhas das últimas 8 semanas. */
function MiniBars({ data }: { data: { start: string; n: number }[] }) {
  const max = Math.max(1, ...data.map((w) => w.n))
  return (
    <span className="mini-bars" aria-hidden="true">
      {data.map((w, i) => (
        <i key={w.start} style={{ height: `${Math.max(8, (w.n / max) * 100)}%` }} className={(w.n ? 'on' : '') + (i === data.length - 1 ? ' now' : '')} />
      ))}
    </span>
  )
}

/** Bolinhas dos certificados (cheia = conquistado, vazia = a caminho). */
function Pips({ total, filled, max = 8 }: { total: number; filled: number; max?: number }) {
  const shown = Math.min(total, max)
  return (
    <span className="pips" aria-hidden="true">
      {Array.from({ length: shown }, (_, i) => (
        <i key={i} className={i < Math.min(filled, max) ? 'on' : ''} />
      ))}
      {total > max && <em>+{total - max}</em>}
    </span>
  )
}

function useStats(): Record<StatKey, Stat> {
  const { d } = useApp()
  const m = d.metrics
  const today = useToday()
  const weeks = useMemo(() => (today ? lastWeeks(d.doneLog, today, 8) : []), [d.doneLog, today])
  const time = watchTime(m.watchSec)
  const thisWeek = weeks.length ? weeks[weeks.length - 1].n : null

  return {
    aulas: {
      icon: 'BookOpen',
      label: 'Aulas concluídas',
      value: m.lessonsDone,
      to: '/progresso',
      note: m.lessonsDone ? (thisWeek === null ? 'aulas marcadas como concluídas' : `${thisWeek} nesta semana`) : 'Conclua a primeira aula de um curso',
      visual: m.lessonsDone && weeks.length ? <MiniBars data={weeks} /> : null,
      tip: 'Aulas marcadas como concluídas. Cada aula conta uma vez.',
    },
    horas: {
      icon: 'Clock',
      label: 'Horas de aprendizado',
      value: time.value,
      unit: time.unit,
      decimals: time.decimals,
      to: '/progresso',
      note: m.watchSec >= 60 ? 'tempo com aulas em reprodução' : 'Começa a contar quando uma aula toca no player',
      tip: 'Soma do tempo em que o vídeo da aula esteve tocando, medido pelo player. Aulas abertas fora da Folyo (YouTube, Vimeo) não entram.',
      empty: m.watchSec < 60,
    },
    projetos: {
      icon: 'FolderKanban',
      label: 'Projetos enviados',
      value: m.projectsAdded,
      to: '/projetos',
      note: m.projectsAdded
        ? `PDFs e links${m.coursesWithProject ? ` · ${plural(m.coursesWithProject, 'curso', 'cursos')} com projeto` : ''}`
        : 'Envie o projeto de um curso em PDF ou link',
      tip: 'PDFs e links que você anexou como projeto (de cursos ou feitos fora da Folyo). Cada material conta uma vez.',
    },
    certificados: {
      icon: 'Award',
      label: 'Certificados conquistados',
      value: m.certificates,
      to: '/certificados',
      note: m.certPending
        ? `${plural(m.certPending, 'certificado', 'certificados')} a caminho`
        : m.certificates
          ? 'aulas concluídas e projeto enviado'
          : 'Conclua as aulas e envie o projeto de um curso',
      visual: m.certificates + m.certPending ? <Pips total={m.certificates + m.certPending} filled={m.certificates} max={8} /> : null,
      tip: 'Certificados dos cursos com todas as aulas concluídas e o projeto enviado.',
    },
    concluidos: {
      icon: 'CircleCheck',
      label: 'Cursos concluídos',
      value: m.coursesCompleted,
      to: '/certificados',
      note: 'todas as aulas concluídas',
      tip: 'Cursos com 100% das aulas concluídas.',
    },
    iniciados: {
      icon: 'Play',
      label: 'Cursos iniciados',
      value: m.coursesStarted,
      to: '/inicio',
      note: 'em andamento, ainda não concluídos',
      tip: 'Cursos que você começou e ainda não concluiu.',
    },
  }
}

/** Cartões de números da trajetória (Início, Progresso e Projetos). */
export function StatTiles({ keys, variant = 'tiles' }: { keys: StatKey[]; variant?: string }) {
  const stats = useStats()
  const router = useRouter()
  return (
    <div className="jstats-wrap">
      <ul className={'jstats jstats-' + variant + ' jstats-' + keys.length}>
        {keys.map((key, i) => {
          const stat = stats[key]
          return (
            <li key={key} className={'jstat jstat-' + key + (stat.empty ? ' is-empty' : '')} style={{ '--i': i } as CSSProperties}>
              <button type="button" onClick={() => router.push(stat.to)} title={stat.tip}>
                <span className="jstat-top">
                  <span className="jstat-ico">
                    <Icon name={stat.icon} size={18} />
                  </span>
                  <span className="jstat-k">{stat.label}</span>
                </span>
                <span className="jstat-v">
                  <b>{stat.decimals ? oneDecimal(stat.value) : <CountUp value={stat.value} />}</b>
                  {stat.unit && <small>{stat.unit}</small>}
                </span>
                <small className="jstat-note">{stat.note}</small>
                {stat.visual && <span className="jstat-vis">{stat.visual}</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
