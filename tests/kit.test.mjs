import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// A pasta da pessoa e isolada por teste: nada toca o ~/kit-de-vagas real.
process.env.KIT_VAGAS_HOME = mkdtempSync(join(tmpdir(), "kit-vagas-"));
process.env.KIT_VAGAS_NAO_ABRIR = "1"; // os testes nunca abrem navegador nem PDF
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

const { criarPontuador } = await import("../scripts/lib/pontuar.mjs");
const { validarAvaliacao } = await import("../scripts/lib/vagas.mjs");
const { detectarAts } = await import("../scripts/lib/fontes.mjs");
const { montarPacote } = await import("../scripts/lib/cv.mjs");
const perfilLib = await import("../scripts/lib/perfil.mjs");
const { estado } = await import("../scripts/lib/telas.mjs");
const { carregarConfig, salvarConfig } = await import("../scripts/lib/casa.mjs");

const vaga = (o) => ({ titulo: "", local: "", descricao: "", publicadoEm: null, remoto: null, ...o });

test("pontuacao: area de desenvolvimento", () => {
  const p = criarPontuador({ areas: ["desenvolvimento"], nivel: "pleno", local: "brasil", palavrasChave: ["go", "kafka"] });
  const boa = p(vaga({ titulo: "Engenheiro Backend Pleno", local: "Sao Paulo, Brasil", descricao: "Trabalhamos com Go e Kafka." }));
  assert.equal(boa.descartada, false);
  assert.ok(boa.score >= 75, `esperava >= 75, veio ${boa.score}`);
  assert.equal(p(vaga({ titulo: "UX Designer", local: "Brasil" })).descartada, true, "design fora da area");
  assert.equal(p(vaga({ titulo: "Desenvolvedor Backend Junior", local: "Brasil" })).descartada, true, "junior sai");
  const eua = p(vaga({ titulo: "Backend Engineer", local: "Remote, United States", descricao: "must reside in the United States" }));
  assert.ok(eua.score < 45, `remoto restrito deve cair, veio ${eua.score}`);
});

test("pontuacao: varias areas", () => {
  const p = criarPontuador({ areas: ["design", "produto"], nivel: "senior", local: "brasil", palavrasChave: [] });
  assert.equal(p(vaga({ titulo: "Senior Product Designer", local: "Brasil" })).descartada, false);
  assert.equal(p(vaga({ titulo: "Product Manager", local: "Brasil" })).descartada, false);
  assert.equal(p(vaga({ titulo: "Backend Engineer", local: "Brasil" })).descartada, true);
});

test("avaliacao do leitor: modelo fixo, sem link, com limites", () => {
  const a = validarAvaliacao({
    tem: ["Go e APIs"], falta: Array.from({ length: 9 }, (_, i) => `item ${i} https://evil.example/x`),
    recomendacao: "Aplicar com ressalva", motivo: "Bom encaixe. Visite https://evil.example", extra: "ignorado",
  });
  assert.equal(a.falta.length, 5);
  assert.ok(!JSON.stringify(a).includes("evil.example"));
  assert.equal(a.extra, undefined);
  assert.throws(() => validarAvaliacao({ tem: [], falta: [], recomendacao: "contrate ja", motivo: "x" }), /recomendacao/);
  assert.throws(() => validarAvaliacao({ tem: [], falta: [], recomendacao: "pular" }), /motivo/i);
});

test("deteccao do sistema de vagas pelo link", () => {
  assert.deepEqual(detectarAts("https://boards.greenhouse.io/acme/jobs/1"), { ats: "greenhouse", slug: "acme" });
  assert.deepEqual(detectarAts("https://jobs.lever.co/acme"), { ats: "lever", slug: "acme" });
  assert.deepEqual(detectarAts("https://jobs.ashbyhq.com/acme"), { ats: "ashby", slug: "acme" });
  assert.equal(detectarAts("https://exemplo.com/carreiras"), null);
});

test("curriculo: so entra o que a pessoa confirmou, e numero inventado barra o pacote", async () => {
  await perfilLib.salvarContato({ nome: "Larissa Prado", email: "l@exemplo.com", telefone: "", local: "Recife", linkedin: "", portfolio: "" });
  const [f1, f2] = await perfilLib.proporFatos([
    { tipo: "resultado", empresa: "Banco X", cargo: "Dev Backend", periodo: "2021-2024", texto: "Reduzi o tempo de resposta da API de 800 ms para 310 ms" },
    { tipo: "resultado", empresa: "Banco X", cargo: "Dev Backend", periodo: "2021-2024", texto: "Liderei a migracao para Kubernetes" },
  ]);
  const perfil = () => import("../scripts/lib/casa.mjs").then((m) => m.carregarPerfil());
  const spec = (o = {}) => ({ titulo: "Engenheira Backend", resumo: "Backend com foco em desempenho.", fatos: [f1.id], ...o });

  let m = montarPacote(await perfil(), spec());
  assert.ok(m.erros.some((e) => /contato/.test(e)), "contato nao confirmado barra");
  await perfilLib.confirmarContato();

  m = montarPacote(await perfil(), spec());
  assert.ok(m.erros.some((e) => e.includes(f1.id) && /nao foi confirmado/.test(e)), "fato pendente barra");

  await perfilLib.confirmarFato(f1.id);
  m = montarPacote(await perfil(), spec());
  assert.deepEqual(m.erros, []);

  m = montarPacote(await perfil(), spec({ resumo: "Backend com 12 anos de experiencia." }));
  assert.ok(m.erros.some((e) => /"12"/.test(e)), "numero inventado barra");
  m = montarPacote(await perfil(), spec({ resumo: "Backend que levou a API de 800 para 310 ms." }));
  assert.deepEqual(m.erros, [], "numero que esta no fato confirmado passa");

  m = montarPacote(await perfil(), spec({ fatos: [f2.id] }));
  assert.ok(m.erros.length > 0, "fato nao confirmado nao entra");

  const corrigido = await perfilLib.corrigirFato(f2.id, "Participei da migracao para Kubernetes, na parte dos servicos de pagamento");
  assert.equal(corrigido.confirmado, true);
  assert.match(corrigido.texto, /Participei/);
  assert.match(corrigido.textoOriginal, /Liderei/);
});

test("fatos: formacao e idiomas escritos como competencia vao para a secao certa", async () => {
  const novos = await perfilLib.proporFatos([
    { tipo: "competencia", texto: "Formação: Bacharelado em Ciência da Computação, UFPE" },
    { tipo: "competencia", texto: "Idiomas: Inglês avançado" },
  ]);
  assert.deepEqual(novos.map((f) => [f.tipo, f.texto]), [["formacao", "Bacharelado em Ciência da Computação, UFPE"], ["idioma", "Inglês avançado"]]);
});

test("telas: boas-vindas pergunta do curriculo, depois menu; nada obriga a dar o curriculo", async () => {
  const fresco = mkdtempSync(join(tmpdir(), "kit-vagas-estado-"));
  const r = spawnSync("node", ["--input-type=module", "-e", `
    process.env.KIT_VAGAS_HOME = ${JSON.stringify(fresco)};
    const { estado } = await import(${JSON.stringify(join(RAIZ, "scripts/lib/telas.mjs"))});
    const { carregarConfig, salvarConfig } = await import(${JSON.stringify(join(RAIZ, "scripts/lib/casa.mjs"))});
    const passos = [];
    const e1 = await estado();
    passos.push(e1.tela, e1.opcoes.map((o) => o.procedimento));
    const c = await carregarConfig(); c.areas = ["desenvolvimento"]; await salvarConfig(c);
    const e2 = await estado();
    passos.push(e2.tela, e2.opcoes.length, e2.opcoes[2].rotulo);
    console.log(JSON.stringify(passos));
  `], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), ["boas-vindas", ["cv-primeiro", "escolher-area"], "menu", 4, "Colar meu currículo"]);
});

test("curriculo: grupos e tecnologias so reorganizam competencias confirmadas", async () => {
  const perfil = await import("../scripts/lib/casa.mjs").then((m) => m.carregarPerfil());
  await perfilLib.proporFatos([{ tipo: "competencia", texto: "Go, PostgreSQL, Redis" }]);
  await perfilLib.confirmarTodos();
  const p2 = await import("../scripts/lib/casa.mjs").then((m) => m.carregarPerfil());
  const ids = p2.fatos.filter((f) => f.tipo === "resultado" && f.confirmado).map((f) => f.id);
  const base = { titulo: "Backend", resumo: "Backend com Go.", fatos: ids };
  assert.deepEqual(montarPacote(p2, { ...base, grupos: { Linguagens: ["Go"], Dados: ["PostgreSQL", "Redis"] } }).erros, []);
  const ruim = montarPacote(p2, { ...base, grupos: { Linguagens: ["Go", "Rust"] } });
  assert.ok(ruim.erros.some((e) => /"Rust"/.test(e)), "tecnologia fora do perfil barra");
  const emp = p2.fatos.find((f) => f.tipo === "resultado").empresa;
  assert.ok(montarPacote(p2, { ...base, tecnologias: { [emp]: ["Go", "Kafka"] } }).erros.some((e) => /"Kafka"/.test(e)));
  assert.ok(perfil.contato);
});

test("lacunas: so pergunta o que falta, no maximo 3", async () => {
  await perfilLib.proporFatos([{ tipo: "resultado", empresa: "Y", cargo: "Dev", periodo: "2020", texto: "Automatizei a conciliacao de transacoes" }]);
  await perfilLib.confirmarTodos();
  const l = await perfilLib.lacunas(["desenvolvimento"]);
  assert.ok(l.perguntas.length <= 3);
  assert.ok(l.perguntas.some((q) => q.id === "metrica" && /conciliacao/.test(q.trecho)), "resultado sem numero vira pergunta");
  assert.ok(l.perguntas.some((q) => q.id === "link" && q.campo === "github"), "dev sem github vira pergunta");
  await perfilLib.contatoLink("github", "github.com/larissa-exemplo");
  assert.ok(!(await perfilLib.lacunas(["desenvolvimento"])).perguntas.some((q) => q.id === "link"), "com github, nao pergunta");
  await assert.rejects(() => perfilLib.contatoLink("github", "isso nao e link"), /endereco/);
});

test("lista no navegador: link em toda vaga, texto de terceiros escapado, link perigoso barrado", async () => {
  const { htmlLista, linkSeguro, textoIdade } = await import("../scripts/lib/lista-html.mjs");
  const html = htmlLista({
    vagas: [
      { curto: "a", titulo: "Dev <img src=x onerror=alert(1)>", empresa: "Empresa & Cia", local: "Recife", score: 88, url: "https://exemplo.com/vaga?a=1&b=2", flags: [], publicadoEm: new Date(Date.now() - 70 * 86400000).toISOString().slice(0, 10), combinaCom: ["go"], rank: 1, avaliacao: { recomendacao: "aplicar", motivo: "Bom" } },
      { curto: "b", titulo: "Outra", empresa: "X", local: "", score: 70, url: "javascript:alert(1)", flags: [], publicadoEm: null, combinaCom: [] },
    ],
    lidas: 100, combinam: 2, comPerfil: true, data: "26/11/2026",
  });
  assert.ok(html.includes('href="https://exemplo.com/vaga?a=1&amp;b=2"'), "link da vaga presente e escapado");
  assert.ok(!html.includes("<img src=x"), "HTML de terceiros nao passa");
  assert.ok(!html.includes('href="javascript:'), "javascript: nunca vira link");
  assert.ok(html.includes("confira se ainda está aberta"), "vaga com mais de 60 dias avisa");
  assert.ok(html.includes("Combina nº 1"));
  assert.equal(linkSeguro("ftp://x.com"), null);
  assert.equal(textoIdade(null), "data não informada");
});

test("comparar: recomendada primeiro, 'pular' por ultimo, e as velhas sao avisadas", async () => {
  const fresco = mkdtempSync(join(tmpdir(), "kit-vagas-cmp-"));
  const r = spawnSync("node", ["--input-type=module", "-e", `
    process.env.KIT_VAGAS_HOME = ${JSON.stringify(fresco)};
    process.env.KIT_VAGAS_NAO_ABRIR = "1";
    const { salvarVagas, salvarConfig, carregarConfig } = await import(${JSON.stringify(join(RAIZ, "scripts/lib/casa.mjs"))});
    const { telaComparar } = await import(${JSON.stringify(join(RAIZ, "scripts/lib/telas.mjs"))});
    const velha = new Date(Date.now() - 70 * 86400000).toISOString().slice(0, 10);
    const nova = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
    const mk = (curto, empresa, score, rec, pub) => ({ id: curto, curto, empresa, titulo: "Dev " + empresa, local: "Brasil", score, faixa: "forte", ativa: true, status: "novo", url: "https://x.com/" + curto, flags: [], publicadoEm: pub, descricao: "", historico: [], avaliacao: { tem: ["Go"], falta: rec === "aplicar" ? [] : ["Kafka"], recomendacao: rec, motivo: "ok", em: "2026-11-26" } });
    await salvarVagas({ vagas: { a: mk("aaaaaaa", "A", 90, "pular", nova), b: mk("bbbbbbb", "B", 80, "aplicar", velha), c: mk("ccccccc", "C", 70, "aplicar com ressalva", nova) } });
    const t = await telaComparar(["aaaaaaa", "bbbbbbb", "ccccccc"]);
    console.log(JSON.stringify({ ordem: t.texto.split("\\n").filter((l) => /^\\d  /.test(l)).map((l) => l.slice(0, 6)), velha: t.texto.includes("⚠"), comecar: t.opcoes[0].curto, recomendada: t.opcoes[0].recomendada, n: t.opcoes.length }));
  `], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const o = JSON.parse(r.stdout);
  assert.deepEqual(o.ordem, ["1  B ·", "2  C ·", "3  A ·"].map((x) => x.slice(0, 6)));
  assert.equal(o.velha, true, "a mais velha e avisada");
  assert.equal(o.comecar, "ccccccc", "comeca pela recente que combina, nao pela de 70 dias");
  assert.equal(o.recomendada, true);
  assert.equal(o.n, 3);
});

test("gancho: nega tudo dentro do leitor de vaga e nao opina fora dele", () => {
  const roda = (entrada) => spawnSync("node", [join(RAIZ, "scripts/guard.mjs")], { input: JSON.stringify(entrada), encoding: "utf8" });
  const dentro = roda({ tool_name: "Bash", agent_type: "vagas:leitor-de-vaga" });
  assert.equal(JSON.parse(dentro.stdout).hookSpecificOutput.permissionDecision, "deny");
  assert.equal(JSON.parse(roda({ tool_name: "Read", agent_type: "leitor-de-vaga" }).stdout).hookSpecificOutput.permissionDecision, "deny");
  assert.equal(roda({ tool_name: "Bash" }).stdout, "", "sessao normal: sem opiniao");
  assert.equal(roda({ tool_name: "Bash", agent_type: "Explore" }).stdout, "", "outro subagente: sem opiniao");
  assert.equal(spawnSync("node", [join(RAIZ, "scripts/guard.mjs")], { input: "lixo", encoding: "utf8" }).status, 0, "entrada invalida nao quebra");
});

test("a skill e o plugin estao coerentes", () => {
  const skill = readFileSync(join(RAIZ, "skills/inicio/SKILL.md"), "utf8");
  assert.match(skill, /disable-model-invocation: true/);
  assert.match(skill, /allowed-tools: Bash\(node \$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/kit\.mjs \*\)/);
  const plugin = JSON.parse(readFileSync(join(RAIZ, ".claude-plugin/plugin.json"), "utf8"));
  assert.equal(plugin.name, "vagas");
  assert.ok(readdirSync(join(RAIZ, "agents")).includes("leitor-de-vaga.md"));
  // todo comando que a skill manda rodar existe no programa
  const kit = readFileSync(join(RAIZ, "scripts/kit.mjs"), "utf8");
  for (const m of skill.matchAll(/KIT ([a-z-]+)/g)) {
    assert.ok(kit.includes(`"${m[1]}"`) || kit.includes(`async ${m[1]}(`) || kit.includes(`${m[1]}() {`), `comando ausente no kit.mjs: ${m[1]}`);
  }
});
