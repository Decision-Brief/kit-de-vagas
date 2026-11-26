# Kit de Vagas para Tecnologia

Acha vagas de tecnologia, avalia cada uma contra o seu perfil e monta o currículo sob medida. Roda no seu Claude Code, em português, e **nunca envia nada por você**.

Feito por Felipe Ribeiro, designer de produto e fundador do [Decision Brief](https://decision-brief.com).

## O que ele faz

1. **Procura vagas** nas páginas públicas de centenas de empresas (Greenhouse, Ashby, Lever, Workable), em feeds de vagas remotas e na Gupy. Quem procura é um programa comum, sem IA, e dá uma nota de 0 a 100 por regra.
2. **A IA lê só as 5 melhores** e diz o que bate com o seu perfil, o que falta e se vale aplicar.
3. **Monta o currículo e uma carta curta** para a vaga que você escolher.
4. **Você revisa e envia**, no site da empresa. O kit só guarda o status das suas candidaturas.

## A regra que não muda

Só entra no currículo o que **você confirmou**. Na primeira vez, o kit lê o seu currículo e pergunta fato por fato ("É verdade, e você sabe explicar como mediu?"). O que você não confirma fica guardado como "não confirmado" e nunca aparece num PDF. Um número que não está num fato confirmado trava a geração do pacote.

## Requisitos

- Claude Code 2.1.328 ou mais novo
- Node.js 18 ou mais novo (o kit usa só o que já vem nele, não instala nada)
- Google Chrome, Chromium ou Edge para gerar o PDF. Sem eles, o kit entrega o currículo em HTML para você salvar como PDF pelo navegador

## Instalar

No Claude Code:

```
/plugin marketplace add Decision-Brief/kit-de-vagas
/plugin install vagas@kit-de-vagas
/vagas:inicio
```

A primeira execução leva uns 10 minutos (montar o perfil). Depois, `/vagas:inicio` abre um menu com 4 opções.

## Onde ficam os seus dados

Tudo fica numa pasta no seu computador: `~/kit-de-vagas` (perfil, vagas lidas, pacotes, respostas de opinião). Para usar outra pasta, defina `KIT_VAGAS_HOME`. O kit **não guarda nada fora do seu computador** e o Decision Brief não recebe o seu currículo, as vagas nem o seu nome.

## Para onde o kit faz pedidos de rede

Só para ler páginas públicas de vagas: `boards-api.greenhouse.io`, `api.lever.co`, `api.eu.lever.co`, `api.ashbyhq.com`, `apply.workable.com`, `remotive.com`, `remoteok.com`, `weworkremotely.com` e `portal.gupy.io`. A lista também está declarada em `.claude-plugin/plugin.json`.

## Sobre a Gupy

A Gupy vem **ligada**, porque é onde está a maior parte das vagas do Brasil. Ela não tem uma API pública documentada para candidatos: o kit lê a rota que o próprio site dela usa, que pode mudar sem aviso. Os Termos de Uso do candidato da Gupy restringem a cópia automatizada de vagas. Você decide se quer usar. Para desligar: peça no menu "Ver ou ajustar meu perfil", ou rode `node scripts/kit.mjs config-set gupy nao` na pasta do kit.

## O que o kit não faz

- Não envia candidatura, e-mail nem mensagem.
- Não usa o LinkedIn e não entra em nenhuma conta sua.
- Não inventa experiência, número ou empresa.
- Não vê todas as vagas do mercado: só as das empresas da lista e das fontes acima. Você pode acrescentar uma empresa colando o link da página de vagas dela.

## Como ele evita que a IA improvise

Cada tela do menu sai de um programa, não da IA. A IA só apresenta o texto e faz a pergunta com as opções que o programa deu. A leitura de cada vaga roda num subagente que não tem permissão para usar nenhuma ferramenta, porque o texto de uma vaga vem de terceiros e pode conter instruções escondidas. A resposta dele é aceita só num formato fixo, com tamanho limitado e sem links.

Isso reduz o desvio, mas não o elimina: uma instrução em texto é um pedido, não uma garantia. As garantias fortes são as do programa.

## Opinião

Na primeira execução, o kit pergunta se você aceita ajudar com respostas anônimas. Por enquanto as respostas ficam **só no seu computador** (`feedback.jsonl`). Nada é enviado.

## Licença

[PolyForm Noncommercial 1.0.0](LICENSE). Uso pessoal e não comercial é livre. Revender o kit ou usá-lo como parte de um produto comercial exige licença à parte: fale com `contato@decision-brief.com`. Mantenha o aviso de autoria.
