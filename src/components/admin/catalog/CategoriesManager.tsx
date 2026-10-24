'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useApp } from '@/components/providers/AppState'
import { Button, IconButton } from '@/components/ui/Button'
import { ChipInput, Field, Toggle } from '@/components/ui/controls'
import { Icon, type IconName } from '@/components/ui/Icon'
import { EmptyState } from '@/components/ui/indicators'
import { Modal } from '@/components/ui/Modal'
import {
  deleteCategoryAction,
  renameTagAction,
  reorderAction,
  saveCategoryAction,
  saveTagsAction,
  setFeaturedAction,
} from '@/lib/actions/catalog'
import { CATALOG_LIMITS as L, CATEGORY_ICONS, slugify, type AdminCategory } from '@/lib/admin/catalog'
import { handleGroupKeys } from '@/lib/a11y'
import { imageUrl, type MediaItem } from '@/lib/media'
import { MediaPicker } from '../media/MediaPicker'
import { AdminHead, Notice } from '../ui'
import { ReorderModal } from './ReorderModal'

type Props = {
  categories: AdminCategory[]
  /** Quantos cursos usam cada categoria. */
  usage: Record<string, number>
  featured: { id: string; title: string }[]
  /** Tags sugeridas no cadastro (lista guardada no banco). */
  suggested: string[]
  /** Todas as tags em uso, com a contagem de cursos. */
  tagUsage: { tag: string; count: number }[]
  /** Biblioteca de mídia (imagens) para escolher a imagem da categoria. */
  media: MediaItem[]
}

export function CategoriesManager({ categories, usage, featured, suggested, tagUsage, media }: Props) {
  const router = useRouter()
  const { toast } = useApp()
  const [edit, setEdit] = useState<{ cat: AdminCategory; isNew: boolean } | null>(null)
  const [removing, setRemoving] = useState<AdminCategory | null>(null)
  const [reorder, setReorder] = useState(false)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const count = (id: string) => usage[id] ?? 0

  const toggleActive = (c: AdminCategory) =>
    start(async () => {
      setError('')
      const r = await saveCategoryAction({ category: { id: c.id, name: c.name, desc: c.desc, icon: c.icon, active: !c.active, media: c.media }, isNew: false })
      if (!r.ok) return setError(r.error)
      toast(c.active ? 'Categoria desativada: ela some dos filtros do catálogo.' : 'Categoria ativada.', 'ok')
      router.refresh()
    })

  const removeFeatured = (id: string) =>
    start(async () => {
      setError('')
      const r = await setFeaturedAction({ id, featured: false })
      if (!r.ok) return setError(r.error)
      toast('Removido dos destaques.', 'ok')
      router.refresh()
    })

  return (
    <div className="ad-page">
      <AdminHead
        title="Categorias e organização"
        lead="Categorias aparecem como filtros em Explorar cursos, na ordem definida aqui. Categorias desativadas somem dos filtros, mas os cursos continuam no catálogo."
        actions={
          <>
            <Button variant="quiet" icon="ArrowUpDown" disabled={!categories.length} onClick={() => setReorder(true)}>
              Reordenar
            </Button>
            <Button icon="Plus" onClick={() => setEdit({ isNew: true, cat: { id: '', name: '', desc: '', icon: 'Layers', order: categories.length, active: true, media: null } })}>
              Nova categoria
            </Button>
          </>
        }
      />
      {error && <Notice tone="err">{error}</Notice>}

      <div className="panel flush">
        {categories.length ? (
          <ul className="ad-cats">
            {categories.map((c, i) => (
              <li key={c.id} className={c.active ? '' : 'off'}>
                <span className="ad-cat-n">{i + 1}</span>
                <span className="ad-cat-ico">
                  {(() => {
                    const file = c.media ? media.find((m) => m.id === c.media && m.kind === 'image') : undefined
                    // eslint-disable-next-line @next/next/no-img-element -- imagem pública do Storage
                    return file ? <img src={imageUrl(file.path)} alt="" width={36} height={36} style={{ borderRadius: 10, objectFit: 'cover' }} /> : <Icon name={c.icon as IconName} size={18} />
                  })()}
                </span>
                <span className="ad-cat-t">
                  <b>{c.name}</b>
                  <small>
                    {c.desc || 'Sem descrição'} · {count(c.id)} {count(c.id) === 1 ? 'curso' : 'cursos'}
                  </small>
                </span>
                <label className="ad-switch">
                  <input type="checkbox" checked={c.active} disabled={pending} onChange={() => toggleActive(c)} />
                  <span>{c.active ? 'Ativa' : 'Inativa'}</span>
                </label>
                <IconButton icon="SquarePen" label={`Editar ${c.name}`} onClick={() => setEdit({ cat: { ...c }, isNew: false })} />
                <IconButton icon="Trash2" label={`Excluir ${c.name}`} onClick={() => (setError(''), setRemoving(c))} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="Tags" title="Nenhuma categoria">
            Crie a primeira categoria para poder cadastrar cursos.
          </EmptyState>
        )}
      </div>

      <section className="ad-grid-2">
        <div className="panel">
          <header className="ad-sec-head">
            <h2>Cursos em destaque</h2>
          </header>
          <p className="ad-help">O primeiro curso em destaque, pela ordem do catálogo, ocupa o bloco grande de Explorar cursos.</p>
          {featured.length ? (
            <ul className="ad-simple">
              {featured.map((c) => (
                <li key={c.id}>
                  <Icon name="Star" size={15} />
                  <span className="grow">{c.title}</span>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => removeFeatured(c.id)}>
                    Remover
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nenhum curso em destaque. Marque “Curso em destaque” na aba Publicação de um curso.</p>
          )}
        </div>
        <TagsPanel suggested={suggested} usage={tagUsage} />
      </section>

      {edit && <CategoryDialog key={edit.cat.id || 'nova'} value={edit} others={categories} media={media} onClose={() => setEdit(null)} />}

      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        size="sm"
        title="Excluir categoria?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={pending || (!!removing && count(removing.id) > 0)}
              onClick={() =>
                start(async () => {
                  if (!removing) return
                  const r = await deleteCategoryAction({ id: removing.id })
                  if (!r.ok) return toast(r.error, 'err')
                  toast('Categoria excluída.', 'ok')
                  setRemoving(null)
                  router.refresh()
                })
              }
            >
              Excluir
            </Button>
          </>
        }
      >
        {removing &&
          (count(removing.id) > 0 ? (
            <Notice tone="warn">
              {count(removing.id)} {count(removing.id) === 1 ? 'curso usa' : 'cursos usam'} esta categoria. Mova esses cursos para outra categoria antes de excluir, ou apenas desative a categoria.
            </Notice>
          ) : (
            <p className="muted">“{removing.name}” será removida. Nenhum curso usa esta categoria.</p>
          ))}
      </Modal>

      <ReorderModal
        open={reorder}
        onClose={() => setReorder(false)}
        items={categories.map((c) => ({ id: c.id, label: c.name }))}
        title="Ordem das categorias"
        hint="É a ordem dos filtros em Explorar cursos."
        onSave={async (ids) => {
          const r = await reorderAction({ kind: 'categorias', ids })
          if (r.ok) {
            toast('Ordem das categorias salva.', 'ok')
            router.refresh()
          }
          return r
        }}
      />
    </div>
  )
}

function CategoryDialog({ value, others, media, onClose }: { value: { cat: AdminCategory; isNew: boolean }; others: AdminCategory[]; media: MediaItem[]; onClose: () => void }) {
  const router = useRouter()
  const { toast } = useApp()
  const [cat, setCat] = useState(value.cat)
  const [nameError, setNameError] = useState('')
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const [picking, setPicking] = useState(false)
  const image = cat.media ? media.find((m) => m.id === cat.media && m.kind === 'image') : undefined

  const save = () => {
    const name = cat.name.trim()
    if (name.length < L.categoryName.min) return setNameError('Dê um nome com pelo menos 3 caracteres.')
    if (others.some((o) => o.id !== cat.id && o.name.trim().toLowerCase() === name.toLowerCase())) return setNameError('Já existe uma categoria com esse nome.')
    setNameError('')
    start(async () => {
      setError('')
      const id = cat.id || slugify(name, 'categoria')
      const r = await saveCategoryAction({ category: { id, name, desc: cat.desc, icon: cat.icon, active: cat.active, media: cat.media }, isNew: value.isNew })
      if (!r.ok) return setError(r.error)
      toast(value.isNew ? 'Categoria criada.' : 'Categoria atualizada.', 'ok')
      onClose()
      router.refresh()
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={value.isNew ? 'Nova categoria' : 'Editar categoria'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={pending} onClick={save}>
            {pending ? 'Salvando…' : 'Salvar'}
          </Button>
        </>
      }
    >
      <div className="ad-fgrid">
        <Field label="Nome *" id="cat-name" error={nameError} className="span-2">
          <input id="cat-name" className="inp" value={cat.name} maxLength={L.categoryName.max} onChange={(e) => setCat({ ...cat, name: e.target.value })} />
        </Field>
        <Field label="Descrição" id="cat-desc" className="span-2">
          <textarea id="cat-desc" className="ta" rows={2} maxLength={L.categoryDesc} value={cat.desc} onChange={(e) => setCat({ ...cat, desc: e.target.value })} />
        </Field>
      </div>
      <p className="ad-label">Ícone</p>
      <div
        className="ad-icon-grid"
        role="radiogroup"
        aria-label="Ícone"
        onKeyDown={(e) => handleGroupKeys(e, '[role="radio"]', { select: true, vertical: true })}
      >
        {CATEGORY_ICONS.map((name, i) => (
          <button key={name} type="button" role="radio" aria-checked={cat.icon === name} aria-label={name} tabIndex={((CATEGORY_ICONS as readonly string[]).includes(cat.icon) ? cat.icon === name : i === 0) ? 0 : -1} className={cat.icon === name ? 'on' : ''} onClick={() => setCat({ ...cat, icon: name })}>
            <Icon name={name} size={18} />
          </button>
        ))}
      </div>
      <p className="ad-label" style={{ marginTop: 14 }}>
        Imagem (opcional)
      </p>
      <div className="ad-cat-image">
        {image && (
          // eslint-disable-next-line @next/next/no-img-element -- imagem pública do Storage
          <img src={imageUrl(image.path)} alt="" width={56} height={56} />
        )}
        <Button size="sm" variant="quiet" icon="Image" onClick={() => setPicking(true)}>
          {image ? 'Trocar imagem' : 'Escolher imagem'}
        </Button>
        {cat.media && (
          <Button size="sm" variant="ghost" icon="X" onClick={() => setCat({ ...cat, media: null })}>
            Remover
          </Button>
        )}
      </div>
      <p className="ad-help">Aparece no lugar do ícone nos filtros e nas áreas profissionais do catálogo.</p>
      <MediaPicker open={picking} onClose={() => setPicking(false)} onPick={(m) => (setCat({ ...cat, media: m.id }), setPicking(false))} kind="image" items={media} title="Imagem da categoria" />
      <Toggle label="Categoria ativa" hint="Inativa, ela não aparece nos filtros do catálogo." checked={cat.active} onChange={(active) => setCat({ ...cat, active })} />
      {error && (
        <div style={{ marginTop: 12 }}>
          <Notice tone="err">{error}</Notice>
        </div>
      )}
    </Modal>
  )
}

function TagsPanel({ suggested, usage }: { suggested: string[]; usage: { tag: string; count: number }[] }) {
  const router = useRouter()
  const { toast } = useApp()
  const [list, setList] = useState(suggested)
  const [rename, setRename] = useState<{ from: string; to: string } | null>(null)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const used = new Map(usage.map((u) => [u.tag, u.count]))
  const all = [...new Set([...list, ...usage.map((u) => u.tag)])].sort((a, b) => a.localeCompare(b, 'pt-BR'))

  const saveList = (next: string[]) => {
    const before = list
    setList(next)
    start(async () => {
      setError('')
      const r = await saveTagsAction({ tags: next })
      if (!r.ok) {
        setList(before)
        return setError(r.error)
      }
      toast('Tags atualizadas.', 'ok')
    })
  }

  const applyRename = (from: string, to: string) =>
    start(async () => {
      setError('')
      const r = await renameTagAction({ from, to })
      if (!r.ok) return setError(r.error)
      toast(to ? 'Tag renomeada em todos os cursos.' : 'Tag removida de todos os cursos.', 'ok')
      setRename(null)
      router.refresh()
    })

  return (
    <div className="panel">
      <header className="ad-sec-head">
        <h2>Tags</h2>
      </header>
      <p className="ad-help">Tags criadas aqui aparecem como sugestão no cadastro de cursos. Renomear ou remover vale para todos os cursos.</p>
      <ChipInput id="tags-new" values={list} onChange={saveList} placeholder="Nova tag e Enter" max={100} maxLength={30} />
      {all.length > 0 && (
        <ul className="ad-simple">
          {all.map((t) => (
            <li key={t}>
              <Icon name="Tag" size={14} />
              <span className="grow">{t}</span>
              <small>
                {used.get(t) ?? 0} {used.get(t) === 1 ? 'curso' : 'cursos'}
              </small>
              <IconButton icon="SquarePen" label={`Renomear ${t}`} disabled={pending} onClick={() => setRename({ from: t, to: t })} />
            </li>
          ))}
        </ul>
      )}
      {error && (
        <div style={{ marginTop: 12 }}>
          <Notice tone="err">{error}</Notice>
        </div>
      )}
      {rename && (
        <Modal
          open
          onClose={() => setRename(null)}
          size="sm"
          title="Renomear ou remover tag"
          footer={
            <>
              <Button variant="danger" disabled={pending} onClick={() => applyRename(rename.from, '')}>
                Remover de todos
              </Button>
              <span className="grow" />
              <Button variant="ghost" onClick={() => setRename(null)}>
                Cancelar
              </Button>
              <Button disabled={pending || !rename.to.trim() || rename.to.trim() === rename.from} onClick={() => applyRename(rename.from, rename.to.trim())}>
                Renomear
              </Button>
            </>
          }
        >
          <Field label="Novo nome" id="tag-ren">
            <input id="tag-ren" className="inp" value={rename.to} maxLength={30} onChange={(e) => setRename({ ...rename, to: e.target.value })} />
          </Field>
        </Modal>
      )}
    </div>
  )
}
