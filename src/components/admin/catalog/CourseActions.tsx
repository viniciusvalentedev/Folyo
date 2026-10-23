'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition, type CSSProperties } from 'react'
import { useApp } from '@/components/providers/AppState'
import { Button, IconButton } from '@/components/ui/Button'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { deleteCourseAction, duplicateCourseAction, setCourseStatusAction } from '@/lib/actions/catalog'
import type { CourseStatus } from '@/lib/admin/catalog'
import { Notice } from '../ui'

type Pending = 'arquivado' | 'rascunho' | 'excluir' | null
type Item = { icon: IconName; label: string; run: () => void; danger?: boolean }

/**
 * Menu "Ações" de um curso (lista e editor). Quem decide se a pessoa pode é o banco:
 * excluir exige administrador; publicar confere o que falta.
 */
export function CourseActions({
  course,
  canDelete,
  compact,
  afterDelete,
  onPreview,
}: {
  course: { id: string; title: string; status: CourseStatus }
  canDelete: boolean
  compact?: boolean
  afterDelete?: string
  /** No editor, a prévia é uma aba da própria página. */
  onPreview?: () => void
}) {
  const { toast } = useApp()
  const router = useRouter()
  const [menu, setMenu] = useState(false)
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})
  const [confirm, setConfirm] = useState<Pending>(null)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const close = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setMenu(false)
    }
    const hide = () => setMenu(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    // O menu é "fixed" (para não ser cortado pela tabela); se a tela mexer, ele fecha.
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', esc)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [menu])

  /** Abre o menu colado no botão, para baixo, ou para cima se não couber embaixo. */
  const toggleMenu = () => {
    if (menu) return setMenu(false)
    const rect = box.current?.getBoundingClientRect()
    if (rect) {
      const right = Math.max(8, window.innerWidth - rect.right)
      const below = window.innerHeight - rect.bottom
      setMenuStyle(
        below >= 340 || below >= rect.top
          ? { position: 'fixed', top: rect.bottom + 4, right, maxHeight: Math.max(160, below - 12), overflowY: 'auto' }
          : { position: 'fixed', top: 'auto', bottom: window.innerHeight - rect.top + 4, right, maxHeight: Math.max(160, rect.top - 12), overflowY: 'auto' },
      )
    }
    setMenu(true)
  }

  const done = (message: string) => {
    toast(message, 'ok')
    setConfirm(null)
    router.refresh()
  }

  const setStatus = (status: CourseStatus, message: string) =>
    start(async () => {
      setError('')
      const r = await setCourseStatusAction({ id: course.id, status })
      if (!r.ok) {
        // "O curso ainda não pode ser publicado: ..." aparece no aviso; na janela aberta, dentro dela.
        if (confirm) setError(r.error)
        else toast(r.error, 'err')
        return
      }
      done(message)
    })

  const duplicate = () =>
    start(async () => {
      const r = await duplicateCourseAction({ id: course.id })
      if (!r.ok) return toast(r.error, 'err')
      toast('Cópia criada como rascunho.', 'ok')
      router.push('/admin/cursos/' + r.id)
    })

  const remove = () =>
    start(async () => {
      setError('')
      const r = await deleteCourseAction({ id: course.id })
      if (!r.ok) return setError(r.error)
      toast('Curso excluído.', 'ok')
      setConfirm(null)
      if (afterDelete) router.push(afterDelete)
      else router.refresh()
    })

  const published = course.status === 'publicado'
  const items: (Item | false)[] = [
    !onPreview && { icon: 'SquarePen', label: 'Editar', run: () => router.push('/admin/cursos/' + course.id) },
    { icon: 'Eye', label: 'Prévia', run: () => (onPreview ? onPreview() : router.push('/admin/cursos/' + course.id + '?aba=previa')) },
    published && { icon: 'ExternalLink', label: 'Ver no catálogo', run: () => router.push('/cursos/' + course.id) },
    !published && {
      icon: 'Send',
      label: course.status === 'arquivado' ? 'Publicar de novo' : 'Publicar agora',
      run: () => setStatus('publicado', `"${course.title}" foi publicado e já aparece no catálogo.`),
    },
    (published || course.status === 'agendado') && { icon: 'EyeOff', label: 'Despublicar', run: () => (setError(''), setConfirm('arquivado')) },
    course.status === 'arquivado' && { icon: 'Undo2', label: 'Voltar para rascunho', run: () => (setError(''), setConfirm('rascunho')) },
    { icon: 'Copy', label: 'Duplicar', run: duplicate },
    canDelete && { icon: 'Trash2', label: 'Excluir', run: () => (setError(''), setConfirm('excluir')), danger: true },
  ]

  return (
    <div className="ad-actions" ref={box} onClick={(e) => e.stopPropagation()}>
      {compact ? (
        <IconButton icon="Ellipsis" label={`Ações de ${course.title}`} aria-expanded={menu} onClick={toggleMenu} />
      ) : (
        <Button variant="quiet" iconRight="ChevronDown" aria-expanded={menu} onClick={toggleMenu}>
          Ações
        </Button>
      )}
      {menu && (
        <div className="ad-pop ad-menu" role="menu" style={menuStyle}>
          {items.map(
            (item) =>
              item && (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  className={item.danger ? 'danger' : ''}
                  disabled={pending}
                  onClick={() => {
                    setMenu(false)
                    item.run()
                  }}
                >
                  <Icon name={item.icon} size={15} />
                  {item.label}
                </button>
              ),
          )}
        </div>
      )}
      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        size="sm"
        title={confirm === 'excluir' ? 'Excluir curso?' : confirm === 'arquivado' ? 'Despublicar curso?' : 'Voltar para rascunho?'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            {confirm === 'excluir' ? (
              <Button variant="danger" disabled={pending} onClick={remove}>
                {pending ? 'Excluindo…' : 'Excluir definitivamente'}
              </Button>
            ) : (
              <Button
                variant={confirm === 'arquivado' ? 'danger' : 'primary'}
                disabled={pending}
                onClick={() =>
                  setStatus(
                    confirm === 'arquivado' ? 'arquivado' : 'rascunho',
                    confirm === 'arquivado' ? 'Curso despublicado. Ele saiu do catálogo.' : 'O curso voltou a ser rascunho.',
                  )
                }
              >
                {confirm === 'arquivado' ? 'Despublicar' : 'Voltar para rascunho'}
              </Button>
            )}
          </>
        }
      >
        <p className="muted">
          {confirm === 'excluir'
            ? `"${course.title}" será apagado com todos os módulos e aulas. Não dá para desfazer. Se algum aluno já começou o curso, o sistema não deixa excluir: despublique em vez disso.`
            : confirm === 'arquivado'
              ? `"${course.title}" sai do catálogo. Quem já começou continua com acesso; ninguém novo entra.`
              : `"${course.title}" deixa de aparecer para os alunos e volta a ser visto só pela equipe.`}
        </p>
        {error && (
          <div style={{ marginTop: 12 }}>
            <Notice tone="err">{error}</Notice>
          </div>
        )}
      </Modal>
    </div>
  )
}
