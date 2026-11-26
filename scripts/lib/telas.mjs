// Toda tela do kit nasce aqui, em codigo. A IA so apresenta o texto e faz a pergunta com as opcoes dadas.
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { CASA, acharPorCurto, carregarConfig, carregarPerfil, carregarVagas, diasEntre, hoje, idAleatorio, salvarConfig } from "./casa.mjs";
import { AREAS } from "./pontuar.mjs";
import { resumoPerfil } from "./perfil.mjs";
import { DIAS_PARADA, candidaturas, compararVagas, limparRanks, listar, marcarMostradas, vagasPorCurto } from "./vagas.mjs";
import { DIAS_AVISO, abrir, escreverCandidaturas, escreverLista, idadeDias, textoIdade } from "./lista-html.mjs";

export const REPO_URL = "https://github.com/Decision-Brief/kit-de-vagas";

const op = (id, rotulo, extra = {}) => ({ id, rotulo, ...extra });
const cortar = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const dataBR = (iso) => (iso ? String(iso).split("-").reverse().join("/") : new Date().toLocaleDateString("pt-BR"));
const rotuloAreas = (areas) => areas.map((a) => AREAS.areas[a]?.rotulo ?? a).join(", ");

export async function estado() {
  const config = await carregarConfig();
  const perfil = await carregarPerfil();
  const r = resumoPerfil(perfil);
  const cands = await candidaturas();
  const dias = config.ultimaVez ? diasEntre(config.ultimaVez) : null;

  if (!config.areas.length) {
    return {
      tela: "boas-vindas",
      texto: [
        "Kit de Vagas · por Felipe Ribeiro, Decision Brief",
        "Mostro vagas de tecnologia, com o link de cada uma.",
        `Nada é enviado por você. Seus arquivos ficam em ${CASA}.`,
        "A Gupy vem ligada. Os termos dela restringem cópia automatizada de vagas; você pode desligar quando quiser.",
        "",
        "Você já tem um currículo?",
      ].join("\n"),
      opcoes: [
        op("cv", "Sim, tenho um arquivo ou texto", { recomendada: true, procedimento: "cv-primeiro" }),
        op("sem-cv", "Ainda não, só quero ver vagas", { procedimento: "escolher-area" }),
      ],
    };
  }

  const primeiraDoDia = config.ultimaVez !== hoje();
  if (primeiraDoDia && (cands.paradas.length || (dias !== null && dias >= 14))) {
    const k = cands.paradas.length;
    return {
      tela: "voltando",
      texto: `Faz ${dias ?? 0} dias desde a última vez.${k ? ` Você tem ${k} candidatura${k > 1 ? "s" : ""} parada${k > 1 ? "s" : ""} há mais de ${DIAS_PARADA} dias.` : ""}`,
      opcoes: [
        ...(k ? [op("atualizar", `Atualizar as ${k}`, { recomendada: true, procedimento: "atualizar-candidaturas" })] : []),
        op("vagas", "Ir direto às vagas de hoje", { recomendada: !k, procedimento: "vagas-de-hoje" }),
      ],
    };
  }

  const temCv = r.confirmados + r.pendentes > 0;
  const acabouDeEnviar = config.ultimoEnvio && Date.now() - new Date(config.ultimoEnvio).getTime() < 30 * 60 * 1000;
  return {
    tela: "menu",
    texto: `Kit de Vagas · ${temCv ? "com currículo" : "sem currículo"} · ${cands.total} candidatura${cands.total === 1 ? "" : "s"}\nO que você quer fazer agora?`,
    opcoes: [
      op("vagas", "Ver as vagas de hoje", { recomendada: !acabouDeEnviar, procedimento: "vagas-de-hoje" }),
      op("colada", "Avaliar uma vaga que eu colei", { procedimento: "avaliar-colada" }),
      temCv ? op("perfil", "Ver ou ajustar meu perfil", { procedimento: "ver-perfil" }) : op("perfil", "Colar meu currículo", { procedimento: "cv-primeiro" }),
      op("candidaturas", "Ver minhas candidaturas", { recomendada: Boolean(acabouDeEnviar), procedimento: "ver-candidaturas" }),
    ],
  };
}

// Depois de ler o curriculo: o que o kit entendeu, para a pessoa confirmar com um clique.
export async function telaEntendi() {
  const config = await carregarConfig();
  const perfil = await carregarPerfil();
  const n = perfil.fatos.filter((f) => f.tipo === "resultado" && !f.rejeitado).length;
  const palavras = (config.palavrasChave ?? []).slice(0, 8);
  return {
    tela: "entendi",
    texto: [
      `Entendi: ${config.areas.length ? rotuloAreas(config.areas) : "área não definida"}, nível ${config.nivel}, ${config.local === "global" ? "Brasil e vagas remotas do mundo" : "Brasil"}.`,
      ...(palavras.length ? [`Tecnologias: ${palavras.join(", ")}.`] : []),
      `Achei ${n} resultado${n === 1 ? "" : "s"} no seu currículo. Só entram no PDF depois que você confirmar.`,
      "",
      "Procuro vagas assim?",
    ].join("\n"),
    opcoes: [
      op("sim", "Sim, procurar", { recomendada: true, procedimento: "vagas-de-hoje" }),
      op("ajustar", "Ajustar o que procuro", { procedimento: "preferencias" }),
    ],
  };
}

export async function abrirLista({ revisitar = false, abrirNavegador = true, curtos = null } = {}) {
  const perfil = await carregarPerfil();
  const r = resumoPerfil(perfil);
  const comPerfil = r.confirmados + r.pendentes > 0;
  let l;
  if (curtos) {
    const vagas = await vagasPorCurto(curtos);
    const est = await carregarVagas();
    l = { vagas, lidas: est.ultimaLeitura?.lidas ?? vagas.length, combinam: est.ultimaLista?.combinam ?? vagas.length };
  } else {
    await limparRanks(); // a numeracao da comparacao anterior nao vale para uma lista nova
    l = await listar(5, { revisitar });
  }
  if (!l.vagas.length) {
    const vistas = l.jaMostradas ?? 0;
    return {
      tela: "lista-vazia",
      texto: vistas
        ? `Você já viu todas as vagas que combinam com o que você procura agora (${vistas} já mostradas).\nPosso rever as já mostradas ou ler as páginas de vagas de novo, para achar as publicadas depois.`
        : "Não achei vagas que combinem com o que você procura agora.\nPosso ler as páginas de vagas de novo, ajustar o que você procura ou avaliar uma vaga que você colar.",
      opcoes: [
        ...(vistas ? [op("rever", "Rever as já mostradas", { procedimento: "rever-vagas" })] : []),
        op("buscar", "Buscar vagas de novo", { recomendada: true, procedimento: "buscar-de-novo" }),
        op("menu", "Voltar ao menu"),
      ],
    };
  }
  const cfg = await carregarConfig();
  const atualizadaEm = cfg.ultimaColeta ? new Date(cfg.ultimaColeta).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null;
  const arquivo = await escreverLista({ vagas: l.vagas, lidas: l.lidas, combinam: l.combinam, comPerfil, data: dataBR(), atualizadaEm });
  const aberta = abrirNavegador ? abrir(arquivo) : false;
  if (!curtos) await marcarMostradas(l.vagas.map((v) => v.curto), l.combinam);
  const linhas = l.vagas.map((v, i) => {
    const dias = idadeDias(v.publicadoEm);
    const velha = dias !== null && dias >= DIAS_AVISO ? `  ⚠ ${textoIdade(dias)}` : "";
    return `${i + 1}  ${String(v.score).padStart(3)}  ${cortar(`${v.titulo} · ${v.empresa}`, 52)}${velha}\n       ${v.url || "(sem link)"}`;
  });
  const curta = `${aberta ? "Abri a lista de vagas no seu navegador" : "Abra esta lista no navegador"}: ${arquivo}  •  ${l.lidas} vagas lidas, ${l.combinam} combinam ${comPerfil ? "com você" : "com o que você procura"}. Cada vaga tem o botão "Abrir vaga", que leva direto à página da empresa.  •  Você pode decidir sozinha, ou me pedir uma comparação. O que prefere?`;
  return {
    tela: "lista",
    arquivo,
    pergunta: aberta ? curta : [curta, ...l.vagas.map((v, i) => `${i + 1}. ${v.titulo} · ${v.empresa}: ${v.url || "sem link"}`)].join("  •  "),
    itens: l.vagas.map((v, i) => ({ n: i + 1, curto: v.curto, titulo: v.titulo, empresa: v.empresa })),
    texto: [
      aberta ? `Abri a lista no seu navegador: ${arquivo}` : `Abra esta lista no navegador: ${arquivo}`,
      `${l.lidas} vagas lidas, ${l.combinam} combinam ${comPerfil ? "com você" : "com o que você procura"}. Cada vaga tem o botão "Abrir vaga", que leva direto à página da empresa.`,
      "",
      ...linhas,
      "",
      "Você pode decidir sozinha, ou me pedir uma comparação. O que prefere?",
    ].join("\n"),
    opcoes: [
      op("comparar", comPerfil ? "Comparar as 5 com o meu currículo" : "Qual combina mais comigo? (preciso do seu currículo)", { recomendada: true, procedimento: "comparar" }),
      op("por-dentro", "Ver uma vaga por dentro", { procedimento: "escolher-vaga" }),
      op("so-olhar", "Só vou olhar no navegador", { procedimento: "so-olhar" }),
    ],
  };
}

export async function telaSoOlhar() {
  return {
    tela: "so-olhar",
    texto: `Tudo bem. A lista fica salva em ${join(CASA, "vagas-de-hoje.html")}, com o link de cada vaga.\nQuando quiser comparar ou montar um currículo, volte e digite /vagas:inicio.`,
    opcoes: [op("comparar", "Mudei de ideia: comparar", { procedimento: "comparar" }), op("menu", "Voltar ao menu", { recomendada: true })],
  };
}

export async function telaVaga(curto) {
  const estado = await carregarVagas();
  const perfil = await carregarPerfil();
  const v = acharPorCurto(estado, curto);
  const temPerfil = perfil.fatos.some((f) => !f.rejeitado);
  const dias = idadeDias(v.publicadoEm);
  const velha = dias !== null && dias >= DIAS_AVISO;
  const base = [
    `${v.titulo} · ${v.empresa}`,
    v.url || "(sem link)",
    ...(v.status !== "novo" ? [`Você já marcou esta como ${v.status}${v.enviadoEm ? ` em ${dataBR(v.enviadoEm)}` : ""}.`] : []),
    `${v.local || "local não informado"} · ${textoIdade(dias)}${velha ? ". Confira se ainda está aberta." : ""}`,
    ...(v.flags?.length ? [`Atenção: ${v.flags.join("; ")}`] : []),
  ];
  const a = v.avaliacao;
  if (a) {
    const pular = a.recomendacao === "pular";
    return {
      tela: "vaga",
      texto: [
        ...base,
        a.tem.length ? `Você tem: ${a.tem.join("; ")}` : "Você tem: nada do seu currículo que a vaga peça",
        a.falta.length ? `Pede e você não tem: ${a.falta.join("; ")}` : "Pede e você não tem: nada importante",
        `Recomendação: ${a.recomendacao}. ${a.motivo}`,
      ].join("\n"),
      opcoes: [
        op("pacote", "Montar currículo e carta para esta vaga", { recomendada: !pular, procedimento: "gerar-pacote", curto: v.curto }),
        op("ja", "Já me candidatei a esta", { procedimento: "ja-candidatei", curto: v.curto }),
        op("outra", "Ver outra vaga", { recomendada: pular, procedimento: "escolher-vaga" }),
      ],
    };
  }
  if (!temPerfil) {
    return {
      tela: "vaga",
      texto: [...base, "", "Quer saber o quanto ela combina com você?"].join("\n"),
      opcoes: [
        op("cv", "Colar meu currículo (4 min, uma vez só)", { recomendada: true, procedimento: "cv-primeiro", depois: { procedimento: "tela-vaga", curto: v.curto } }),
        op("outra", "Ver outra vaga", { procedimento: "escolher-vaga" }),
      ],
    };
  }
  return { tela: "vaga", precisaLeitura: true, curto: v.curto, texto: base.join("\n"), opcoes: [] };
}

export async function telaComparar(curtos) {
  if (!curtos.length) throw new Error("Passe os codigos das vagas da lista.");
  const res = await compararVagas(curtos);
  if (res.semLeitura.length) return { tela: "comparar", precisaLeitura: res.semLeitura, texto: "", opcoes: [] };
  const ordem = res.ordem;
  const velha = (v) => { const d = idadeDias(v.publicadoEm); return d !== null && d >= DIAS_AVISO; };
  const naoPular = ordem.filter((v) => v.avaliacao.recomendacao !== "pular");
  const comecar = naoPular.find((v) => !velha(v)) ?? naoPular[0] ?? ordem[0];
  const melhor = ordem[0];
  const linhas = ordem.map((v, i) => {
    const d = idadeDias(v.publicadoEm);
    return [
      `${i + 1}  ${v.empresa} · ${cortar(v.titulo, 44)}`,
      `   ${v.avaliacao.recomendacao} · falta: ${v.avaliacao.falta.length ? v.avaliacao.falta.slice(0, 2).join("; ") : "nada importante"}`,
      ...(velha(v) ? [`   ⚠ publicada ${textoIdade(d)}: confira se ainda está aberta`] : []),
    ].join("\n");
  });
  const frases = [];
  if (velha(melhor) && melhor.curto !== comecar.curto) {
    frases.push(`A que mais combina é a da ${melhor.empresa}, mas ela está publicada ${textoIdade(idadeDias(melhor.publicadoEm))}: confira se ainda está aberta.`);
    frases.push(`Entre as recentes, eu começaria pela da ${comecar.empresa}.`);
  } else {
    frases.push(`A que mais combina é a da ${melhor.empresa}. Eu começaria por ela.`);
  }
  // atualiza a pagina com o selo "Combina nº" (sem abrir outra aba)
  await abrirLista({ curtos: ordem.map((v) => v.curto), abrirNavegador: false });
  return {
    tela: "comparar",
    pergunta: `Comparei as ${ordem.length} com o seu currículo. ${frases.join(" ")} Recarregue a página do navegador: cada vaga mostra o selo, a recomendação e o motivo. O que prefere?`,
    texto: ["Qual combina mais com você", ...linhas, "", ...frases, "Recarregue a página do navegador para ver o selo de cada vaga."].join("\n"),
    opcoes: [
      op("comecar", `Ver a da ${comecar.empresa} por dentro`, { recomendada: true, procedimento: "tela-vaga", curto: comecar.curto }),
      ...(melhor.curto !== comecar.curto ? [op("melhor", `Ver a da ${melhor.empresa} por dentro`, { procedimento: "tela-vaga", curto: melhor.curto })] : []),
      op("lista", "Voltar à lista", { procedimento: "reabrir-lista" }),
    ],
  };
}

// Antes de montar o PDF: todos os fatos numa tela so. Corrigir um, se algum estiver errado.
export async function telaFatosLote() {
  const perfil = await carregarPerfil();
  const pend = perfil.fatos.filter((f) => !f.confirmado && !f.rejeitado);
  const res = pend.filter((f) => f.tipo === "resultado");
  const juntar = (tipo) => pend.filter((f) => f.tipo === tipo).map((f) => f.texto);
  const c = perfil.contato ?? {};
  const linhas = [
    ...res.slice(0, 10).map((f) => `${f.id}  ${f.empresa ? f.empresa + ": " : ""}${cortar(f.texto, 100)}`),
    ...(res.length > 10 ? [`… e mais ${res.length - 10} resultados`] : []),
    ...(juntar("competencia").length ? [`Competências: ${juntar("competencia").join("; ")}`] : []),
    ...(juntar("formacao").length ? [`Formação: ${juntar("formacao").join("; ")}`] : []),
    ...(juntar("idioma").length ? [`Idiomas: ${juntar("idioma").join("; ")}`] : []),
    ...(c.nome && !c.confirmado ? [`Contato: ${[c.nome, c.email, c.telefone, c.local].filter(Boolean).join(" · ")}`] : []),
  ];
  if (!linhas.length) return { tela: "fatos-lote", nenhum: true, texto: "", opcoes: [] };
  return {
    tela: "fatos-lote",
    texto: ["Estes fatos vão para o currículo. Estão certos?", "", ...linhas].join("\n"),
    opcoes: [
      op("todos", "Todos certos", { recomendada: true, comando: "fatos-confirmar-todos" }),
      op("corrigir", "Corrigir um", { procedimento: "corrigir-um" }),
      op("depois", "Mais tarde"),
    ],
  };
}

export async function telaCandidaturas() {
  const c = await candidaturas();
  if (!c.total) return { tela: "candidaturas", texto: "Nenhuma candidatura ainda. Quando você enviar uma, volte e diga \"enviei\".", opcoes: [op("menu", "Voltar ao menu", { recomendada: true }), op("sair", "Por hoje é só", { procedimento: "sair" })] };
  const arquivo = await escreverCandidaturas({ lista: c.lista, data: dataBR() });
  const aberta = abrir(arquivo);
  const cont = {};
  for (const x of c.lista) cont[x.status] = (cont[x.status] ?? 0) + 1;
  const resumo = Object.entries(cont).map(([st, n]) => `${n} ${st}`).join(", ");
  const linhas = c.lista.slice(0, 8).map((x) => `${x.status.padEnd(12)} ${cortar(`${x.titulo} · ${x.empresa}`, 52)}${x.parada ? `  (${x.diasSemNovidade} dias sem novidade)` : ""}`);
  const texto = [`Suas candidaturas · ${c.total}`, "", ...linhas, ...(c.total > 8 ? [`… e mais ${c.total - 8}`] : [])].join("\n");
  const curta = `${aberta ? "Abri suas candidaturas no navegador" : "Abra suas candidaturas no navegador"}: ${arquivo}  •  ${c.total} candidaturas (${resumo})${c.paradas.length ? `  •  ${c.paradas.length} parada${c.paradas.length > 1 ? "s" : ""} há mais de ${DIAS_PARADA} dias` : ""}. O que prefere?`;
  return {
    tela: "candidaturas",
    arquivo,
    pergunta: aberta ? curta : texto.split("\n").map((l) => l.trim()).filter(Boolean).join("  •  "),
    texto,
    opcoes: [
      ...(c.paradas.length ? [op("atualizar", `Atualizar as ${c.paradas.length} paradas`, { recomendada: true, procedimento: "atualizar-candidaturas" })] : []),
      op("menu", "Voltar ao menu", { recomendada: !c.paradas.length }),
      op("sair", "Por hoje é só", { procedimento: "sair" }),
    ],
  };
}

// ---------- opiniao: perguntas curtas, sempre com "Pular", guardadas so no computador da pessoa ----------
const PERGUNTAS = {
  facil: { pergunta: "Foi fácil chegar até aqui?", opcoes: [op("facil", "Fácil"), op("medio", "Mais ou menos"), op("dificil", "Difícil")] },
  fiel: { pergunta: "O currículo ficou fiel ao que você viveu?", opcoes: [op("sim", "Sim"), op("quase", "Quase"), op("nao", "Não")] },
  indicaria: { pergunta: "Você indicaria o kit a um colega?", opcoes: [op("com-certeza", "Com certeza"), op("talvez", "Talvez"), op("dificilmente", "Dificilmente")] },
};

export async function feedbackProxima() {
  const config = await carregarConfig();
  const feitas = config.feedback.perguntadas;
  const vagas = Object.values((await carregarVagas()).vagas);
  const devida = !feitas.fiel && vagas.some((v) => v.status === "enviado") ? "fiel"
    : !feitas.facil && vagas.some((v) => v.status === "preparado" || v.status === "enviado") ? "facil"
    : !feitas.indicaria && config.criadoEm && diasEntre(config.criadoEm) >= 7 ? "indicaria"
    : null;
  if (!devida) return { pergunta: null };
  const p = PERGUNTAS[devida];
  return {
    pergunta: { id: devida, texto: p.pergunta, opcoes: p.opcoes, pular: "Pular" },
    depois: devida === "fiel" ? `Se ajudou, uma estrela no GitHub ajuda outras pessoas a achar o kit: ${REPO_URL}` : null,
  };
}

export async function feedbackRegistrar(id, resposta) {
  if (!PERGUNTAS[id]) throw new Error(`Pergunta desconhecida: ${id}`);
  const config = await carregarConfig();
  config.feedback.perguntadas[id] = hoje();
  if (!config.feedback.id) config.feedback.id = idAleatorio();
  await salvarConfig(config);
  if (resposta && resposta !== "pular") {
    await mkdir(CASA, { recursive: true });
    await appendFile(join(CASA, "feedback.jsonl"), JSON.stringify({ pergunta: id, resposta, em: hoje(), kit: config.feedback.id }) + "\n");
  }
  return { ok: true, guardadoSo: "no seu computador" };
}
