import type { ReactNode } from 'react'
import { Icon } from '@/components/ui/Icon'
import { LEGAL, longDate } from '@/lib/legal'

/** Título da página legal, data da última mudança e aviso enquanto o texto não foi revisado por advogado. */
export function LegalHead({ title, lead }: { title: string; lead: string }) {
  return (
    <>
      <h1>{title}</h1>
      <p className="legal-lead">{lead}</p>
      <p className="legal-date">Atualizado em {longDate(LEGAL.updatedAt)}</p>
      {!LEGAL.reviewed && (
        <p className="alert alert-warn" role="note">
          <Icon name="CircleAlert" size={16} />
          <span>Versão em revisão: este texto ainda será conferido por um profissional de direito antes do lançamento.</span>
        </p>
      )}
    </>
  )
}

/** Quem responde pela Folyo (só mostra o que foi preenchido em src/lib/legal.ts). */
export function ControllerInfo({ email }: { email: string }) {
  const c = LEGAL.controller
  return (
    <ul>
      <li>
        <b>Controlador:</b> {c.legalName || c.name}
        {c.legalName && c.name !== c.legalName ? ` (marca ${c.name})` : ''}
      </li>
      {c.document && (
        <li>
          <b>CNPJ/CPF:</b> {c.document}
        </li>
      )}
      {c.address && (
        <li>
          <b>Endereço:</b> {c.address}
        </li>
      )}
      <li>
        <b>Contato:</b> <a href={`mailto:${email}`}>{email}</a>
      </li>
      <li>
        <b>Encarregado pelos dados (DPO):</b>{' '}
        {LEGAL.dpo.name || LEGAL.dpo.email ? (
          <>
            {LEGAL.dpo.name}
            {LEGAL.dpo.email && (
              <>
                {LEGAL.dpo.name ? ', ' : ''}
                <a href={`mailto:${LEGAL.dpo.email}`}>{LEGAL.dpo.email}</a>
              </>
            )}
          </>
        ) : (
          <>o mesmo contato acima</>
        )}
      </li>
    </ul>
  )
}

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  )
}
