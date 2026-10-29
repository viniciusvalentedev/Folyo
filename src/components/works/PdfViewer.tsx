'use client'

import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { pdfUrl } from '@/lib/pdf-file'
import { publicPdfUrl } from '@/lib/public-profile'
import type { Work } from '@/lib/types'

/**
 * Janela para ler um PDF do portfólio. O arquivo vem do servidor: no portfólio do aluno só o dono abre;
 * na página pública (`slug` = endereço do perfil), qualquer pessoa abre, se o trabalho for público.
 */
export function PdfViewer({ work, onClose, slug }: { work: Work | null; onClose: () => void; slug?: string }) {
  const href = (id: string, download?: boolean) => (slug ? publicPdfUrl(slug, id, download) : pdfUrl(id, download))
  const src = work ? href(work.id) : null
  return (
    <Modal
      open={!!work}
      onClose={onClose}
      title={work ? work.title : ''}
      eyebrow="PDF"
      size="lg"
      footer={
        work && (
          <>
            <a className="btn btn-quiet btn-md" href={href(work.id, true)}>
              <Icon name="Download" size={17} />
              <span>Baixar</span>
            </a>
            <a className="btn btn-quiet btn-md" href={href(work.id)} target="_blank" rel="noopener noreferrer">
              <Icon name="ExternalLink" size={17} />
              <span>Abrir em nova aba</span>
            </a>
            <Button variant="ghost" onClick={onClose}>
              Fechar
            </Button>
          </>
        )
      }
    >
      {work && src && (
        <>
          <iframe className="pdf-frame" src={src} title={`Visualização de ${work.title}`} />
          <p className="muted small">Se a visualização não aparecer no seu navegador, use &quot;Abrir em nova aba&quot; ou &quot;Baixar&quot;.</p>
        </>
      )}
    </Modal>
  )
}
