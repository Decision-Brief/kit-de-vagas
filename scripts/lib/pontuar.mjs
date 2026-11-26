import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { semAcento } from "./texto.mjs";

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const AREAS = JSON.parse(readFileSync(join(RAIZ, "data/areas.json"), "utf8"));
const re = (s) => new RegExp(s, "i");
const diasDesde = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null);

const C = AREAS.comum;
const COMUM = {
  seniExcluir: re(C.senioridadeExcluir),
  niveis: Object.fromEntries(Object.entries(C.niveis).map(([k, v]) => [k, re(v)])),
  lider: re(C.lideranca),
  br: re(C.localBrasil),
  amplo: re(C.localAmplo),
  restrito: re(C.localRestrito),
  eua: re(C.descricaoExigeEUA),
  talentos: re(C.descricaoBancoDeTalentos),
};

export function faixaDe(score) {
  const l = C.limiares;
  if (score >= l.forte) return "forte";
  if (score >= l.bom) return "bom";
  if (score >= l.talvez) return "talvez";
  return "baixa";
}

// config: { areas: ["desenvolvimento"], nivel: "pleno", local: "brasil"|"global", palavrasChave: ["go", "kafka"] }
export function criarPontuador(config) {
  const areas = (config.areas?.length ? config.areas : Object.keys(AREAS.areas))
    .filter((a) => AREAS.areas[a])
    .map((a) => ({
      chave: a,
      excluir: re(AREAS.areas[a].excluir),
      alvos: AREAS.areas[a].titulosAlvo.map((t) => ({ ...t, re: re(t.re) })),
    }));
  const nivelRe = COMUM.niveis[config.nivel] ?? COMUM.niveis.pleno;
  const global = config.local === "global";
  const chaves = (config.palavrasChave ?? []).map((k) => semAcento(k).toLowerCase().trim()).filter(Boolean)
    .map((k) => new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i"));

  return function pontuar(vaga) {
    const titulo = semAcento(vaga.titulo).toLowerCase();
    const local = semAcento(vaga.local).toLowerCase();
    const desc = semAcento(vaga.descricao).toLowerCase();
    const razoes = [];
    const flags = [];

    if (COMUM.seniExcluir.test(titulo)) return { score: 0, faixa: "baixa", descartada: true, motivo: "nivel junior ou estagio", razoes, flags };

    let melhor = null;
    for (const a of areas) {
      if (a.excluir.test(titulo)) continue;
      for (const t of a.alvos) if (t.re.test(titulo) && (!melhor || t.pts > melhor.pts)) melhor = t;
    }
    if (!melhor) return { score: 0, faixa: "baixa", descartada: true, motivo: "titulo fora das suas areas", razoes, flags };

    let score = melhor.pts;
    razoes.push(`titulo: ${melhor.tema} (+${melhor.pts})`);

    if (nivelRe.test(titulo)) {
      score += 10;
      razoes.push("nivel compativel (+10)");
    }
    if (config.nivel !== "lead" && COMUM.lider.test(titulo)) flags.push("lideranca: confira se pede gestao de pessoas");

    const remoto = /remote|remoto/.test(local) || /remote|remoto/.test(titulo) || (vaga.remoto === true && !local);
    if (COMUM.br.test(local)) {
      score += 25;
      razoes.push("local: Brasil (+25)");
    } else if (COMUM.amplo.test(local)) {
      const pts = global ? 25 : 14;
      score += pts;
      razoes.push(`local: LATAM ou global (+${pts})`);
    } else if (remoto && !COMUM.restrito.test(local)) {
      const pts = global ? 14 : 4;
      score += pts;
      razoes.push(`remoto sem pais declarado (+${pts})`);
      flags.push("remoto: confirmar se aceita candidato do Brasil");
    } else if (remoto) {
      score -= global ? 15 : 30;
      razoes.push(`remoto restrito a outro pais (-${global ? 15 : 30})`);
      flags.push("remoto restrito a outro pais");
    } else {
      score -= 40;
      razoes.push("presencial fora do Brasil (-40)");
      flags.push("presencial fora do Brasil");
    }

    if (COMUM.eua.test(desc) && !COMUM.br.test(local)) {
      score -= 25;
      razoes.push("exige autorizacao de trabalho no pais (-25)");
      flags.push("exige autorizacao de trabalho ou nao patrocina visto");
    }

    const achadas = chaves.filter((r) => r.test(desc) || r.test(titulo)).length;
    const kw = Math.min(20, achadas * 3);
    if (kw) razoes.push(`${achadas} termos do seu perfil na vaga (+${kw})`);
    score += kw;

    const dias = diasDesde(vaga.publicadoEm);
    if (COMUM.talentos.test(desc.slice(0, 1500)) || COMUM.talentos.test(titulo)) {
      score -= 15;
      flags.push("banco de talentos ou cadastro reserva");
    }
    if (dias !== null && dias > C.diasParada) {
      score -= 25;
      flags.push(`publicada ha ${dias} dias, provavelmente parada`);
    } else if (dias !== null && dias > C.diasMuitoAntiga) {
      score -= 15;
      flags.push(`publicada ha ${dias} dias`);
    } else if (dias !== null && dias > C.diasAntiga) {
      score -= 8;
      flags.push(`publicada ha ${dias} dias`);
    }

    score = Math.max(0, Math.min(100, score));
    return { score, faixa: faixaDe(score), descartada: false, razoes, flags };
  };
}
