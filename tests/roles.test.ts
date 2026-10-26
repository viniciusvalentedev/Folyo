import { describe, expect, it } from 'vitest'
import { assignableRoles, can, canManage, isRole, rankOf, roleChangeText, type Role } from '@/lib/admin/roles'

const user = (id: string, role: Role) => ({ id, role })

describe('papéis: ranking e permissões', () => {
  it('ordena aluno < editor < admin < proprietário', () => {
    expect(rankOf('aluno')).toBeLessThan(rankOf('editor'))
    expect(rankOf('editor')).toBeLessThan(rankOf('admin'))
    expect(rankOf('admin')).toBeLessThan(rankOf('proprietario'))
  })

  it('aluno não entra no painel; editor mexe em conteúdo mas não em usuários', () => {
    expect(can('aluno', 'painel')).toBe(false)
    expect(can('editor', 'painel')).toBe(true)
    expect(can('editor', 'conteudo')).toBe(true)
    expect(can('editor', 'usuarios')).toBe(false)
    expect(can('admin', 'usuarios')).toBe(true)
    expect(can('admin', 'configuracoes')).toBe(true)
  })

  it('isRole só aceita papéis conhecidos', () => {
    expect(isRole('admin')).toBe(true)
    expect(isRole('root')).toBe(false)
    expect(isRole(undefined)).toBe(false)
    expect(isRole('toString')).toBe(false)
  })
})

describe('papéis: quem pode dar qual papel', () => {
  it('ninguém muda o próprio papel (nem o proprietário)', () => {
    const owner = user('1', 'proprietario')
    expect(assignableRoles(owner, owner)).toEqual([])
    expect(canManage(owner, owner)).toBe(false)
  })

  it('editor e aluno não atribuem nada', () => {
    expect(assignableRoles(user('1', 'editor'), user('2', 'aluno'))).toEqual([])
    expect(assignableRoles(user('1', 'aluno'), user('2', 'aluno'))).toEqual([])
  })

  it('administrador só mexe em quem está abaixo e só concede papéis abaixo do dele', () => {
    const admin = user('1', 'admin')
    expect(assignableRoles(admin, user('2', 'aluno'))).toEqual(['aluno', 'editor'])
    expect(assignableRoles(admin, user('3', 'admin'))).toEqual([])
    expect(assignableRoles(admin, user('4', 'proprietario'))).toEqual([])
    expect(assignableRoles(admin, user('2', 'aluno'))).not.toContain('admin')
    expect(assignableRoles(admin, user('2', 'aluno'))).not.toContain('proprietario')
  })

  it('proprietário pode conceder qualquer papel a outra pessoa', () => {
    const owner = user('1', 'proprietario')
    expect(assignableRoles(owner, user('2', 'admin'))).toEqual(['aluno', 'editor', 'admin', 'proprietario'])
  })

  it('canManage: admin suspende quem está abaixo; não suspende par nem superior', () => {
    const admin = user('1', 'admin')
    expect(canManage(admin, user('2', 'aluno'))).toBe(true)
    expect(canManage(admin, user('3', 'editor'))).toBe(true)
    expect(canManage(admin, user('4', 'admin'))).toBe(false)
    expect(canManage(admin, user('5', 'proprietario'))).toBe(false)
    expect(canManage(user('6', 'editor'), user('7', 'aluno'))).toBe(false)
    expect(canManage(user('8', 'proprietario'), user('9', 'admin'))).toBe(true)
  })
})

describe('histórico do painel', () => {
  it('roleChangeText traduz "aluno → editor"', () => {
    expect(roleChangeText('aluno → editor')).toBe('Aluno → Editor de conteúdo')
  })
  it('devolve o texto original quando não reconhece', () => {
    expect(roleChangeText('qualquer coisa')).toBe('qualquer coisa')
    expect(roleChangeText('aluno → mago')).toBe('aluno → mago')
  })
})
