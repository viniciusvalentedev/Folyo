/**
 * CSV dos relatórios: separado por ponto e vírgula e com BOM, para abrir direto no Excel em português.
 *
 * Segurança: textos que começam com = + - @ (ou tab / retorno de linha) podem virar FÓRMULA no Excel
 * ("injeção de CSV"; nomes de alunos vêm de gente de fora). Esses textos recebem um apóstrofo na frente.
 * Números não são alterados.
 */

type Cell = string | number | null | undefined

const FORMULA_START = /^[=+\-@\t\r]/

function cell(value: Cell) {
  if (value === null || value === undefined) return ''
  let text = typeof value === 'number' ? String(value) : value
  if (typeof value === 'string' && FORMULA_START.test(text)) text = "'" + text
  return /[";\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text
}

export function toCsv<T>(rows: T[], columns: { label: string; get: (row: T) => Cell }[]) {
  const lines = [columns.map((c) => cell(c.label)).join(';'), ...rows.map((r) => columns.map((c) => cell(c.get(r))).join(';'))]
  return '﻿' + lines.join('\n')
}

/** Baixa o texto como arquivo (só no navegador). */
export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
