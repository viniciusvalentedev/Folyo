import type { Metadata } from 'next'
import { CONFIG_LIMITS, DEFAULT_CONFIG, supportEmailOf } from '@/lib/app-config'
import { getPublicConfig } from '@/lib/data/config'
import { ControllerInfo, LegalHead, Section } from '../LegalParts'

export const metadata: Metadata = {
  title: 'Política de Privacidade',
  description: 'Quais dados a Folyo guarda, para que usamos, com quem compartilhamos e como você exerce seus direitos.',
}

/** Política de Privacidade (LGPD, Lei 13.709/2018). Texto em revisão: veja src/lib/legal.ts. */
export default async function PrivacyPage() {
  const email = supportEmailOf(await getPublicConfig())
  return (
    <article>
      <LegalHead
        title="Política de Privacidade"
        lead="Explicamos com palavras simples quais dados a Folyo guarda, por quê, com quem eles passam e como você manda neles."
      />

      <Section id="quem" title="1. Quem cuida dos seus dados">
        <p>
          Quem decide como os seus dados pessoais são usados na Folyo (o “controlador”, na Lei Geral de Proteção de
          Dados, a LGPD) é:
        </p>
        <ControllerInfo email={email} />
      </Section>

      <Section id="dados" title="2. Quais dados guardamos">
        <h3>Os que você nos dá</h3>
        <ul>
          <li>
            <b>Conta:</b> nome, e-mail e senha. Não vemos a sua senha: ela fica guardada de forma protegida pelo serviço
            de login.
          </li>
          <li>
            <b>Perfil e currículo (opcionais):</b> telefone, cidade, e-mail de contato, link, apresentação, objetivo,
            formação, experiências, idiomas e conquistas.
          </li>
          <li>
            <b>Primeiro acesso e objetivos:</b> seu momento de vida, áreas de interesse e o que você quer conquistar.
          </li>
          <li>
            <b>O que você cria:</b> competências, anotações das aulas, trabalhos (links e arquivos PDF) e suas
            configurações.
          </li>
        </ul>
        <h3>Os que surgem quando você usa a Folyo</h3>
        <ul>
          <li>Progresso nos cursos, aulas concluídas e favoritos.</li>
          <li>Tempo assistido e visualizações das aulas: data, aula, tempo e tipo de aparelho (computador, celular ou tablet).</li>
          <li>Sessões de vídeo em andamento (somem sozinhas quando o sinal para de chegar) e a hora em que você leu as notificações.</li>
        </ul>
        <h3>Os técnicos</h3>
        <ul>
          <li>
            Endereço IP e dados do navegador, processados pelos serviços de hospedagem e de login para segurança e para
            limitar abusos. Não os guardamos no nosso banco de dados.
          </li>
          <li>Um cookie de sessão, para manter você logado (veja a seção 4).</li>
        </ul>
        <p>Não pedimos dados sensíveis (como saúde, religião ou opinião política). Evite colocá-los em campos livres.</p>
      </Section>

      <Section id="usos" title="3. Para que usamos e em que base legal">
        <div className="legal-table-wrap">
          <table className="legal-table">
            <thead>
              <tr>
                <th scope="col">Para quê</th>
                <th scope="col">Base legal (LGPD, art. 7º)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Criar e manter a sua conta; entregar cursos, progresso, anotações, trabalhos e currículo</td>
                <td>Execução do contrato (V)</td>
              </tr>
              <tr>
                <td>Mostrar o seu perfil público, projetos e e-mail quando você liga essas opções</td>
                <td>Consentimento (I): você desliga quando quiser em Configurações → Privacidade</td>
              </tr>
              <tr>
                <td>Segurança da conta, prevenção de fraude e abuso, limites de uso</td>
                <td>Legítimo interesse (IX)</td>
              </tr>
              <tr>
                <td>Entender como as aulas são vistas (audiência) para melhorar o conteúdo</td>
                <td>Legítimo interesse (IX), com números agrupados no painel</td>
              </tr>
              <tr>
                <td>Responder a pedidos seus e cumprir obrigações legais ou ordens de autoridades</td>
                <td>Obrigação legal (II) e exercício regular de direitos (VI)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>Não vendemos seus dados e não usamos nada disso para publicidade de terceiros.</p>
      </Section>

      <Section id="cookies" title="4. Cookies">
        <p>
          Usamos apenas o cookie de sessão de login, que é essencial para o site funcionar. Ele é “httpOnly” (o
          JavaScript da página não consegue lê-lo) e vale só para a Folyo. Não usamos cookies de publicidade nem
          ferramentas de rastreamento de terceiros. Na entrada e no cadastro há uma verificação anti-robô da Cloudflare
          (Turnstile).
        </p>
      </Section>

      <Section id="compartilhamento" title="5. Com quem os dados passam">
        <p>Usamos empresas que tratam dados em nosso nome (os “operadores”), só para o que é necessário:</p>
        <ul>
          <li>
            <b>Supabase:</b> banco de dados, login e armazenamento dos arquivos PDF.
          </li>
          <li>
            <b>Vercel:</b> hospedagem do site.
          </li>
          <li>
            <b>Bunny.net:</b> entrega e armazenamento dos vídeos das aulas (o seu navegador conversa com ele ao
            assistir).
          </li>
          <li>
            <b>Cloudflare:</b> verificação anti-robô na entrada.
          </li>
          <li>
            <b>Zoho:</b> envio dos e-mails da conta (confirmação e nova senha).
          </li>
        </ul>
        <p>
          Quem tem o link vê o seu perfil público apenas se você ligar essa opção, e só o que você escolheu mostrar.
          Também podemos compartilhar dados quando a lei ou uma autoridade exigir.
        </p>
        <p>
          Alguns desses serviços funcionam fora do Brasil. Nesses casos, a transferência acontece com as garantias
          previstas na LGPD (art. 33), como cláusulas contratuais e padrões de segurança dos provedores.
        </p>
      </Section>

      <Section id="prazo" title="6. Por quanto tempo guardamos">
        <ul>
          <li>
            <b>Enquanto a conta existir:</b> seus dados ficam guardados para a Folyo funcionar para você.
          </li>
          <li>
            <b>Se você excluir a conta:</b> apagamos na hora o perfil, o progresso, as anotações, as competências, os
            trabalhos e os PDFs. Cópias de segurança dos provedores podem durar um pouco mais, até serem substituídas
            pelo ciclo normal delas.
          </li>
          <li>
            <b>Visualizações das aulas:</b> removidas automaticamente depois de um prazo que a equipe define (padrão:{' '}
            {DEFAULT_CONFIG.analytics.retentionDays} dias; nunca mais que {CONFIG_LIMITS.retentionDays.max}).
          </li>
          <li>
            <b>Histórico de segurança do painel da equipe:</b> registra quem fez o quê em contas (por exemplo, uma
            suspensão) e pode guardar nome e e-mail de quem participou, por segurança e prestação de contas. Esse
            registro não é apagado junto com a conta.
          </li>
        </ul>
      </Section>

      <Section id="direitos" title="7. Seus direitos">
        <p>Pela LGPD (art. 18), você pode pedir, a qualquer momento:</p>
        <ul>
          <li>confirmação de que tratamos seus dados e acesso a eles;</li>
          <li>correção de dados incompletos ou desatualizados;</li>
          <li>anonimização, bloqueio ou eliminação de dados desnecessários ou tratados fora da lei;</li>
          <li>portabilidade dos dados;</li>
          <li>eliminação dos dados e exclusão da conta;</li>
          <li>informação sobre com quem compartilhamos;</li>
          <li>retirada do consentimento e revisão de decisões.</li>
        </ul>
        <p>
          <b>Você faz boa parte disso sozinho(a), em Configurações:</b> edita seus dados em “Dados pessoais”, baixa tudo
          em “Conta → Baixar meus dados” e apaga a conta em “Conta → Excluir minha conta”. Para qualquer outro pedido,
          escreva para <a href={`mailto:${email}`}>{email}</a>. Respondemos em até 15 dias.
        </p>
        <p>
          Se achar que seus direitos não foram respeitados, você também pode reclamar à Autoridade Nacional de Proteção
          de Dados (ANPD), em gov.br/anpd.
        </p>
      </Section>

      <Section id="seguranca" title="8. Como protegemos">
        <p>
          O site fala com o banco de dados só pelo servidor, a conexão é criptografada, cada pessoa só enxerga os
          próprios dados (regras no próprio banco), a equipe de administração usa verificação em duas etapas, e há
          limites contra tentativas em massa. Nenhum sistema é infalível: se houver um incidente que possa causar risco
          a você, avisaremos você e a ANPD, como manda a lei.
        </p>
      </Section>

      <Section id="menores" title="9. Menores de idade">
        <p>
          Se você tem menos de 18 anos, use a Folyo com o conhecimento e a autorização de um responsável legal. Os dados
          de crianças e adolescentes são tratados sempre no melhor interesse deles (LGPD, art. 14). Se um responsável
          perceber que um menor se cadastrou sem autorização, escreva para <a href={`mailto:${email}`}>{email}</a> e
          excluímos a conta.
        </p>
      </Section>

      <Section id="mudancas" title="10. Mudanças nesta política">
        <p>
          Podemos atualizar este texto. Quando a mudança for importante, avisamos dentro da Folyo ou por e-mail. A data
          de atualização aparece no topo da página.
        </p>
      </Section>
    </article>
  )
}
