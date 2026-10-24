/**
 * Dados de quem responde pela Folyo nos textos legais (/privacidade e /termos).
 *
 * PREENCHA antes de abrir o site ao público e troque `reviewed` para true quando um
 * advogado revisar os textos: enquanto for false, as duas páginas mostram um aviso de
 * "versão em revisão". Este arquivo não tem dado secreto: tudo aqui aparece nas páginas.
 */
export const LEGAL = {
  /** Texto revisado por advogado? Enquanto false, as páginas avisam que estão em revisão. */
  reviewed: false,
  /** Controlador: quem decide como os dados são usados (pessoa jurídica ou física). */
  controller: {
    name: 'Folyo',
    /** Razão social ou nome completo, se for diferente do nome da marca. Ex.: "Folyo Educação Ltda." */
    legalName: '',
    /** CNPJ (ou CPF, se for pessoa física). Vazio = a linha não aparece. */
    document: '',
    /** Cidade e estado. Vazio = a linha não aparece. */
    address: '',
  },
  /** Encarregado pelo tratamento de dados (LGPD, art. 41). Vazio = o contato geral responde. */
  dpo: { name: '', email: '' },
  /** Foro (cidade/estado) para resolver conflitos. Vazio = domicílio do usuário (regra do consumidor). */
  forum: '',
  /** Data da última mudança nos textos (AAAA-MM-DD). Atualize junto com os textos. */
  updatedAt: '2026-10-27',
} as const

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** "2026-10-27" → "27 de outubro de 2026". */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} de ${MONTHS[m - 1]} de ${y}`
}
