import type { Metadata } from 'next'
import Link from 'next/link'
import { supportEmailOf } from '@/lib/app-config'
import { getPublicConfig } from '@/lib/data/config'
import { LEGAL } from '@/lib/legal'
import { ControllerInfo, LegalHead, Section } from '../LegalParts'

export const metadata: Metadata = {
  title: 'Termos de Uso',
  description: 'As regras para usar a Folyo: conta, conteúdo, uso permitido e encerramento.',
}

/** Termos de Uso. Texto em revisão: veja src/lib/legal.ts. */
export default async function TermsPage() {
  const email = supportEmailOf(await getPublicConfig())
  return (
    <article>
      <LegalHead
        title="Termos de Uso"
        lead="As regras combinadas entre você e a Folyo. Leia com calma: são curtas e escritas para pessoas, não para advogados."
      />

      <Section id="aceite" title="1. Ao usar, você concorda">
        <p>
          Ao criar uma conta ou usar a Folyo, você aceita estes Termos e a{' '}
          <Link href="/privacidade">Política de Privacidade</Link>. Se não concordar, não use a plataforma.
        </p>
        <ControllerInfo email={email} />
      </Section>

      <Section id="conta" title="2. Sua conta">
        <ul>
          <li>Use dados verdadeiros e mantenha o e-mail e a senha em dia. A senha é pessoal: não a compartilhe.</li>
          <li>Você é responsável pelo que acontece na sua conta. Se desconfiar de uso indevido, troque a senha e avise a gente.</li>
          <li>
            Se você tem menos de 18 anos, precisa da autorização de um responsável legal para usar a Folyo.
          </li>
        </ul>
      </Section>

      <Section id="uso" title="3. Como usar">
        <p>A Folyo é para estudar e montar o seu portfólio. Não é permitido:</p>
        <ul>
          <li>copiar, baixar, revender ou divulgar aulas e materiais fora da plataforma, nem dar o seu acesso a outras pessoas;</li>
          <li>tentar burlar a segurança, acessar dados de outras pessoas, sobrecarregar o serviço ou usar robôs para raspar conteúdo;</li>
          <li>enviar conteúdo ilegal, ofensivo, discriminatório, com vírus ou que viole direitos de terceiros;</li>
          <li>fingir ser outra pessoa ou usar a plataforma para enganar alguém.</li>
        </ul>
      </Section>

      <Section id="conteudo-folyo" title="4. O conteúdo da Folyo">
        <p>
          Cursos, vídeos, textos, marca e design são da Folyo ou de quem nos licenciou. Você ganha uma licença pessoal,
          limitada e não exclusiva para assistir e estudar enquanto a conta estiver ativa. Nada aqui transfere
          propriedade intelectual para você.
        </p>
      </Section>

      <Section id="seu-conteudo" title="5. O que você cria">
        <ul>
          <li>Anotações, projetos, trabalhos, currículo e competências continuam sendo seus.</li>
          <li>
            Você nos autoriza a guardá-los e mostrá-los como você pediu: por exemplo, só para você, ou no perfil público
            se você ligar essa opção. Você pode desligar ou apagar quando quiser.
          </li>
          <li>
            Garanta que tem direito de usar o que envia e evite colocar dados pessoais de outras pessoas ou dados
            sensíveis nos campos livres.
          </li>
        </ul>
      </Section>

      <Section id="resultados" title="6. Resultados e certificados">
        <p>
          Trabalhamos para que os cursos sejam úteis, mas não prometemos emprego, renda ou aprovação em processos
          seletivos. O resultado depende também do seu esforço. Certificados mostram o que você concluiu na Folyo; não
          substituem diplomas oficiais.
        </p>
      </Section>

      <Section id="disponibilidade" title="7. Disponibilidade e mudanças no serviço">
        <p>
          Buscamos manter a Folyo sempre no ar, mas ela pode ficar indisponível por manutenção ou por causas fora do
          nosso controle. Podemos melhorar, mudar ou retirar recursos e cursos; quando isso afetar você de forma
          relevante, avisaremos.
        </p>
      </Section>

      <Section id="planos" title="8. Planos e pagamentos">
        <p>
          Se a Folyo passar a ter planos pagos, os preços, a forma de cobrança, o cancelamento e o direito de
          arrependimento (CDC, art. 49) serão informados antes da compra e farão parte destes Termos.
        </p>
      </Section>

      <Section id="encerramento" title="9. Suspensão e encerramento">
        <ul>
          <li>
            <b>Por você:</b> a qualquer momento, em Configurações → Conta → Excluir minha conta. Seus dados são apagados
            como explicado na Política de Privacidade.
          </li>
          <li>
            <b>Pela Folyo:</b> podemos suspender ou encerrar contas que violem estes Termos ou a lei, sempre que possível
            avisando o motivo. Se achar que foi um engano, escreva para <a href={`mailto:${email}`}>{email}</a>.
          </li>
        </ul>
      </Section>

      <Section id="responsabilidade" title="10. Responsabilidade">
        <p>
          A Folyo responde pelos danos que causar nos termos da lei. Fora isso, não responde por problemas causados por
          mau uso da conta, por falhas de internet ou de aparelhos do usuário, nem por conteúdo enviado por terceiros. Os
          direitos que o Código de Defesa do Consumidor garante a você continuam valendo.
        </p>
      </Section>

      <Section id="mudancas" title="11. Mudanças nestes Termos">
        <p>
          Podemos atualizar estes Termos. Se a mudança for relevante, avisaremos dentro da Folyo ou por e-mail antes de
          ela valer. Continuar usando depois do aviso significa que você aceitou o texto novo; se não aceitar, é só
          excluir a conta.
        </p>
      </Section>

      <Section id="lei" title="12. Lei e foro">
        <p>
          Valem as leis do Brasil.{' '}
          {LEGAL.forum
            ? `Fica eleito o foro de ${LEGAL.forum}, sem prejuízo do direito do consumidor de acionar o foro do seu domicílio.`
            : 'Conflitos podem ser levados ao foro do seu domicílio, como garante a lei do consumidor.'}
        </p>
      </Section>
    </article>
  )
}
