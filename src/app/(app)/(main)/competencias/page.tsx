import { redirect } from 'next/navigation'

/** A página de competências deixou de existir: as skills agora ficam em Objetivos e no Currículo. */
export default function CompetenciasPage() {
  redirect('/objetivos')
}
