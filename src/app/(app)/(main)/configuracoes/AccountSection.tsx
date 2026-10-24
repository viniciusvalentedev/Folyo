'use client'

import { useState, useTransition } from 'react'
import { signOutAction } from '@/app/(auth)/actions'
import { useApp } from '@/components/providers/AppState'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Field } from '@/components/ui/controls'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { deleteMyAccountAction, exportMyDataAction } from '@/lib/actions/account'
import { DELETE_ACCOUNT_WORD } from '@/lib/validation'

/** Conta: senha, sair e os direitos do titular da LGPD (baixar os dados e excluir a conta). */
export function AccountSection({ supportEmail }: { supportEmail: string }) {
  const { toast } = useApp()
  const [exporting, startExport] = useTransition()
  const [deleting, startDelete] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [word, setWord] = useState('')
  const [error, setError] = useState('')

  const download = () =>
    startExport(async () => {
      const result = await exportMyDataAction()
      if (!result.ok) {
        toast(result.error, 'err')
        return
      }
      const url = URL.createObjectURL(new Blob([result.json], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = result.filename
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast('Pronto! O arquivo com os seus dados foi baixado.', 'ok')
    })

  const closeConfirm = () => {
    if (deleting) return
    setConfirmOpen(false)
    setWord('')
    setError('')
  }

  const confirmDelete = () =>
    startDelete(async () => {
      setError('')
      // Se der certo, o servidor leva a pessoa para a tela de entrada e esta chamada não volta.
      const result = await deleteMyAccountAction({ confirm: word })
      setError(result.error)
    })

  const typed = word.trim().toUpperCase() === DELETE_ACCOUNT_WORD

  return (
    <section className="set-sec">
      <h2>Conta</h2>
      <div className="set-row">
        <div>
          <b>Trocar senha</b>
          <small>Escolha uma senha nova para entrar na Folyo.</small>
        </div>
        <ButtonLink variant="quiet" icon="Lock" href="/redefinir-senha">
          Trocar senha
        </ButtonLink>
      </div>
      <div className="set-row">
        <div>
          <b>Sair da conta</b>
          <small>Sai só deste aparelho. Você pode entrar de novo quando quiser.</small>
        </div>
        <form action={signOutAction}>
          <Button type="submit" variant="quiet" icon="LogOut">
            Sair
          </Button>
        </form>
      </div>

      <h3 className="set-sub">Seus dados</h3>
      <div className="set-row">
        <div>
          <b>Baixar meus dados</b>
          <small>
            Um arquivo (JSON) com tudo o que a Folyo guarda sobre a sua conta. Os PDFs que você enviou você baixa em
            Trabalhos.
          </small>
        </div>
        <Button variant="quiet" icon="Download" onClick={download} disabled={exporting}>
          {exporting ? 'Gerando…' : 'Baixar'}
        </Button>
      </div>
      <div className="set-row">
        <div>
          <b>Privacidade e termos</b>
          <small>Como usamos os seus dados e as regras para usar a Folyo.</small>
        </div>
        <div className="row gap-s">
          <ButtonLink variant="quiet" href="/privacidade" target="_blank">
            Privacidade
          </ButtonLink>
          <ButtonLink variant="quiet" href="/termos" target="_blank">
            Termos
          </ButtonLink>
        </div>
      </div>
      <div className="set-row set-danger">
        <div>
          <b>Excluir minha conta</b>
          <small>
            Apaga a conta e todos os seus dados, de forma definitiva. Dúvidas? Escreva para {supportEmail}.
          </small>
        </div>
        <Button variant="danger" icon="Trash2" onClick={() => setConfirmOpen(true)}>
          Excluir conta
        </Button>
      </div>

      <Modal
        open={confirmOpen}
        onClose={closeConfirm}
        title="Excluir a conta?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={closeConfirm} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="danger" icon="Trash2" onClick={confirmDelete} disabled={!typed || deleting}>
              {deleting ? 'Excluindo…' : 'Excluir para sempre'}
            </Button>
          </>
        }
      >
        <div className="del-body">
          <p>
            Isto <b>não pode ser desfeito</b>. Vamos apagar agora:
          </p>
          <ul>
            <li>seu perfil, objetivos, currículo e configurações;</li>
            <li>seu progresso, anotações, competências e tempo assistido;</li>
            <li>seus trabalhos, inclusive os PDFs enviados.</li>
          </ul>
          <p className="muted small">
            Quer guardar uma cópia? Baixe seus dados antes. Alguns registros de segurança podem ser mantidos pelo prazo
            da lei (veja a Política de Privacidade).
          </p>
          <Field label={`Digite ${DELETE_ACCOUNT_WORD} para confirmar`} id="del-word">
            <input
              id="del-word"
              className="inp"
              value={word}
              maxLength={40}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              onChange={(e) => setWord(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && typed && !deleting) confirmDelete()
              }}
            />
          </Field>
          {error && (
            <p className="alert alert-err" role="alert">
              <Icon name="CircleAlert" size={16} />
              <span>{error}</span>
            </p>
          )}
        </div>
      </Modal>
    </section>
  )
}
