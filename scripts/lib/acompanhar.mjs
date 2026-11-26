// Acompanhamento: o que o kit pergunta quando a pessoa volta, a orientacao do perfil da Gupy e a revisao mensal.
// Regra de sempre: o kit so pergunta e guarda a resposta. Nada e enviado nem preenchido por ela.
import { acharPorCurto, carregarConfig, carregarPerfil, carregarVagas, diasEntre, hoje, salvarConfig, salvarVagas } from "./casa.mjs";
import { fatosConfirmados } from "./perfil.mjs";
import { numeros, semAcento } from "./texto.mjs";

const op = (id, rotulo, extra = {}) => ({ id, rotulo, ...extra });
export const DIAS_REVISAO = 30;
export const DIAS_MOSTRADAS_MAX = 14;

export async function acompanhamento() {
  const c = await carregarConfig();
  return { gupyPerfil: null, ultimaRevisao: null, contratada: false, parar: false, ...(c.acompanhamento ?? {}) };
}
async function gravarAcomp(mudanca) {
  const c = await carregarConfig();
  c.acompanhamento = { ...(await acompanhamento()), ...mudanca };
  await salvarConfig(c);
  return c.acompanhamento;
}

// ---------- 1 · vagas mostradas e nunca marcadas ----------
export async function mostradasPendentes() {
  const estado = await carregarVagas();
  return Object.values(estado.vagas)
    .filter((v) => v.mostradaEm && v.status === "novo" && diasEntre(v.mostradaEm) >= 1 && diasEntre(v.mostradaEm) <= DIAS_MOSTRADAS_MAX)
    .sort((a, b) => a.curto.localeCompare(b.curto));
}

export async function telaMostradas() {
  const p = await mostradasPendentes();
  if (!p.length) return null;
  const d = Math.max(...p.map((v) => diasEntre(v.mostradaEm)));
  return {
    tela: "mostradas",
    texto: `Faz ${d} dia${d > 1 ? "s" : ""} que mostrei ${p.length} vaga${p.length > 1 ? "s" : ""}. Você se candidatou a alguma delas?`,
    opcoes: [
      op("sim", "Sim, a alguma", { recomendada: true, procedimento: "marcar-mostradas" }),
      op("nao", "Não, quero ver outras vagas", { procedimento: "nenhuma-mostrada" }),
      op("depois", "Me pergunte depois", { procedimento: "menu-depois" }),
    ],
  };
}

export async function telaMostradasQuais() {
  const p = await mostradasPendentes();
  if (!p.length) return { tela: "mostradas-quais", texto: "Não há vagas para marcar.", opcoes: [op("menu", "Voltar ao menu", { recomendada: true }), op("sair", "Por hoje é só", { procedimento: "sair" })] };
  const itens = p.map((v, i) => ({ n: i + 1, curto: v.curto, empresa: v.empresa, titulo: v.titulo }));
  const linhas = itens.map((x) => `${x.n} · ${x.titulo} · ${x.empresa}`);
  return {
    tela: "mostradas-quais",
    itens,
    texto: ["Quais você enviou? Escolha uma opção ou digite os números em Outro (por exemplo: 1 e 3).", ...linhas].join("\n"),
    opcoes: [op("todas", "Todas", { recomendada: false, procedimento: "marcar-todas-mostradas" }), op("nenhuma", "Nenhuma, me enganei", { procedimento: "menu-depois" })],
  };
}

export async function marcarVarias(status, curtos, nota = "") {
  const estado = await carregarVagas();
  const feitas = [];
  for (const curto of curtos) {
    const v = acharPorCurto(estado, curto);
    v.status = status;
    v.historico = [...(v.historico ?? []), { em: hoje(), status, nota }];
    if (status === "enviado" && !v.enviadoEm) v.enviadoEm = hoje();
    feitas.push({ curto: v.curto, empresa: v.empresa, titulo: v.titulo });
  }
  await salvarVagas(estado);
  if (status === "enviado" && feitas.length) {
    const c = await carregarConfig();
    c.ultimoEnvio = new Date().toISOString();
    await salvarConfig(c);
  }
  return { marcadas: feitas.length, status, vagas: feitas };
}

// ---------- 2 · perfil da Gupy ----------
export async function gupyPerfilResponder(resposta) {
  if (!["atualizado", "orientado"].includes(resposta)) throw new Error('Use "atualizado" ou "orientado".');
  await gravarAcomp({ gupyPerfil: resposta, gupyEm: hoje() });
  return { ok: true, gupyPerfil: resposta };
}

export async function telaGupyPerfil(v) {
  return {
    tela: "gupy-perfil",
    curto: v.curto,
    texto: `${v.titulo} · ${v.empresa}\nEsta vaga é na Gupy. Ela usa o perfil que você preenche lá, não um PDF. Seu perfil na Gupy já está atualizado?`,
    opcoes: [
      op("atualizar", "Não, quero atualizar agora", { recomendada: true, procedimento: "orientar-gupy", curto: v.curto }),
      op("ja", "Já está atualizado", { comando: "gupy-perfil atualizado", depois: { procedimento: "tela-vaga", curto: v.curto } }),
      op("ajuda", "Não sei, me ajude a conferir", { procedimento: "orientar-gupy", curto: v.curto }),
    ],
  };
}

const MESES = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
const NOME_MES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export function lerPeriodo(periodo) {
  const s = semAcento(String(periodo ?? "")).toLowerCase();
  const atual = /(atual|presente|hoje|atualmente|present)/.test(s);
  const pontos = [...s.matchAll(/([a-z]{3})[a-z]*[\s./-]*(\d{4})/g)].map((m) => ({ mes: MESES[m[1]] ?? null, ano: Number(m[2]) })).filter((p) => p.mes);
  const f = (p) => (p ? `${NOME_MES[p.mes]} / ${p.ano}` : null);
  if (!pontos.length) return { atual, inicio: null, fim: null };
  return { atual, inicio: f(pontos[0]), fim: atual ? null : f(pontos[1] ?? null), _fimOrdem: pontos[1] ? pontos[1].ano * 12 + pontos[1].mes : atual ? 9e9 : 0 };
}

export async function blocosGupy(curto = null) {
  const perfil = await carregarPerfil();
  const fatos = fatosConfirmados(perfil);
  const resultados = fatos.filter((f) => f.tipo === "resultado" && f.empresa);
  if (!resultados.length) throw new Error("Ainda nao ha resultados confirmados. Confirme os fatos do curriculo primeiro.");

  const grupos = new Map();
  for (const f of resultados) {
    const k = `${f.empresa}|${f.cargo}|${f.periodo}`;
    if (!grupos.has(k)) grupos.set(k, { empresa: f.empresa, cargo: f.cargo ?? "", periodo: f.periodo ?? "", itens: [] });
    grupos.get(k).itens.push(f.texto);
  }
  const exps = [...grupos.values()].map((g) => ({ ...g, p: lerPeriodo(g.periodo) })).sort((a, b) => (b.p._fimOrdem ?? 0) - (a.p._fimOrdem ?? 0));

  const blocos = exps.map((g, i) => ({
    id: `exp-${i + 1}`,
    titulo: `Experiência: ${g.empresa}`,
    texto: [
      `Empresa: ${g.empresa}`,
      `Cargo: ${g.cargo || "(confirme o cargo)"}`,
      `Meu emprego atual: ${g.p.atual ? "marcado" : "desmarcado"}`,
      `Início: ${g.p.inicio ?? `(confira: ${g.periodo})`}`,
      ...(g.p.atual ? [] : [`Fim: ${g.p.fim ?? `(confira: ${g.periodo})`}`]),
      "Descrição das atividades:",
      ...g.itens.map((t) => `- ${t}`),
    ].join("\n"),
  }));

  // Habilidades: so as confirmadas, as que a vaga cita primeiro, ate 30 (limite da Gupy).
  const competencias = [...new Set(fatos.filter((f) => f.tipo === "competencia").flatMap((f) => String(f.texto).split(/[,;·]/).map((x) => x.trim()).filter(Boolean)))];
  let alvo = "";
  if (curto) {
    const v = acharPorCurto(await carregarVagas(), curto);
    alvo = semAcento(`${v.titulo} ${v.descricao ?? ""}`).toLowerCase();
  }
  const cita = (h) => alvo && alvo.includes(semAcento(h).toLowerCase());
  const habilidades = [...competencias.filter(cita), ...competencias.filter((h) => !cita(h))].slice(0, 30);
  if (habilidades.length) {
    blocos.push({
      id: "habilidades",
      titulo: `Habilidades (${habilidades.length} de até 30)`,
      texto: ["Digite uma de cada vez, escolha a sugestão da lista e clique em Adicionar. No fim, clique em Salvar.", ...habilidades.map((h, i) => `${i + 1}. ${h}`)].join("\n"),
    });
  }

  const formacao = fatos.filter((f) => f.tipo === "formacao").map((f) => f.texto);
  const idiomas = fatos.filter((f) => f.tipo === "idioma").map((f) => f.texto);
  if (formacao.length || idiomas.length) {
    blocos.push({ id: "formacao", titulo: "Formação e idiomas", texto: [...(formacao.length ? ["Formação:", ...formacao.map((t) => `- ${t}`)] : []), ...(idiomas.length ? ["Idiomas:", ...idiomas.map((t) => `- ${t}`)] : [])].join("\n") });
  }
  return blocos;
}

export async function orientarGupy(curto = null) {
  const blocos = await blocosGupy(curto);
  await gravarAcomp({ gupyPerfil: "orientado", gupyEm: hoje() });
  return { total: blocos.length, blocos: blocos.map((b) => ({ id: b.id, titulo: b.titulo })), apresente: { limite: 600, regra: "Escreva 3 linhas para esta vaga, so com fatos confirmados, e valide com texto-validar." } };
}

export async function telaGupyBloco(i, curto = null) {
  const blocos = await blocosGupy(curto);
  const n = Number(i);
  if (!Number.isInteger(n) || n < 1 || n > blocos.length) throw new Error(`Bloco ${i} nao existe (1 a ${blocos.length}).`);
  const b = blocos[n - 1];
  const ultimo = n === blocos.length;
  return {
    tela: "gupy-bloco",
    n, total: blocos.length, bloco: b.texto, curto,
    texto: `Bloco ${n} de ${blocos.length}: ${b.titulo}. Copie o texto e cole no campo da Gupy.`,
    opcoes: [
      op("copiei", ultimo ? "Copiei, vamos ao Apresente-se" : "Copiei, próximo bloco", { recomendada: true, procedimento: "gupy-proximo", proximo: ultimo ? "apresente" : n + 1 }),
      op("corrigir", "Corrigir um dado", { procedimento: "corrigir-um" }),
      op("sair", "Por hoje é só", { procedimento: "sair" }),
    ],
  };
}

export async function validarTexto(texto, limite = 600) {
  const t = String(texto?.texto ?? texto ?? "").trim();
  const perfil = await carregarPerfil();
  const fatos = fatosConfirmados(perfil);
  const permitidos = new Set(numeros(fatos.map((f) => `${f.texto} ${f.periodo ?? ""} ${f.empresa ?? ""}`).join(" ")));
  const erros = [];
  if (!t) erros.push("Texto vazio.");
  if (t.length > limite) erros.push(`O texto passa de ${limite} caracteres.`);
  for (const n of numeros(t)) if (!permitidos.has(n)) erros.push(`O numero "${n}" nao esta em nenhum fato confirmado.`);
  return { ok: !erros.length, erros, caracteres: t.length };
}

export async function telaGupyFim(curto) {
  const v = acharPorCurto(await carregarVagas(), curto);
  return {
    tela: "gupy-fim",
    curto: v.curto,
    texto: `Perfil pronto. Agora candidate-se a ${v.titulo} · ${v.empresa} na Gupy e responda as perguntas da empresa. Só você pode confirmar dados como RG, parentesco na empresa e pretensão.`,
    opcoes: [
      op("enviei", "Já enviei a candidatura", { recomendada: true, procedimento: "enviei", curto: v.curto }),
      op("depois", "Vou enviar depois", { procedimento: "menu-depois" }),
    ],
  };
}

// ---------- 3 · revisao a cada 30 dias ----------
export async function telaRevisao(config, temCv) {
  const a = await acompanhamento();
  if (a.contratada || a.parar || !temCv) return null;
  const base = a.ultimaRevisao ?? config.criadoEm;
  if (!base || diasEntre(base) < DIAS_REVISAO) return null;
  const meses = Math.max(1, Math.floor(diasEntre(base) / 30));
  return {
    tela: "revisao",
    texto: `Faz ${meses === 1 ? "1 mês" : `${meses} meses`}. Seu currículo e seu portfólio ainda estão atualizados? Cinco minutos aqui podem mudar uma resposta.`,
    opcoes: [
      op("revisar", "Revisar agora", { recomendada: true, procedimento: "revisao-mensal" }),
      op("ok", "Está tudo atualizado", { comando: "acompanhar revisao-feita", procedimento: "menu-depois" }),
      op("contratada", "Fui contratada, parar de lembrar", { comando: "acompanhar contratada", procedimento: "menu-depois" }),
    ],
  };
}

export async function acompanhar(acao) {
  if (acao === "revisao-feita") { await gravarAcomp({ ultimaRevisao: hoje() }); return { ok: true, proximaEm: `${DIAS_REVISAO} dias` }; }
  if (acao === "contratada") { await gravarAcomp({ contratada: true, ultimaRevisao: hoje() }); return { ok: true, lembretes: "desligados" }; }
  if (acao === "parar") { await gravarAcomp({ parar: true }); return { ok: true, lembretes: "desligados" }; }
  throw new Error('Use: revisao-feita, contratada ou parar.');
}
