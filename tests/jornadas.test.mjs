// Bateria de regressao do Kit de Vagas: percorre as jornadas como a IA percorre (pelo comando kit.mjs), valida cada campo
// e cada recusa, e confere os contratos entre as telas, o roteiro (SKILL.md) e os comandos. Sem rede, sem navegador.
// Uso: node --test tests/jornadas.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const KIT = join(RAIZ, "scripts/kit.mjs");
const SKILL = readFileSync(join(RAIZ, "skills/inicio/SKILL.md"), "utf8");
const dia = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

function novaCasa() {
  const casa = mkdtempSync(join(tmpdir(), "kit-jornada-"));
  const env = { ...process.env, KIT_VAGAS_HOME: casa, KIT_VAGAS_NAO_ABRIR: "1" };
  // k("comando", args..., { stdin }) -> { ok, dado | erro }
  const k = (cmd, ...resto) => {
    const opts = resto.at(-1) && typeof resto.at(-1) === "object" && !Array.isArray(resto.at(-1)) ? resto.pop() : {};
    const r = spawnSync("node", [KIT, cmd, ...resto], { env: { ...env, ...(opts.env ?? {}) }, encoding: "utf8", input: opts.stdin ?? "" });
    const texto = (r.status === 0 ? r.stdout : r.stderr).trim();
    let dado = null;
    try { dado = JSON.parse(texto); } catch { dado = texto; }
    return { ok: r.status === 0, dado, bruto: texto, saida: r.stdout, erroBruto: r.stderr };
  };
  const arq = (nome) => join(casa, nome);
  const lerJson = (nome) => JSON.parse(readFileSync(arq(nome), "utf8"));
  const gravar = (nome, obj) => writeFileSync(arq(nome), JSON.stringify(obj));
  return { casa, k, arq, lerJson, gravar };
}

function vagaFixa(i, over = {}) {
  const curto = `a${i}`.padEnd(7, "0").slice(0, 7);
  return {
    id: `fx:${i}`, curto, fonte: "greenhouse", empresa: `Empresa ${String.fromCharCode(64 + i)}`, titulo: `Engenheiro Backend ${i}`,
    local: "São Paulo, Brasil", remoto: false, url: `https://exemplo.com/vaga-${i}`, equipe: "", publicadoEm: dia(i * 3),
    descricao: `Trabalhamos com Go, Kafka e Kubernetes. Vaga ${i}.`.padEnd(120, " x"), score: 90 - i, faixa: "forte", razoes: [], flags: [],
    primeiraVez: dia(0), ultimaVez: dia(0), ativa: true, status: "novo", notas: "", historico: [], ...over,
  };
}
const semearVagas = (c, n = 7, over = (i) => ({})) => {
  const vagas = {};
  for (let i = 1; i <= n; i++) { const v = vagaFixa(i, over(i)); vagas[v.id] = v; }
  c.gravar("vagas.json", { atualizadoEm: new Date().toISOString(), ultimaLeitura: { lidas: 1234 }, vagas });
  return Object.values(vagas);
};
const AVAL = (rec = "aplicar", falta = ["Kafka (3 anos)"]) => JSON.stringify({ tem: ["Go", "APIs de pagamento"], falta, recomendacao: rec, motivo: "Bom encaixe em backend para o seu perfil." });

// Toda tela devolvida pelos comandos passa por aqui: contrato com a caixa de escolha do Claude Code.
const procedimentosVistos = new Set();
function conferirTela(nome, t) {
  assert.equal(typeof t.texto, "string", `${nome}: sem texto`);
  if (!t.opcoes || t.opcoes.length === 0) return;
  assert.ok(t.opcoes.length >= 2 && t.opcoes.length <= 4, `${nome}: ${t.opcoes.length} opcoes (a caixa aceita de 2 a 4)`);
  assert.equal(new Set(t.opcoes.map((o) => o.rotulo)).size, t.opcoes.length, `${nome}: rotulos repetidos`);
  assert.ok(t.opcoes.filter((o) => o.recomendada).length <= 1, `${nome}: mais de uma recomendada`);
  assert.ok(t.pergunta && !/\n/.test(t.pergunta), `${nome}: a pergunta da caixa precisa estar em uma linha so (o VS Code junta as quebras)`);
  assert.ok(t.pergunta.length <= 900, `${nome}: pergunta longa demais (${t.pergunta.length})`);
  assert.ok(!/https?:\/\//.test(t.pergunta) || ["lista", "vaga"].includes(t.tela), `${nome}: link cru na pergunta`);
  for (const o of t.opcoes) if (o.procedimento) procedimentosVistos.add(o.procedimento);
}

const CONTATO = { nome: "Larissa Prado", email: "larissa@exemplo.com", telefone: "+55 81 90000-0000", local: "Recife, PE", linkedin: "linkedin.com/in/exemplo", github: "", portfolio: "" };
const FATOS = [
  { tipo: "resultado", empresa: "Banco X", cargo: "Desenvolvedora Backend Pleno", periodo: "jan/2022 a atual", texto: "Reduzi o tempo de resposta da API de pagamentos de 800 ms para 310 ms." },
  { tipo: "resultado", empresa: "Banco X", cargo: "Desenvolvedora Backend Pleno", periodo: "jan/2022 a atual", texto: "Implementei a conciliação automática de transações." },
  { tipo: "resultado", empresa: "Fintech Y", cargo: "Desenvolvedora Backend Júnior", periodo: "mar/2019 a dez/2021", texto: "Escrevi testes automatizados: a cobertura do módulo de cobrança foi de 35% para 78%." },
  { tipo: "competencia", texto: "Go, Node.js, PostgreSQL, Redis, Kafka, Docker, Kubernetes, AWS" },
  { tipo: "formacao", texto: "Bacharelado em Ciência da Computação, UFPE, 2014 a 2018" },
  { tipo: "idioma", texto: "Português nativo. Inglês avançado." },
];

test("JORNADA 1 · com currículo, do primeiro comando ao 'enviei'", () => {
  const c = novaCasa();
  const { k } = c;

  let t = k("estado").dado;
  conferirTela("boas-vindas", t);
  assert.equal(t.tela, "boas-vindas");
  assert.deepEqual(t.opcoes.map((o) => o.procedimento), ["cv-primeiro", "escolher-area"]);
  assert.match(t.texto, /Gupy vem ligada/);

  assert.ok(k("contato", { stdin: JSON.stringify(CONTATO) }).ok);
  const prop = k("fato-propor", { stdin: JSON.stringify(FATOS) });
  assert.deepEqual(prop.dado.propostos, ["f1", "f2", "f3", "f4", "f5", "f6"]);
  for (const [chave, valor] of [["areas", "desenvolvimento"], ["nivel", "Pleno"], ["local", "Brasil"], ["palavras", "go,kafka,kubernetes"]]) {
    assert.ok(k("config-set", chave, valor).ok, `config-set ${chave}`);
  }
  t = k("tela-entendi").dado;
  conferirTela("entendi", t);
  assert.match(t.texto, /Entendi: Desenvolvimento, nível pleno, Brasil/);
  assert.match(t.texto, /Achei 3 resultados/);

  const vagas = semearVagas(c);
  t = k("abrir-lista").dado;
  conferirTela("lista", t);
  assert.equal(t.itens.length, 5);
  assert.ok(existsSync(c.arq("vagas-de-hoje.html")), "a pagina da lista foi escrita");
  const html = readFileSync(c.arq("vagas-de-hoje.html"), "utf8");
  for (const v of t.itens) {
    const v0 = vagas.find((x) => x.curto === v.curto);
    assert.ok(html.includes(v0.url), `link da vaga ${v.n} na pagina`);
    assert.ok(t.texto.includes(v0.url), `link da vaga ${v.n} no terminal`);
  }
  assert.match(t.pergunta, /vagas-de-hoje\.html/);
  assert.match(t.pergunta, /Abra esta lista no navegador/, "se o navegador nao abriu, o caminho e os links vao na pergunta");
  assert.ok(/vaga-1/.test(t.pergunta), "sem a pagina aberta, a pergunta leva os links como reserva");
  const aberta = k("abrir-lista", { env: { KIT_VAGAS_NAO_ABRIR: "simular" } }).dado;
  assert.match(aberta.pergunta, /Abri a lista de vagas no seu navegador/);
  assert.ok(!/vaga-1/.test(aberta.pergunta), "com a pagina aberta, a pergunta nao despeja os links");
  assert.ok(aberta.pergunta.length < 450, "pergunta curta quando a pagina abriu");
  assert.match(t.opcoes[0].rotulo, /Comparar as 5 com o meu currículo/);
  assert.deepEqual(t.opcoes.map((o) => o.procedimento), ["comparar", "escolher-vaga", "so-olhar"]);
  const curtos = t.itens.map((i) => i.curto);

  // comparar: primeiro pede a leitura de cada vaga
  t = k("tela-comparar", ...curtos).dado;
  assert.equal(t.precisaLeitura.length, 5);
  const recs = ["aplicar com ressalva", "aplicar", "pular", "aplicar", "aplicar com ressalva"];
  curtos.forEach((cc, i) => assert.ok(k("avaliacao-salvar", cc, { stdin: AVAL(recs[i]) }).ok));
  t = k("tela-comparar", ...curtos).dado;
  conferirTela("comparar", t);
  const ordem = t.texto.split("\n").filter((l) => /^\d  /.test(l));
  assert.equal(ordem.length, 5);
  assert.match(ordem[4], /Empresa C/, "a vaga com 'pular' fica por ultimo");
  assert.match(t.texto, /Recarregue a página/);
  assert.match(t.pergunta, /selo, a recomendação e o motivo/);
  assert.match(readFileSync(c.arq("vagas-de-hoje.html"), "utf8"), /Combina nº 1/, "a pagina ganha o selo apos comparar");

  // vaga por dentro
  t = k("tela-vaga", curtos[1]).dado;
  conferirTela("vaga", t);
  assert.deepEqual(t.opcoes.map((o) => o.procedimento), ["gerar-pacote", "ja-candidatei", "escolher-vaga"]);
  assert.match(t.texto, /Você tem: Go/);

  // fatos em lote -> lacunas -> pacote
  t = k("tela-fatos-lote").dado;
  conferirTela("fatos-lote", t);
  assert.match(t.texto, /f1 {2}Banco X: Reduzi/);
  assert.match(t.texto, /Contato: Larissa Prado/);
  assert.deepEqual(t.opcoes.map((o) => o.id), ["todos", "corrigir", "depois"]);
  assert.equal(k("fatos-confirmar-todos").dado.confirmados, 6);
  assert.equal(k("tela-fatos-lote").dado.nenhum, true, "depois de confirmar, a tela de fatos some");

  const lac = k("lacunas").dado.perguntas;
  assert.equal(lac.find((q) => q.id === "metrica").fato, "f2");
  assert.ok(lac.some((q) => q.id === "link" && q.campo === "github"));
  assert.ok(k("fato-corrigir", "f2", "Implementei a conciliação automática de transações: o trabalho manual caiu de 6 horas para 40 minutos por dia.").ok);
  assert.ok(k("contato-link", "github", "github.com/larissa-exemplo").ok);
  assert.equal(k("lacunas").dado.perguntas.filter((q) => q.id === "link").length, 0);

  const spec = {
    titulo: "Desenvolvedora Backend Pleno", posicionamento: "APIs de pagamento e alta disponibilidade",
    resumo: "Desenvolvedora backend pleno. Reduziu a latência de uma API de 800 ms para 310 ms.",
    fatos: ["f2", "f1", "f3"], grupos: { Linguagens: ["Go", "Node.js"], Dados: ["PostgreSQL", "Redis"] },
    tecnologias: { "Banco X": ["Go", "Kafka"] }, carta: "Olá! Reduzi a latência de uma API de 800 ms para 310 ms. Posso contar mais.", estilo: "moderno",
  };
  const pac = k("pacote", curtos[1], { stdin: JSON.stringify(spec) });
  assert.ok(pac.ok, pac.bruto);
  assert.deepEqual(Object.keys(pac.dado.arquivos).sort(), ["classico", "compacto", "moderno"]);
  for (const e of ["classico", "moderno", "compacto"]) assert.ok(existsSync(pac.dado.arquivos[e].html), `html ${e}`);
  assert.ok(existsSync(join(pac.dado.pasta, "carta.txt")));
  const htmlCv = readFileSync(pac.dado.arquivos.moderno.html, "utf8");
  assert.match(htmlCv, /github\.com\/larissa-exemplo/);
  assert.match(htmlCv, /Tecnologias: Go, Kafka/);
  assert.match(htmlCv, /<b>Linguagens:<\/b> Go, Node\.js/);

  // enviei -> menu recomenda candidaturas -> opiniao
  assert.ok(k("marcar", curtos[1], "enviado").ok);
  t = k("estado").dado;
  conferirTela("menu", t);
  assert.equal(t.tela, "menu");
  assert.equal(t.opcoes.find((o) => o.recomendada).id, "candidaturas", "logo apos enviar, recomenda ver candidaturas");
  let f = k("feedback-proxima").dado;
  assert.equal(f.pergunta.id, "fiel");
  assert.equal(f.pergunta.opcoes.length, 3);
  assert.match(f.depois, /github\.com\/Decision-Brief\/kit-de-vagas/);
  assert.ok(k("feedback-registrar", "fiel", "sim").ok);
  f = k("feedback-proxima").dado;
  assert.equal(f.pergunta.id, "facil", "a segunda pergunta e a de facilidade");
  assert.ok(k("feedback-registrar", "facil", "pular").ok);
  assert.equal(k("feedback-proxima").dado.pergunta, null, "cada pergunta aparece uma vez");
  assert.match(readFileSync(c.arq("feedback.jsonl"), "utf8"), /"pergunta":"fiel","resposta":"sim"/);
  assert.ok(!/pular/.test(readFileSync(c.arq("feedback.jsonl"), "utf8")), "pular nao grava resposta");

  t = k("candidaturas").dado;
  conferirTela("candidaturas", t);
});

test("JORNADA 2 · sem currículo: ver e decidir sozinha", () => {
  const c = novaCasa();
  const { k } = c;
  assert.equal(k("estado").dado.tela, "boas-vindas");
  assert.ok(k("config-set", "areas", "design").ok);
  const t0 = k("estado").dado;
  conferirTela("menu sem cv", t0);
  assert.match(t0.texto, /sem currículo/);
  assert.equal(t0.opcoes[2].rotulo, "Colar meu currículo");
  semearVagas(c);
  const t = k("abrir-lista").dado;
  conferirTela("lista sem cv", t);
  assert.match(t.opcoes[0].rotulo, /preciso do seu currículo/);
  assert.match(t.texto, /combinam com o que você procura/);
  const so = k("tela-so-olhar").dado;
  conferirTela("so-olhar", so);
  assert.match(so.texto, /vagas-de-hoje\.html/);
  const v = k("tela-vaga", t.itens[0].curto).dado;
  conferirTela("vaga sem cv", v);
  assert.deepEqual(v.opcoes.map((o) => o.id), ["cv", "outra"]);
  assert.deepEqual(v.opcoes[0].depois, { procedimento: "tela-vaga", curto: t.itens[0].curto }, "depois de colar o curriculo, volta para a vaga");
  assert.equal(k("pacote", t.itens[0].curto, { stdin: JSON.stringify({ titulo: "x", resumo: "y", fatos: [] }) }).ok, false, "sem curriculo nao ha pacote");
});

test("JORNADA 3 · lista vazia, 'ver mais' e 'já me candidatei'", () => {
  const c = novaCasa();
  const { k } = c;
  k("config-set", "areas", "desenvolvimento");
  let t = k("abrir-lista").dado;
  conferirTela("lista vazia", t);
  assert.equal(t.tela, "lista-vazia");
  semearVagas(c, 8);
  const primeira = k("abrir-lista").dado;
  const maisA = k("abrir-lista", "--mais").dado;
  const novas = maisA.itens.map((i) => i.curto);
  assert.equal(novas.length, 3, "ver mais traz so as que ainda nao foram mostradas");
  assert.ok(novas.every((x) => !primeira.itens.some((i) => i.curto === x)));
  assert.ok(k("marcar", primeira.itens[0].curto, "enviado", "enviada por fora do kit").ok);
  const depois = k("abrir-lista").dado;
  assert.ok(!depois.itens.some((i) => i.curto === primeira.itens[0].curto), "vaga ja enviada nao volta nas listas");
});

test("LEITOR · tolera JSON cercado de texto, e o roteiro manda nao travar quando o leitor falha", () => {
  const c = novaCasa();
  const { k } = c;
  k("config-set", "areas", "desenvolvimento");
  const [v] = semearVagas(c, 1);
  const cercado = "Aqui esta a avaliacao:\n```json\n" + AVAL("aplicar") + "\n```\nEspero que ajude.";
  const r = k("avaliacao-salvar", v.curto, { stdin: cercado });
  assert.ok(r.ok, r.bruto);
  assert.equal(r.dado.recomendacao, "aplicar");
  assert.equal(k("avaliacao-salvar", v.curto, { stdin: "sem json nenhum" }).ok, false);
  assert.match(SKILL, /não pergunte nada à pessoa/);
  assert.match(SKILL, /A comparação nunca pode ficar parada/);
  const agente = readFileSync(join(RAIZ, "agents/leitor-de-vaga.md"), "utf8");
  assert.match(agente, /^model: sonnet$/m, "o leitor nao herda o modelo menor da sessao");
  assert.match(agente, /Nunca termine sem ele/);
});

test("CANDIDATURAS · página no navegador, e pergunta curta em vez de parágrafo", () => {
  const c = novaCasa();
  const { k } = c;
  k("config-set", "areas", "design");
  semearVagas(c, 4, (i) => (i === 1 ? { status: "respondeu", enviadoEm: dia(5), historico: [{ em: dia(5), status: "respondeu" }] }
    : i === 2 ? { status: "enviado", enviadoEm: dia(14), historico: [{ em: dia(14), status: "enviado" }], titulo: "Dev <b>x</b>" }
    : i === 3 ? { status: "enviado", enviadoEm: dia(1), historico: [{ em: dia(1), status: "enviado" }] } : {}));
  const t = k("candidaturas", { env: { KIT_VAGAS_NAO_ABRIR: "simular" } }).dado;
  conferirTela("candidaturas com itens", t);
  assert.match(t.pergunta, /Abri suas candidaturas no navegador/);
  assert.match(t.pergunta, /3 candidaturas \(/);
  assert.match(t.pergunta, /1 parada há mais de 10 dias/);
  assert.ok(t.pergunta.length < 400, "pergunta curta, sem despejar a lista");
  assert.equal(t.opcoes[0].procedimento, "atualizar-candidaturas");
  const html = readFileSync(c.arq("candidaturas.html"), "utf8");
  assert.match(html, /<h1>Minhas candidaturas<\/h1>/);
  assert.match(html, /Respondeu/);
  assert.match(html, /enviada em \d{2}\/\d{2}\/\d{4}/, "data no formato dd/mm/aaaa");
  assert.match(html, /14 dias sem novidade/);
  assert.ok(html.includes("&lt;b&gt;x&lt;/b&gt;") && !/<b>x<\/b>/.test(html), "titulo de terceiros escapado");
  assert.ok((html.match(/<a class="go"/g) ?? []).length === 3);
  const fallback = k("candidaturas").dado;
  assert.match(fallback.pergunta, /Suas candidaturas · 3/, "sem navegador, a pergunta traz a lista inteira, em uma linha");
  assert.ok(!/\n/.test(fallback.pergunta) && /enviado/.test(fallback.pergunta));
});

test("RANK · a numeracao de uma comparacao antiga nao vaza para a lista nova", () => {
  const c = novaCasa();
  const { k } = c;
  k("config-set", "areas", "desenvolvimento");
  semearVagas(c, 6);
  const l1 = k("abrir-lista").dado;
  const curtos = l1.itens.map((i) => i.curto);
  curtos.forEach((cc) => k("avaliacao-salvar", cc, { stdin: AVAL("aplicar") }));
  k("tela-comparar", ...curtos);
  assert.match(readFileSync(c.arq("vagas-de-hoje.html"), "utf8"), /Combina nº 5/);
  k("marcar", curtos[0], "enviado", "por fora");
  k("abrir-lista");
  const html = readFileSync(c.arq("vagas-de-hoje.html"), "utf8");
  assert.ok(!/Combina nº/.test(html), "lista nova nao mostra selos da comparacao anterior");
});

test("VALIDAÇÕES · cada comando recusa entrada ruim com erro em JSON e sem pilha", () => {
  const c = novaCasa();
  const { k } = c;
  const recusa = (nome, r, padrao) => {
    assert.equal(r.ok, false, `${nome}: deveria recusar`);
    assert.doesNotThrow(() => JSON.parse(r.bruto), `${nome}: erro nao e JSON: ${r.bruto.slice(0, 80)}`);
    assert.ok(JSON.parse(r.bruto).erro, `${nome}: sem campo erro`);
    assert.ok(!/\bat .*\.mjs/.test(r.bruto), `${nome}: vazou pilha de erro`);
    if (padrao) assert.match(JSON.parse(r.bruto).erro, padrao, nome);
  };
  recusa("comando desconhecido", k("nao-existe"), /Comando desconhecido/);
  recusa("areas invalidas", k("config-set", "areas", "culinaria"), /Areas validas/);
  recusa("areas vazias", k("config-set", "areas", ""), /Areas validas/);
  recusa("nivel invalido", k("config-set", "nivel", "junior"), /Niveis validos/);
  recusa("local invalido", k("config-set", "local", "lua"), /Locais validos/);
  recusa("chave invalida", k("config-set", "cor", "azul"), /Chaves validas/);
  assert.equal(k("config-set", "nivel", "Sênior").dado.nivel, "senior", "acento e maiuscula sao aceitos");
  assert.equal(k("config-set", "areas", "Design, Produto").dado.areas.join(), "design,produto");
  assert.equal(k("config-set", "palavras", Array.from({ length: 30 }, (_, i) => `t${i}`).join(",")).dado.palavrasChave.length, 20, "no maximo 20 palavras");
  assert.equal(k("config-set", "gupy", "nao").dado.fontes.gupy, false);
  assert.equal(k("config-set", "gupy", "sim").dado.fontes.gupy, true);

  recusa("fato sem texto", k("fato-propor", { stdin: JSON.stringify([{ tipo: "resultado", empresa: "X", texto: "" }]) }), /sem texto/);
  recusa("resultado sem empresa", k("fato-propor", { stdin: JSON.stringify([{ tipo: "resultado", texto: "Fiz algo importante" }]) }), /precisa de empresa/);
  recusa("fato sem JSON", k("fato-propor"), /Esperava um JSON/);
  recusa("JSON quebrado", k("fato-propor", { stdin: "{nao e json" }), /invalido/);
  const dup = [{ tipo: "competencia", texto: "Go" }, { tipo: "competencia", texto: "go" }];
  assert.equal(k("fato-propor", { stdin: JSON.stringify(dup) }).dado.propostos.length, 1, "duplicata (maiuscula) e ignorada");
  const rot = k("fato-propor", { stdin: JSON.stringify([{ tipo: "competencia", texto: "Idiomas: Inglês" }, { tipo: "competencia", texto: "Formação: UFPE" }]) });
  const perfil = k("perfil-resumo").dado;
  assert.deepEqual(perfil.fatos.filter((f) => f.id !== "f1").map((f) => f.tipo).sort(), ["formacao", "idioma"], "prefixo reclassifica o tipo");
  recusa("confirmar fato que nao existe", k("fato-confirmar", "f99"), /Nao existe/);
  recusa("corrigir com texto vazio", k("fato-corrigir", "f1", " "), /vazio/);
  recusa("contato sem e-mail", k("contato", { stdin: JSON.stringify({ nome: "X" }) }).ok ? k("contato-confirmar") : k("contato-confirmar"), /nome ou e-mail/);
  recusa("link de campo invalido", k("contato-link", "twitter", "x.com/a"), /Campos validos/);
  recusa("link que nao e endereco", k("contato-link", "github", "isso nao e link"), /endereco/);
  assert.ok(k("contato-link", "portfolio", "https://decision-brief.com/portfolio/").ok);

  semearVagas(c, 2);
  recusa("status invalido", k("marcar", "a10000", "contratado"), /Status invalido/);
  recusa("vaga inexistente", k("marcar", "zzzzzzz", "enviado"), /Nenhuma vaga/);
  recusa("codigo ambiguo", k("marcar", "a", "enviado"), /serve para 2 vagas/);
  recusa("avaliacao sem JSON", k("avaliacao-salvar", "a10000"), /Esperava um JSON/);
  recusa("recomendacao invalida", k("avaliacao-salvar", "a10000", { stdin: AVAL("contrate ja") }), /recomendacao/);
  recusa("avaliacao sem motivo", k("avaliacao-salvar", "a10000", { stdin: JSON.stringify({ tem: [], falta: [], recomendacao: "pular" }) }), /motivo/i);
  recusa("avaliacao com lista errada", k("avaliacao-salvar", "a10000", { stdin: JSON.stringify({ tem: "go", falta: [], recomendacao: "pular", motivo: "x" }) }), /lista/);
  recusa("vaga colada curta", k("importar-vaga", { stdin: JSON.stringify({ titulo: "x", texto: "curto" }) }), /curto demais/);
  assert.equal(k("empresa-add", "https://exemplo.com/carreiras").dado.ok, false, "link de sistema desconhecido e explicado");
  recusa("tela-comparar sem codigos", k("tela-comparar"), /codigos/);
  recusa("tela-vaga inexistente", k("tela-vaga", "zzzzzzz"), /Nenhuma vaga/);
  recusa("pacote sem JSON", k("pacote", "a10000"), /Esperava um JSON/);
  recusa("feedback desconhecido", k("feedback-registrar", "inventada", "sim"), /desconhecida/);
});

test("PACOTE · toda recusa do gerador de currículo", () => {
  const c = novaCasa();
  const { k } = c;
  k("config-set", "areas", "desenvolvimento");
  semearVagas(c, 1);
  k("contato", { stdin: JSON.stringify(CONTATO) });
  k("fato-propor", { stdin: JSON.stringify(FATOS) });
  const v = "a10000";
  const ok = { titulo: "Backend", resumo: "Backend com Go.", fatos: ["f1"], carta: "Olá." };
  const tenta = (spec) => k("pacote", v, { stdin: JSON.stringify(spec) });
  const erro = (r) => (r.ok ? "" : JSON.parse(r.bruto).erro);

  assert.match(erro(tenta(ok)), /contato ainda nao foram confirmados/);
  assert.match(erro(tenta(ok)), /"f1" nao foi confirmado/);
  k("fatos-confirmar-todos");
  assert.ok(tenta(ok).ok, "com tudo confirmado, gera");
  assert.match(erro(tenta({ ...ok, fatos: [] })), /ao menos 1 resultado/);
  assert.match(erro(tenta({ ...ok, fatos: ["f9"] })), /"f9" nao existe/);
  assert.match(erro(tenta({ ...ok, fatos: ["f4"] })), /ao menos 1 resultado/, "so competencia nao basta");
  assert.match(erro(tenta({ ...ok, titulo: "" })), /Falta "titulo"/);
  assert.match(erro(tenta({ ...ok, resumo: "" })), /Falta "resumo"/);
  assert.match(erro(tenta({ ...ok, resumo: "x".repeat(601) })), /600 caracteres/);
  assert.match(erro(tenta({ ...ok, carta: "x".repeat(1501) })), /1500 caracteres/);
  assert.match(erro(tenta({ ...ok, posicionamento: "x".repeat(121) })), /120 caracteres/);
  assert.match(erro(tenta({ ...ok, resumo: "Com 12 anos de experiência." })), /numero "12"/);
  assert.match(erro(tenta({ ...ok, carta: "Aumentei a receita em 300%." })), /numero "300"/);
  assert.match(erro(tenta({ ...ok, posicionamento: "Líder de 45 pessoas" })), /numero "45"/);
  assert.ok(tenta({ ...ok, resumo: "Levou uma API de 800 ms para 310 ms." }).ok, "numero que esta no fato confirmado passa");
  assert.match(erro(tenta({ ...ok, grupos: { Linguagens: ["Go", "Rust"] } })), /"Rust".*nao esta nas competencias/);
  assert.match(erro(tenta({ ...ok, tecnologias: { "Banco X": ["Cobol"] } })), /"Cobol"/);
  assert.match(erro(tenta({ ...ok, tecnologias: { "Empresa Fantasma": ["Go"] } })), /nao esta nos fatos escolhidos/);
  const sai = tenta({ ...ok, estilo: "inexistente" });
  assert.equal(sai.dado.estiloPrincipal, "moderno", "estilo desconhecido cai no padrao");
  assert.ok(tenta({ ...ok, estilo: "compacto" }).ok);
});

test("TEMPO · candidaturas paradas e volta depois de semanas", () => {
  const c = novaCasa();
  const { k } = c;
  k("config-set", "areas", "desenvolvimento");
  semearVagas(c, 3, (i) => (i === 1
    ? { status: "enviado", enviadoEm: dia(12), historico: [{ em: dia(12), status: "enviado", nota: "" }] }
    : i === 2 ? { status: "enviado", enviadoEm: dia(2), historico: [{ em: dia(2), status: "enviado", nota: "" }] } : {}));
  const cfg = c.lerJson("config.json");
  cfg.ultimaVez = dia(1);
  c.gravar("config.json", cfg);
  const t = k("estado").dado;
  conferirTela("voltando", t);
  assert.equal(t.tela, "voltando");
  assert.match(t.texto, /1 candidatura parada há mais de 10 dias/);
  assert.equal(t.opcoes[0].procedimento, "atualizar-candidaturas");
  assert.equal(k("paradas").dado.length, 1);
  assert.equal(k("estado").dado.tela, "menu", "o aviso aparece uma vez por dia");
  assert.ok(k("marcar", "a10000", "enviado", "sem resposta").ok);
  assert.equal(k("paradas").dado.length, 0, "atualizar tira da lista de paradas");

  const cfg2 = c.lerJson("config.json");
  cfg2.ultimaVez = dia(20);
  c.gravar("config.json", cfg2);
  assert.match(k("estado").dado.texto, /Faz 20 dias/);

  const sem = novaCasa();
  sem.k("config-set", "areas", "design");
  const cand = sem.k("candidaturas").dado;
  conferirTela("candidaturas vazia", cand);
  assert.deepEqual(cand.opcoes.map((o) => o.id), ["menu", "sair"], "tela vazia tambem tem 2 opcoes");
});

test("CONTRATO · roteiro (SKILL.md), comandos e telas combinam", () => {
  const c = novaCasa();
  const comandos = new Set(c.k("ajuda").dado.comandos);
  const usados = new Set([...SKILL.matchAll(/KIT ([a-z][a-z-]+)/g)].map((m) => m[1]));
  for (const cmd of usados) assert.ok(comandos.has(cmd), `a skill manda rodar "${cmd}", que nao existe no kit.mjs`);

  // exercita todas as telas para coletar os procedimentos que elas oferecem
  const { k } = c;
  conferirTela("boas-vindas", k("estado").dado);
  k("config-set", "areas", "desenvolvimento");
  k("contato", { stdin: JSON.stringify(CONTATO) });
  k("fato-propor", { stdin: JSON.stringify(FATOS) });
  const vagas = semearVagas(c);
  conferirTela("menu", k("estado").dado);
  const lista = k("abrir-lista").dado;
  conferirTela("lista", lista);
  conferirTela("so-olhar", k("tela-so-olhar").dado);
  conferirTela("entendi", k("tela-entendi").dado);
  conferirTela("fatos-lote", k("tela-fatos-lote").dado);
  conferirTela("candidaturas", k("candidaturas").dado);
  for (const i of lista.itens) k("avaliacao-salvar", i.curto, { stdin: AVAL(i.n === 3 ? "pular" : "aplicar") });
  conferirTela("comparar", k("tela-comparar", ...lista.itens.map((i) => i.curto)).dado);
  conferirTela("vaga com avaliacao", k("tela-vaga", lista.itens[0].curto).dado);
  conferirTela("vaga pular", k("tela-vaga", lista.itens[2].curto).dado);
  const outra = novaCasa(); outra.k("config-set", "areas", "design"); const v2 = semearVagas(outra);
  conferirTela("vaga sem cv", outra.k("tela-vaga", v2[0].curto).dado);
  const volt = novaCasa(); volt.k("config-set", "areas", "design"); semearVagas(volt, 2, (i) => ({ status: "enviado", enviadoEm: dia(15), historico: [{ em: dia(15), status: "enviado" }] }));
  const cf = volt.lerJson("config.json"); cf.ultimaVez = dia(30); volt.gravar("config.json", cf);
  conferirTela("voltando", volt.k("estado").dado);
  procedimentosVistos.add("sair");
  procedimentosVistos.add("tela-vaga"); // opcoes com "depois"

  for (const proc of procedimentosVistos) {
    assert.ok(new RegExp(`\\*\\*${proc}\\*\\*`).test(SKILL), `a tela oferece o procedimento "${proc}" e o SKILL.md nao o descreve`);
  }
  assert.ok(vagas.length > 0);
});

test("PÁGINA DA LISTA · conteúdo, escape e ausência de recursos externos", () => {
  const c = novaCasa();
  c.k("config-set", "areas", "desenvolvimento");
  semearVagas(c, 5, (i) => (i === 1
    ? { titulo: 'Dev <script>alert(1)</script> & "aspas"', empresa: "Cia <b>x</b>", url: "javascript:alert(1)" }
    : i === 2 ? { publicadoEm: dia(70) } : i === 3 ? { url: "" } : {}));
  c.k("abrir-lista");
  const html = readFileSync(c.arq("vagas-de-hoje.html"), "utf8");
  assert.match(html, /<html lang="pt-BR">/);
  assert.match(html, /<title>[^<]+<\/title>/);
  assert.match(html, /<main>/);
  assert.equal((html.match(/<h1>/g) ?? []).length, 1, "um h1 so");
  assert.ok(!/<script/i.test(html) && !/onerror=|onclick=|javascript:/i.test(html), "sem script nem evento nem javascript:");
  assert.ok(!/<(link|img|iframe|object|embed)\b/i.test(html) && !/src=|@import|url\(http/i.test(html), "nenhum recurso externo carrega");
  assert.ok(html.includes("&lt;script&gt;"), "titulo de terceiros escapado");
  assert.match(html, /sem link/, "vaga sem link e dita");
  assert.match(html, /confira se ainda está aberta/, "vaga de 70 dias avisa");
  const botoes = html.match(/<a class="go"[^>]*>/g) ?? [];
  assert.ok(botoes.length >= 3 && botoes.every((b) => /aria-label="Abrir vaga \d+: /.test(b) && /rel="noopener noreferrer"/.test(b)), "todo botao tem nome proprio e rel seguro");
  assert.match(html, /Quem faz este kit/);
  assert.match(html, /Quem se candidata é você/);
  assert.match(html, /Conheça o Decision Brief/);
  assert.match(html, /decision-brief\.com\/\?origem=kit/);
  assert.match(html, /<summary>Termos de uso do kit<\/summary>/);
  assert.match(html, /TERMOS\.md/);
  assert.match(html, /Gupy restringe/);
});

test("HIGIENE · nada pessoal, segredo ou lixo no repositório do kit", () => {
  const arquivos = [];
  const andar = (dir) => {
    for (const nome of readdirSync(dir)) {
      if ([".git", "node_modules"].includes(nome)) continue;
      const p = join(dir, nome);
      statSync(p).isDirectory() ? andar(p) : arquivos.push(p);
    }
  };
  andar(RAIZ);
  const textos = arquivos.filter((p) => /\.(md|mjs|json|txt|html|css|sh|yml|yaml)$/i.test(p) || /LICENSE$/.test(p));
  const permitidos = new Set(["contato@decision-brief.com", "larissa@exemplo.com", "l@exemplo.com", "a@b.c", "a@exemplo.com"]);
  for (const p of textos) {
    if (p.endsWith("jornadas.test.mjs") || p.endsWith("kit.test.mjs")) continue;
    const t = readFileSync(p, "utf8");
    for (const m of t.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]+/g)) { const e = m[0].replace(/\.+$/, ""); assert.ok(permitidos.has(e), `e-mail inesperado em ${p}: ${e}`); }
    assert.ok(!/gho_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|xkeysib-|BEGIN (RSA|PRIVATE)/.test(t), `parece haver segredo em ${p}`);
    assert.ok(!/\/Users\/[a-z]+\//i.test(t), `caminho pessoal em ${p}`);
    assert.ok(!/philippus|feliperibeiro/i.test(t), `dado pessoal em ${p}`);
  }
  assert.ok(!arquivos.some((p) => /(^|\/)(\.env|perfil\.json|vagas\.json|feedback\.jsonl)$/.test(p)), "arquivo de dados da pessoa dentro do repositorio");
  for (const f of ["LICENSE", "README.md", "TERMOS.md", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", "hooks/hooks.json", "agents/leitor-de-vaga.md", "skills/inicio/SKILL.md"]) assert.ok(existsSync(join(RAIZ, f)), `falta ${f}`);
  assert.match(readFileSync(join(RAIZ, "LICENSE"), "utf8"), /^Required Notice: Copyright/m);
  const plugin = JSON.parse(readFileSync(join(RAIZ, ".claude-plugin/plugin.json"), "utf8"));
  assert.match(plugin.version, /^\d+\.\d+\.\d+$/);
  const mkt = JSON.parse(readFileSync(join(RAIZ, ".claude-plugin/marketplace.json"), "utf8"));
  assert.equal(mkt.plugins[0].name, plugin.name);
  JSON.parse(readFileSync(join(RAIZ, "hooks/hooks.json"), "utf8"));
  const readme = readFileSync(join(RAIZ, "README.md"), "utf8");
  for (const m of readme.matchAll(/\]\((docs\/[^)]+|[A-Z]+\.md)\)/g)) assert.ok(existsSync(join(RAIZ, m[1])), `o README aponta para ${m[1]}, que nao existe`);
  assert.match(readme, /use o Claude Code, não o chat/i);
  assert.match(readme, /um comando de cada vez/);
  assert.match(readme, /Termos de uso/);
  for (const h of plugin.network.hosts) assert.ok(/^[a-z0-9.-]+$/.test(h), `host invalido ${h}`);
  const agente = readFileSync(join(RAIZ, "agents/leitor-de-vaga.md"), "utf8");
  assert.match(agente, /^name: leitor-de-vaga$/m);
  assert.match(agente, /NAO CONFIAVEL|INICIO DA VAGA/);
});

test("GERADOR DE PDF · os 3 estilos saem com uma página, texto legível e na ordem certa", async (t) => {
  const { acharChrome } = await import("../scripts/lib/cv.mjs");
  if (!acharChrome()) return t.skip("sem Chrome neste computador");
  const c = novaCasa();
  const { k } = c;
  k("config-set", "areas", "desenvolvimento");
  semearVagas(c, 1);
  k("contato", { stdin: JSON.stringify(CONTATO) });
  k("fato-propor", { stdin: JSON.stringify(FATOS) });
  k("fatos-confirmar-todos");
  const r = k("pacote", "a10000", { stdin: JSON.stringify({ titulo: "Backend", resumo: "Backend com Go.", fatos: ["f1", "f3"], grupos: { Linguagens: ["Go"] }, carta: "Olá." }) });
  assert.ok(r.ok, r.bruto);
  assert.equal(r.dado.semPdf, null);
  for (const [estilo, a] of Object.entries(r.dado.arquivos)) {
    assert.ok(a.pdf && existsSync(a.pdf), `pdf ${estilo}`);
    assert.ok(a.paginas >= 1 && a.paginas <= 2, `${estilo}: ${a.paginas} paginas`);
    if (process.platform === "darwin") {
      const { lerPdf } = await import("../scripts/lib/pdf.mjs");
      const txt = (await lerPdf(a.pdf)).texto.toLowerCase();
      const pos = (x) => txt.indexOf(x);
      assert.ok(pos("larissa prado") >= 0 && pos("larissa prado") < pos("experiência"), `${estilo}: o nome vem antes da experiencia`);
      assert.ok(pos("resumo") < pos("experiência") && pos("experiência") < pos("competências") && pos("competências") < pos("formação"), `${estilo}: secoes em ordem`);
      assert.match(txt, /800 ms para 310 ms/);
    }
  }
});

test("REDE · coleta real (só com KIT_TESTE_REDE=1)", { timeout: 240000 }, async (t) => {
  if (!process.env.KIT_TESTE_REDE) return t.skip("rode com KIT_TESTE_REDE=1");
  const c = novaCasa();
  c.k("config-set", "areas", "desenvolvimento,design");
  const r = c.k("coletar", "--forcar");
  assert.ok(r.ok, r.bruto);
  assert.ok(r.dado.total > 1000, `so ${r.dado.total} vagas lidas`);
  assert.ok(r.dado.falhas.length <= Math.ceil(r.dado.fontesLidas * 0.05), `fontes falharam: ${r.dado.falhas.map((f) => f.fonte).join(", ")}`);
  assert.ok(r.dado.porFonte.gupy > 0, "a Gupy devolveu vagas");
  const l = c.k("abrir-lista").dado;
  assert.equal(l.itens.length, 5);
  assert.ok(l.itens.every((i) => i.curto));
});
