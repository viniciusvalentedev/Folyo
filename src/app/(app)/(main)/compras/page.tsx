import { redirect } from 'next/navigation'
import { PURCHASES_HREF } from './PurchasesView'

/** "Minhas compras" agora fica em Configurações. O endereço antigo (links salvos, e-mails de recibo) leva para lá. */
export default function ComprasPage() {
  redirect(PURCHASES_HREF)
}
