'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import * as tus from 'tus-js-client'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Progress } from '@/components/ui/indicators'
import { createVideoUploadAction, deleteVideoAction, getVideoStatusAction, renewVideoUploadAction } from '@/lib/actions/video'
import { formatBytes } from '@/lib/media'
import { Notice } from '../../ui'

const MAX_VIDEO_BYTES = 10 * 1024 ** 3
const VIDEO_ACCEPT = 'video/mp4,video/quicktime,video/webm,video/x-matroska,video/x-msvideo,.mp4,.mov,.webm,.mkv,.avi,.m4v'

type Phase =
  | { kind: 'idle' }
  | { kind: 'sending'; name: string; size: number; pct: number }
  | { kind: 'checking' }
  | { kind: 'ready' | 'processing' | 'error'; pct: number }
  | { kind: 'gone' }

/**
 * Vídeo hospedado no Bunny Stream. O arquivo vai DIRETO do navegador para o Bunny (protocolo TUS,
 * retomável), com uma assinatura que o servidor gera para um único vídeo; a chave do Bunny nunca
 * chega aqui. Quando o vídeo termina de processar, a duração real sugere o tempo da aula.
 */
export function BunnyVideo({
  videoId,
  title,
  configured,
  onChange,
  onDuration,
}: {
  videoId: string | null
  title: string
  configured: boolean
  onChange: (id: string | null) => void
  onDuration: (minutes: number) => void
}) {
  const [phase, setPhase] = useState<Phase>(videoId ? { kind: 'checking' } : { kind: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const upload = useRef<tus.Upload | null>(null)
  const fresh = useRef<string | null>(null) // vídeo criado nesta janela e ainda não salvo no curso
  const alive = useRef(true)
  const reported = useRef<string | null>(null)
  const durationRef = useRef(onDuration)
  useEffect(() => {
    durationRef.current = onDuration
  })

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      upload.current?.abort()
    }
  }, [])

  const check = useCallback(
    async (id: string) => {
      const res = await getVideoStatusAction({ id })
      if (!alive.current) return
      if (!res.ok) {
        setPhase({ kind: 'gone' })
        setError(res.error)
        return
      }
      setPhase({ kind: res.state === 'pronto' ? 'ready' : res.state === 'erro' ? 'error' : 'processing', pct: res.progress })
      if (res.state === 'pronto' && res.length > 0 && reported.current !== id) {
        reported.current = id
        durationRef.current(Math.max(1, Math.ceil(res.length / 60)))
      }
    },
    [],
  )

  // Acompanha o processamento até ficar pronto (a cada 4 s, só com a aba visível).
  useEffect(() => {
    if (!videoId || !configured) return
    if (phase.kind !== 'checking' && phase.kind !== 'processing') return
    const delay = phase.kind === 'checking' ? 0 : 4000
    const t = setTimeout(() => {
      if (document.visibilityState === 'visible' || phase.kind === 'checking') void check(videoId)
      else setPhase((p) => ({ ...p }))
    }, delay)
    return () => clearTimeout(t)
  }, [videoId, configured, phase, check])

  const discardFresh = async () => {
    const id = fresh.current
    fresh.current = null
    if (id) await deleteVideoAction({ id })
  }

  const pick = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    if (file.size > MAX_VIDEO_BYTES) return setError('O vídeo passa de 10 GB. Comprima antes de enviar.')
    if (!file.type.startsWith('video/') && !/\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(file.name)) return setError('Escolha um arquivo de vídeo (MP4, MOV, WebM, MKV).')
    const ticket = await createVideoUploadAction({ title: title.trim() || file.name, size: file.size })
    if (!ticket.ok) return setError(ticket.error)
    await discardFresh()
    fresh.current = ticket.videoId
    setPhase({ kind: 'sending', name: file.name, size: file.size, pct: 0 })

    const start = (t: { endpoint: string; libraryId: string; videoId: string; expire: number; signature: string }, renewals = 0) => {
      const up = new tus.Upload(file, {
        endpoint: t.endpoint,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: { AuthorizationSignature: t.signature, AuthorizationExpire: String(t.expire), VideoId: t.videoId, LibraryId: t.libraryId },
        metadata: { filetype: file.type, title: title.trim() || file.name },
        onProgress: (sent, total) => alive.current && setPhase({ kind: 'sending', name: file.name, size: file.size, pct: total ? Math.round((sent / total) * 100) : 0 }),
        onError: async () => {
          if (!alive.current) return
          // Assinatura vencida (envio muito longo)? Renova uma vez e continua de onde parou.
          const renewed = renewals < 1 ? await renewVideoUploadAction({ id: t.videoId }) : null
          if (renewed?.ok) {
            start(renewed, renewals + 1)
            return
          }
          await discardFresh()
          if (alive.current) {
            setPhase({ kind: 'idle' })
            setError('O envio falhou. Confira sua conexão e tente de novo.')
          }
        },
        onSuccess: () => {
          if (!alive.current) return
          reported.current = null
          onChange(t.videoId)
          setPhase({ kind: 'processing', pct: 0 })
        },
      })
      upload.current = up
      up.start()
    }
    start(ticket)
  }

  const cancel = async () => {
    upload.current?.abort(true).catch(() => {})
    upload.current = null
    await discardFresh()
    setPhase({ kind: 'idle' })
  }

  const remove = async () => {
    await discardFresh()
    onChange(null)
    setPhase({ kind: 'idle' })
  }

  if (!configured) {
    return (
      <Notice tone="warn">
        O Bunny Stream ainda não está configurado neste ambiente (variáveis <code>BUNNY_STREAM_*</code> no servidor). Enquanto isso, use um vídeo por link.
      </Notice>
    )
  }

  return (
    <div className="ad-bunny">
      {phase.kind === 'idle' && (
        <label className="ad-drop">
          <Icon name="Upload" size={20} />
          <b>Enviar vídeo</b>
          <small>MP4, MOV, WebM ou MKV · até 10 GB · o envio continua se a conexão cair</small>
          <input
            type="file"
            accept={VIDEO_ACCEPT}
            hidden
            onChange={(e) => {
              void pick(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
      )}

      {phase.kind === 'sending' && (
        <div className="ad-bunny-row">
          <Icon name="Film" size={18} />
          <div className="ad-bunny-main">
            <b>{phase.name}</b>
            <small>
              Enviando… {phase.pct}% de {formatBytes(phase.size)}. Não feche esta janela.
            </small>
            <Progress value={phase.pct} size="sm" label="Envio do vídeo" />
          </div>
          <Button size="sm" variant="ghost" onClick={cancel}>
            Cancelar
          </Button>
        </div>
      )}

      {(phase.kind === 'checking' || phase.kind === 'processing' || phase.kind === 'ready' || phase.kind === 'error' || phase.kind === 'gone') && (
        <div className="ad-bunny-row">
          <Icon name="Film" size={18} />
          <div className="ad-bunny-main">
            <b>
              {phase.kind === 'ready' && 'Vídeo pronto'}
              {phase.kind === 'processing' && 'Processando o vídeo…'}
              {phase.kind === 'checking' && 'Conferindo o vídeo…'}
              {phase.kind === 'error' && 'O Bunny não conseguiu processar este vídeo'}
              {phase.kind === 'gone' && 'Vídeo indisponível'}
            </b>
            <small>
              {phase.kind === 'processing' && `${phase.pct}% · pode levar alguns minutos; você já pode salvar a aula.`}
              {phase.kind === 'ready' && 'Hospedado no Bunny Stream. O aluno assiste com endereço protegido.'}
              {phase.kind === 'error' && 'Envie outro arquivo (de preferência MP4 em H.264).'}
              {phase.kind === 'gone' && 'Ele não existe mais no Bunny. Envie de novo.'}
            </small>
            {phase.kind === 'processing' && <Progress value={phase.pct} size="sm" label="Processamento do vídeo" />}
          </div>
          <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
            <Icon name="RefreshCw" size={14} /> Trocar
            <input
              type="file"
              accept={VIDEO_ACCEPT}
              hidden
              onChange={(e) => {
                void pick(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
          <Button size="sm" variant="ghost" icon="Trash2" onClick={remove}>
            Remover
          </Button>
        </div>
      )}

      {error && <Notice tone="err">{error}</Notice>}
    </div>
  )
}
