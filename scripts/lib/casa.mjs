import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

// Tudo o que e da pessoa fica numa pasta so, visivel, no computador dela.
export const CASA = process.env.KIT_VAGAS_HOME || join(homedir(), "kit-de-vagas");
export const hoje = () => new Date().toISOString().slice(0, 10);
export const diasEntre = (isoA, isoB = hoje()) => Math.floor((new Date(isoB) - new Date(isoA)) / 86400000);

export async function lerJson(nome, padrao) {
  try {
    return JSON.parse(await readFile(join(CASA, nome), "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return structuredClone(padrao);
    throw new Error(`Nao consegui ler ${nome}: ${e.message}`);
  }
}

export async function salvarJson(nome, dado) {
  const arq = join(CASA, nome);
  await mkdir(dirname(arq), { recursive: true });
  const tmp = `${arq}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(dado, null, 1) + "\n");
  await rename(tmp, arq);
}

export const CONFIG_PADRAO = {
  versao: 1,
  criadoEm: null,
  ultimaVez: null,
  areas: [],
  nivel: "pleno",
  local: "brasil",
  palavrasChave: [],
  fontes: { ats: true, remotas: true, gupy: true },
  ultimaColeta: null,
  feedback: { optin: null, id: null, perguntadas: {} },
  acompanhamento: { gupyPerfil: null, ultimaRevisao: null, contratada: false, parar: false },
};

export async function carregarConfig() {
  const c = await lerJson("config.json", CONFIG_PADRAO);
  return { ...structuredClone(CONFIG_PADRAO), ...c, fontes: { ...CONFIG_PADRAO.fontes, ...c.fontes }, feedback: { ...CONFIG_PADRAO.feedback, ...c.feedback }, acompanhamento: { ...CONFIG_PADRAO.acompanhamento, ...c.acompanhamento } };
}

export async function salvarConfig(c) {
  if (!c.criadoEm) c.criadoEm = hoje();
  await salvarJson("config.json", c);
}

export const PERFIL_PADRAO = { contato: { confirmado: false }, fatos: [] };
export const carregarPerfil = () => lerJson("perfil.json", PERFIL_PADRAO);
export const salvarPerfil = (p) => salvarJson("perfil.json", p);

export const VAGAS_PADRAO = { atualizadoEm: null, vagas: {} };
export const carregarVagas = () => lerJson("vagas.json", VAGAS_PADRAO);
export const salvarVagas = (v) => salvarJson("vagas.json", { ...v, atualizadoEm: new Date().toISOString() });

export const idAleatorio = () => randomBytes(8).toString("hex");

export function acharPorCurto(estado, curto) {
  const lista = Object.values(estado.vagas).filter((v) => v.curto.startsWith(String(curto ?? "").toLowerCase()));
  if (lista.length === 0) throw new Error(`Nenhuma vaga com o codigo "${curto}".`);
  if (lista.length > 1) throw new Error(`O codigo "${curto}" serve para ${lista.length} vagas. Use mais letras.`);
  return lista[0];
}
