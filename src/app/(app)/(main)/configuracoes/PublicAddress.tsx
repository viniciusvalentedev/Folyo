'use client'

import { useState } from 'react'
import { useApp } from '@/components/providers/AppState'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/controls'
import { Icon } from '@/components/ui/Icon'
import { claimPublicSlugAction } from '@/lib/actions/public-profile'
import { normalizeSlug, publicProfilePath, publicProfileUrl, slugProblem, SLUG_COOLDOWN_DAYS, suggestSlug } from '@/lib/public-profile'

/**
 * Endereço do perfil público (Configurações › Privacidade).
 *
 * A pessoa escolhe o nome que aparece no link (/u/<nome>). O endereço só vale para visitantes se o
 * "Perfil público" estiver ligado; desligando, o link para de abrir na hora (o endereço continua
 * reservado para ela). A conferência final (nome livre, não reservado, intervalo entre trocas) é do banco.
 */
export function PublicAddress() {
  const { s, a, toast } = useApp()
  const current = s.publicSlug
  const [value, setValue] = useState(current || suggestSlug(s.user.name))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const slug = normalizeSlug(value)
  const unchanged = slug === current
  const live = !!current && s.settings.publicProfile

  const save = async () => {
    const problem = slugProblem(slug)
    if (problem) {
      setError(problem)
      return
    }
    setError('')
    setBusy(true)
    try {
      const res = await claimPublicSlugAction(slug)
      if (res.ok) {
        a.setPublicSlug(res.slug)
        setValue(res.slug)
        toast(s.settings.publicProfile ? 'Endereço salvo. Seu perfil já abre nele.' : 'Endereço salvo. Ligue "Perfil público" para o link abrir.', 'ok')
      } else {
        setError(res.error)
      }
    } catch {
      setError('Sem conexão com o servidor. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(publicProfileUrl(current))
      toast('Link copiado.', 'ok')
    } catch {
      toast('Não deu para copiar. Selecione o link e copie à mão.', 'err')
    }
  }

  return (
    <div className="slug-box">
      <Field
        label="Endereço do perfil"
        id="st-slug"
        error={error}
        hint={`De 3 a 30 letras minúsculas, números e hífen. Depois de salvar, dá para trocar de novo a cada ${SLUG_COOLDOWN_DAYS} dias.`}
      >
        <div className="slug-row">
          <span className="slug-prefix" aria-hidden="true">
            usefolyo.com/u/
          </span>
          <input
            id="st-slug"
            className="inp"
            maxLength={60}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="seu-nome"
            aria-describedby={error ? 'st-slug-erro' : undefined}
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setError('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (!unchanged && !busy) void save()
              }
            }}
          />
          <Button icon="Check" onClick={save} disabled={busy || unchanged || !slug}>
            {busy ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </Field>
      {slug && !unchanged && !slugProblem(slug) && (
        <p className="muted small">
          O link ficará <b>usefolyo.com{publicProfilePath(slug)}</b>
        </p>
      )}
      {current && (
        <div className="slug-live">
          <p className="small">
            <Icon name={live ? 'Globe' : 'Lock'} size={15} />{' '}
            {live ? (
              <>
                No ar em <b>usefolyo.com{publicProfilePath(current)}</b>
              </>
            ) : (
              <>
                Fora do ar: ligue &quot;Perfil público&quot; para <b>usefolyo.com{publicProfilePath(current)}</b> abrir.
              </>
            )}
          </p>
          <div className="row gap-s">
            <Button size="sm" variant="quiet" icon="Copy" onClick={copy}>
              Copiar link
            </Button>
            <a className="btn btn-quiet btn-sm" href={publicProfilePath(current)} target="_blank" rel="noopener noreferrer">
              <Icon name="ExternalLink" size={15} />
              <span>Abrir</span>
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
