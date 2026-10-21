'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useApp } from '@/components/providers/AppState'
import { Art } from '@/components/ui/Art'
import { Button } from '@/components/ui/Button'
import { ChipInput, Field } from '@/components/ui/controls'
import { Icon } from '@/components/ui/Icon'
import { Avatar, DemoTag, EvidenceMeter } from '@/components/ui/indicators'
import { Modal } from '@/components/ui/Modal'
import { formatDate } from '@/lib/format'
import { fieldErrors, LIMITS, profileSchema } from '@/lib/validation'

const INTEREST_SUGGESTIONS = [
  'Marketing',
  'Vendas',
  'Programação',
  'Design',
  'Arquitetura',
  'Dados',
  'Finanças',
  'Educação',
  'Inglês',
  'Empreendedorismo',
]

type ProfileDraft = { name: string; headline: string; city: string; bio: string; objective: string; interests: string[] }

function EditProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { s, a, toast } = useApp()
  const [draft, setDraft] = useState<ProfileDraft | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setDraft({
        name: s.user.name,
        headline: s.user.headline,
        city: s.user.city,
        bio: s.user.bio,
        objective: s.user.objective,
        interests: [...s.user.interests],
      })
      setErrors({})
    }
  }
  if (!open || !draft) return null

  const save = () => {
    const parsed = profileSchema.safeParse(draft)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    const { name, ...rest } = parsed.data
    a.setUser(rest)
    if (name !== s.user.name) a.saveName(name)
    toast('Perfil atualizado.', 'ok')
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Editar perfil"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button icon="Check" onClick={save}>
            Salvar perfil
          </Button>
        </>
      }
    >
      <div className="grid-form">
        <Field label="Nome" id="ep-name" error={errors.name}>
          <input id="ep-name" className="inp" maxLength={80} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        <Field label="Cidade" id="ep-city">
          <input id="ep-city" className="inp" maxLength={80} value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
        </Field>
        <Field label="Apresentação curta" id="ep-head" className="span-2" hint="Aparece abaixo do seu nome.">
          <input
            id="ep-head"
            className="inp"
            maxLength={LIMITS.title}
            value={draft.headline}
            onChange={(e) => setDraft({ ...draft, headline: e.target.value })}
          />
        </Field>
        <Field label="Sobre você" id="ep-bio" className="span-2" error={errors.bio} hint={`${draft.bio.length}/400`}>
          <textarea id="ep-bio" className="ta" rows={4} maxLength={400} value={draft.bio} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} />
        </Field>
        <Field label="Objetivo de carreira" id="ep-obj" className="span-2" hint="O mesmo texto aparece no currículo.">
          <textarea
            id="ep-obj"
            className="ta"
            rows={2}
            maxLength={500}
            value={draft.objective}
            onChange={(e) => setDraft({ ...draft, objective: e.target.value })}
          />
        </Field>
        <Field label="Áreas de interesse" id="ep-int" className="span-2">
          <ChipInput
            id="ep-int"
            values={draft.interests}
            onChange={(v) => setDraft({ ...draft, interests: v })}
            suggestions={INTEREST_SUGGESTIONS}
          />
        </Field>
      </div>
    </Modal>
  )
}

export function ProfileView() {
  const { s, d } = useApp()
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const topSkills = [...d.skills]
    .filter((k) => k.type !== 'idioma')
    .sort((x, y) => y.level - x.level)
    .slice(0, 6)
  const featured = d.projectsDone.slice(0, 3)

  return (
    <div className="page surface-paper profile-page">
      <section className="profile-hero rise">
        <div className="profile-hero-in">
          <Avatar name={s.user.name} size={104} ring />
          <div className="ph-text">
            <h1 className="display">{s.user.name}</h1>
            <p className="ph-headline">{s.user.headline}</p>
            <p className="ph-meta">
              {s.user.city && (
                <span>
                  <Icon name="MapPin" size={15} />
                  {s.user.city}
                </span>
              )}
              <span>
                <Icon name="Calendar" size={15} />
                Na Folyo desde {formatDate(s.user.joined)}
              </span>
            </p>
          </div>
          <div className="ph-actions">
            <Button variant="go" icon="Pencil" onClick={() => setEditing(true)}>
              Editar perfil
            </Button>
          </div>
        </div>
        <div className="ph-strip">
          <div>
            <b>{d.completedCourses.length}</b>
            <span>cursos concluídos</span>
          </div>
          <div>
            <b>{d.projectsDone.length}</b>
            <span>projetos concluídos</span>
          </div>
          <div>
            <b>{d.certificates.length}</b>
            <span>certificados</span>
          </div>
          <div>
            <b>{d.skills.filter((k) => k.demonstrated).length}</b>
            <span>competências demonstradas</span>
          </div>
        </div>
      </section>

      <div className="profile-cols">
        <div className="profile-main">
          <section className="pf-sec">
            <h2 className="h-sec">Sobre</h2>
            {s.user.bio ? (
              <p className="pf-bio">{s.user.bio}</p>
            ) : (
              <p className="muted">Conte um pouco sobre você em &quot;Editar perfil&quot;.</p>
            )}
          </section>
          <section className="pf-sec">
            <h2 className="h-sec">Objetivo de carreira</h2>
            {s.user.objective ? (
              <p>{s.user.objective}</p>
            ) : (
              <p className="muted">Escreva seu objetivo profissional em &quot;Editar perfil&quot; ou no currículo.</p>
            )}
            {d.goal && (
              <p className="muted small">
                Objetivo principal na Folyo: <Link href="/objetivos">{d.goal.title}</Link>
              </p>
            )}
          </section>
          <section className="pf-sec">
            <div className="section-head">
              <h2 className="h-sec">Projetos em destaque</h2>
              <Link href="/projetos" className="link-sm">
                Todos <Icon name="ArrowRight" size={14} />
              </Link>
            </div>
            <div className="pf-projects">
              {featured.map((p, i) => (
                <button key={p.id} type="button" className="pf-proj" onClick={() => router.push('/projetos/' + p.id)}>
                  <Art tone={p.tone} seed={i + 1} ratio="16 / 9" />
                  <b>{p.title}</b>
                  <small>{p.skills.slice(0, 2).join(' · ')}</small>
                </button>
              ))}
              {!featured.length && <p className="muted">Finalize um projeto para destacá-lo aqui.</p>}
            </div>
          </section>
          <section className="pf-sec">
            <h2 className="h-sec">Experiências</h2>
            {!s.user.experiences.length && <p className="muted">Nenhuma experiência ainda. Adicione no currículo.</p>}
            <ul className="pf-list">
              {s.user.experiences.map((x) => (
                <li key={x.id}>
                  <b>{x.role}</b>
                  <span>{x.org}</span>
                  <small>{x.period}</small>
                </li>
              ))}
            </ul>
          </section>
          <section className="pf-sec">
            <h2 className="h-sec">Formação</h2>
            {!s.user.education.length && <p className="muted">Nenhuma formação ainda. Adicione no currículo.</p>}
            <ul className="pf-list">
              {s.user.education.map((e) => (
                <li key={e.id}>
                  <b>{e.course}</b>
                  <span>{e.inst}</span>
                  <small>{e.period}</small>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="profile-side">
          <section className="side-card">
            <p className="eyebrow">Competências principais</p>
            {!topSkills.length && <p className="muted small">Suas competências aparecem aqui conforme você estuda.</p>}
            <ul className="pf-skills">
              {topSkills.map((k) => (
                <li key={k.id}>
                  <span>{k.name}</span>
                  <EvidenceMeter level={k.level} compact />
                </li>
              ))}
            </ul>
            <Link href="/competencias" className="link-sm">
              Gerenciar competências <Icon name="ArrowRight" size={14} />
            </Link>
          </section>
          <section className="side-card">
            <p className="eyebrow">Áreas de interesse</p>
            {!s.user.interests.length && <p className="muted small">Escolha suas áreas em &quot;Editar perfil&quot;.</p>}
            <div className="chips">
              {s.user.interests.map((x) => (
                <span key={x} className="chip-static">
                  {x}
                </span>
              ))}
            </div>
          </section>
          <section className="side-card">
            <p className="eyebrow">Cursos e certificados</p>
            {!d.completedCourses.length && !d.inProgress.length && (
              <p className="muted small">Nenhum curso começado ainda.</p>
            )}
            <ul className="pf-mini">
              {d.completedCourses.map((c) => (
                <li key={c.id}>
                  <Icon name={d.courseStats[c.id].certified ? 'Award' : 'BookOpen'} size={15} />
                  <Link href={'/cursos/' + c.id}>{c.title}</Link>
                </li>
              ))}
              {d.inProgress.map((c) => (
                <li key={c.id} className="muted">
                  <Icon name="CircleDot" size={15} />
                  <Link href={'/cursos/' + c.id}>{c.title}</Link>
                  <small>{d.courseStats[c.id].pct}%</small>
                </li>
              ))}
            </ul>
          </section>
          <section className="side-card">
            <p className="eyebrow">Idiomas</p>
            <ul className="pf-mini">
              {s.user.languages.map((l) => (
                <li key={l.id}>
                  <Icon name="Languages" size={15} />
                  {l.name}
                  <small>{l.level}</small>
                </li>
              ))}
            </ul>
          </section>
          <section className="side-card">
            <p className="eyebrow">Portfólio público</p>
            <p className="pf-link">
              <DemoTag>Em breve</DemoTag>
            </p>
            <p className="muted small">
              Em breve você vai ter um endereço próprio para mostrar seu perfil e seus projetos.{' '}
              {s.settings.publicProfile ? 'Hoje ele está marcado como público.' : 'Hoje ele está marcado como privado.'}{' '}
              <Link href="/configuracoes">Privacidade</Link>
            </p>
          </section>
        </aside>
      </div>
      <EditProfileModal open={editing} onClose={() => setEditing(false)} />
    </div>
  )
}
