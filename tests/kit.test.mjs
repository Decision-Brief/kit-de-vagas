import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// A pasta da pessoa e isolada por teste: nada toca o ~/kit-de-vagas real.
process.env.KIT_VAGAS_HOME = mkdtempSync(join(tmpdir(), "kit-vagas-"));
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

test("telas: a ordem da primeira vez ate o menu", async () => {
  process.env.KIT_VAGAS_HOME; // pasta ja isolada
  const fresco = mkdtempSync(join(tmpdir(), "kit-vagas-estado-"));
  const r = spawnSync("node", ["--input-type=module", "-e", `
    process.env.KIT_VAGAS_HOME = ${JSON.stringify(fresco)};
    const { estado } = await import(${JSON.stringify(join(RAIZ, "scripts/lib/telas.mjs"))});
    const { carregarConfig, salvarConfig } = await import(${JSON.stringify(join(RAIZ, "scripts/lib/casa.mjs"))});
    const p = await import(${JSON.stringify(join(RAIZ, "scripts/lib/perfil.mjs"))});
    const passos = [];
    passos.push((await estado()).tela);
    const c = await carregarConfig(); c.feedback.optin = false; await salvarConfig(c);
    passos.push((await estado()).tela);
    c.areas = ["desenvolvimento"]; await salvarConfig(c);
    passos.push((await estado()).tela);
    const [f] = await p.proporFatos([{ tipo: "resultado", empresa: "X", texto: "Fiz algo" }]);
    passos.push((await estado()).tela);
    await p.confirmarFato(f.id);
    passos.push((await estado()).tela);
    await p.salvarContato({ nome: "A", email: "a@b.c" }); await p.confirmarContato();
    const fim = await estado();
    passos.push(fim.tela, fim.opcoes.length, fim.opcoes[0].recomendada);
    console.log(JSON.stringify(passos));
  `], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), ["boas-vindas", "preferencias", "perfil", "perfil", "contato", "menu", 4, true]);
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
