// Toda tela do kit nasce aqui, em codigo. A IA so apresenta o texto e faz a pergunta com as opcoes dadas.
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { CASA, carregarConfig, carregarPerfil, carregarVagas, diasEntre, hoje, idAleatorio, salvarConfig, acharPorCurto } from "./casa.mjs";
import { resumoPerfil } from "./perfil.mjs";
import { candidaturas, DIAS_PARADA } from "./vagas.mjs";

// Preencher quando o repositorio publico existir. Sem isso, o kit nao pede estrela.
export const REPO_URL = "https://github.com/Decision-Brief/kit-de-vagas";

const op = (id, rotulo, extra = {}) => ({ id, rotulo, ...extra });

export async function estado() {
  const config = await carregarConfig();
  const perfil = await carregarPerfil();
  const r = resumoPerfil(perfil);
  const cands = await candidaturas();
  const dias = config.ultimaVez ? diasEntre(config.ultimaVez) : null;

  if (config.feedback.optin === null) {
    return {
      tela: "boas-vindas",
      texto: [
        "Kit de Vagas · por Felipe Ribeiro, Decision Brief",
        "Acho vagas de tecnologia, avalio contra o seu perfil e monto o currículo sob medida.",
        "Faço: ler páginas públicas de vagas, dar nota e preparar PDF.",
        "Nunca faço: enviar candidatura, inventar experiência ou guardar seu currículo fora do seu computador.",
        "A Gupy vem ligada. Os termos dela restringem cópia automatizada de vagas; você pode desligar quando quiser.",
        `Seus arquivos ficam em ${CASA}.`,
        "",
        "Passo 1 de 4 · opinião",
        "Quer ajudar a melhorar o kit com respostas anônimas? Nunca envio seu currículo, as vagas nem seu nome.",
      ].join("\n"),
      opcoes: [
        op("feedback-sim", "Sim, 1 pergunta por vez", { recomendada: true, comando: "config-set feedback sim" }),
        op("feedback-nao", "Agora não", { comando: "config-set feedback nao" }),
      ],
    };
  }

  if (!config.areas.length) {
    return {
      tela: "preferencias",
      procedimento: "preferencias",
      texto: "Passo 2 de 4 · o que você procura\nVou fazer 3 perguntas rápidas: área, nível e onde.",
      opcoes: [],
    };
  }

  if (r.confirmados === 0 || r.pendentes > 0) {
    return {
      tela: "perfil",
      procedimento: r.pendentes > 0 ? "confirmar-fatos" : "montar-perfil",
      texto: r.pendentes > 0
        ? `Passo 3 de 4 · perfil\nFaltam ${r.pendentes} fatos para você confirmar.`
        : "Passo 3 de 4 · perfil\nCole o seu currículo ou diga o caminho do arquivo. Só guardo o que você confirmar.",
      opcoes: [],
    };
  }

  if (!r.contatoConfirmado) {
    return { tela: "contato", procedimento: "contato", texto: "Passo 4 de 4 · contato\nConfirme os dados que vão no topo do currículo.", opcoes: [] };
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

  return {
    tela: "menu",
    texto: `Kit de Vagas · Perfil pronto · ${r.confirmados} fatos · ${cands.total} candidatura${cands.total === 1 ? "" : "s"}\nO que você quer fazer agora?`,
    opcoes: [
      op("vagas", "Ver as vagas de hoje", { recomendada: true, procedimento: "vagas-de-hoje" }),
      op("colada", "Avaliar uma vaga que eu colei", { procedimento: "avaliar-colada" }),
      op("perfil", "Ver ou ajustar meu perfil", { procedimento: "ver-perfil" }),
      op("candidaturas", "Ver minhas candidaturas", { procedimento: "ver-candidaturas" }),
    ],
  };
}

const cortar = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export async function telaLista(n = 5) {
  const { listar } = await import("./vagas.mjs");
  const l = await listar(n);
  if (!l.vagas.length) {
    return {
      tela: "lista-vazia",
      texto: "Não achei vagas novas que combinem com o seu perfil agora.\nPosso ajustar o que você procura ou colar uma vaga para eu avaliar.",
      opcoes: [op("menu", "Voltar ao menu", { recomendada: true }), op("colada", "Avaliar uma vaga que eu colei", { procedimento: "avaliar-colada" })],
    };
  }
  // Quem a IA recomendou vem primeiro; "pular" desce. Dentro de cada grupo, a nota manda.
  const rank = (v) => (!v.avaliacao ? 1 : v.avaliacao.recomendacao === "aplicar" ? 0 : v.avaliacao.recomendacao === "aplicar com ressalva" ? 1 : 2);
  l.vagas.sort((a, b) => rank(a) - rank(b) || b.score - a.score);
  const melhor = l.vagas[0];
  const linhas = l.vagas.map((v, i) => {
    const rec = v.avaliacao ? ` [${v.avaliacao.recomendacao}]` : "";
    const dica = v.curto === melhor.curto ? "  ← a que eu começaria" : "";
    return `${i + 1}  ${String(v.score).padStart(3)}  ${cortar(`${v.titulo} · ${v.empresa}`, 56)}${rec}${dica}`;
  });
  return {
    tela: "lista",
    texto: [`Vagas de hoje · ${l.lidas} lidas, ${l.combinam} combinam com o seu perfil`, `As ${l.vagas.length} melhores, já lidas:`, "", ...linhas].join("\n"),
    melhor: melhor.curto,
    itens: l.vagas.map((v, i) => ({ n: i + 1, curto: v.curto })),
    opcoes: [
      op("ver-melhor", `Ver a vaga 1 por dentro`, { recomendada: true, procedimento: "tela-avaliacao", curto: melhor.curto }),
      op("pacote-melhor", "Gerar pacote da vaga 1", { procedimento: "gerar-pacote", curto: melhor.curto }),
      op("outra", "Escolher outra vaga da lista", { procedimento: "escolher-outra" }),
      op("menu", "Voltar ao menu"),
    ],
  };
}

export async function telaAvaliacao(curto) {
  const v = acharPorCurto(await carregarVagas(), curto);
  const a = v.avaliacao;
  if (!a) throw new Error("Essa vaga ainda nao foi avaliada. Rode o leitor antes.");
  const linhas = [
    `${v.titulo} · ${v.empresa}`,
    `Aderência ${v.score} de 100 · ${v.local || "local não informado"}`,
    a.tem.length ? `Você tem: ${a.tem.join("; ")}` : "Você tem: nada confirmado que a vaga peça",
    a.falta.length ? `Pede e você não tem confirmado: ${a.falta.join("; ")}` : "Pede e você não tem confirmado: nada importante",
    ...(v.flags?.length ? [`Atenção: ${v.flags.join("; ")}`] : []),
    `Recomendação: ${a.recomendacao}. ${a.motivo}`,
  ];
  const pular = a.recomendacao === "pular";
  return {
    tela: "avaliacao",
    texto: linhas.join("\n"),
    opcoes: [
      op("pacote", "Gerar o pacote desta vaga", { recomendada: !pular, procedimento: "gerar-pacote", curto: v.curto }),
      op("menu", "Voltar ao menu", { recomendada: pular }),
    ],
  };
}

export async function telaCandidaturas() {
  const c = await candidaturas();
  if (!c.total) return { tela: "candidaturas", texto: "Nenhuma candidatura ainda. Quando você enviar uma, volte e diga \"enviei\".", opcoes: [op("menu", "Voltar ao menu", { recomendada: true })] };
  const linhas = c.lista.slice(0, 8).map((x) => `${x.status.padEnd(12)} ${cortar(`${x.titulo} · ${x.empresa}`, 52)}${x.parada ? `  (${x.diasSemNovidade} dias sem novidade)` : ""}`);
  return {
    tela: "candidaturas",
    texto: [`Suas candidaturas · ${c.total}`, "", ...linhas, ...(c.total > 8 ? [`… e mais ${c.total - 8}`] : [])].join("\n"),
    opcoes: [
      ...(c.paradas.length ? [op("atualizar", `Atualizar as ${c.paradas.length} paradas`, { recomendada: true, procedimento: "atualizar-candidaturas" })] : []),
      op("menu", "Voltar ao menu", { recomendada: !c.paradas.length }),
    ],
  };
}

// ---------- feedback: so local por enquanto ----------
const PERGUNTAS = {
  facil: {
    pergunta: "Foi fácil chegar até aqui?",
    opcoes: [op("facil", "Fácil"), op("medio", "Mais ou menos"), op("dificil", "Difícil")],
  },
  fiel: {
    pergunta: "O currículo ficou fiel ao que você viveu?",
    opcoes: [op("sim", "Sim"), op("quase", "Quase"), op("nao", "Não")],
  },
  indicaria: {
    pergunta: "Você indicaria o kit a um colega?",
    opcoes: [op("com-certeza", "Com certeza (9 ou 10)"), op("talvez", "Talvez (7 ou 8)"), op("dificilmente", "Dificilmente (0 a 6)")],
  },
};

export async function feedbackProxima() {
  const config = await carregarConfig();
  if (config.feedback.optin !== true) return { pergunta: null };
  const feitas = config.feedback.perguntadas;
  const vagas = Object.values((await carregarVagas()).vagas);
  const devida = !feitas.facil && vagas.some((v) => v.avaliacao) ? "facil"
    : !feitas.fiel && vagas.some((v) => v.status === "enviado") ? "fiel"
    : !feitas.indicaria && config.criadoEm && diasEntre(config.criadoEm) >= 7 ? "indicaria"
    : null;
  if (!devida) return { pergunta: null };
  const p = PERGUNTAS[devida];
  return { pergunta: { id: devida, texto: p.pergunta, opcoes: p.opcoes, pular: "Pular" }, depois: devida === "fiel" && REPO_URL ? `Se ajudou, uma estrela no GitHub ajuda outras pessoas a achar o kit: ${REPO_URL}` : null };
}

export async function feedbackRegistrar(id, resposta) {
  if (!PERGUNTAS[id]) throw new Error(`Pergunta desconhecida: ${id}`);
  const config = await carregarConfig();
  if (config.feedback.optin !== true) throw new Error("A pessoa nao aceitou ajudar com opiniao.");
  config.feedback.perguntadas[id] = hoje();
  await salvarConfig(config);
  if (resposta && resposta !== "pular") {
    await mkdir(CASA, { recursive: true });
    await appendFile(join(CASA, "feedback.jsonl"), JSON.stringify({ pergunta: id, resposta, em: hoje(), kit: config.feedback.id }) + "\n");
  }
  return { ok: true, guardadoSo: "no seu computador" };
}

export async function definirFeedback(sim) {
  const config = await carregarConfig();
  config.feedback.optin = Boolean(sim);
  config.feedback.id = sim ? (config.feedback.id ?? idAleatorio()) : null;
  await salvarConfig(config);
  return config.feedback;
}
