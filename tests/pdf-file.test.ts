import { describe, expect, it } from 'vitest'
import { formatFileSize, hostOf, pdfProblem, pdfUrl } from '@/lib/pdf-file'

const pdf = (content: string, name = 'a.pdf', type = 'application/pdf') => new File([content], name, { type })

describe('conferência de PDF antes do envio', () => {
  it('aceita um PDF de verdade', async () => {
    expect(await pdfProblem(pdf('%PDF-1.7 conteúdo'))).toBeNull()
  })
  it('recusa sem arquivo', async () => {
    expect(await pdfProblem(null)).toBe('Escolha um arquivo.')
  })
  it('recusa extensão ou tipo errado', async () => {
    expect(await pdfProblem(pdf('%PDF-1.7', 'a.exe'))).toBe('Envie um arquivo em PDF.')
    expect(await pdfProblem(pdf('%PDF-1.7', 'a.pdf', 'text/html'))).toBe('Envie um arquivo em PDF.')
  })
  it('recusa arquivo vazio', async () => {
    expect(await pdfProblem(pdf('%PD'))).toBe('O arquivo está vazio.')
  })
  it('recusa arquivo que se disfarça de PDF', async () => {
    expect(await pdfProblem(pdf('<html>não sou pdf</html>'))).toBe('Este arquivo não parece ser um PDF válido.')
  })
})

describe('auxiliares', () => {
  it('formatFileSize', () => {
    expect(formatFileSize(1048576)).toBe('1,0 MB')
    expect(formatFileSize(52000)).toBe('51 KB')
    expect(formatFileSize(10)).toBe('1 KB')
  })
  it('hostOf', () => {
    expect(hostOf('https://www.site.com/pagina')).toBe('site.com')
    expect(hostOf('não é url')).toBe('não é url')
  })
  it('pdfUrl', () => {
    expect(pdfUrl('abc')).toBe('/api/trabalhos/abc/arquivo')
    expect(pdfUrl('abc', true)).toBe('/api/trabalhos/abc/arquivo?download=1')
  })
})
