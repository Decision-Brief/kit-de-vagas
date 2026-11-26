// Perfil = lista de fatos. Um fato so entra em currículo depois de a pessoa confirmar.
import { carregarPerfil, salvarPerfil, hoje } from "./casa.mjs";

export const TIPOS = ["resultado", "competencia", "formacao", "idioma"];

const limpo = (s, max = 400) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function novoId(perfil) {
  const n = perfil.fatos.reduce((m, f) => Math.max(m, Number(String(f.id).replace(/\D/g, "")) || 0), 0);
  return `f${n + 1}`;
}

export async function proporFatos(lista) {
  const perfil = await carregarPerfil();
  const novos = [];
  for (const bruto of Array.isArray(lista) ? lista : [lista]) {
    let tipo = TIPOS.includes(bruto.tipo) ? bruto.tipo : "resultado";
    let texto = limpo(bruto.texto);
    // "Formacao: ..." e "Idiomas: ..." guardados como outro tipo vao para a secao certa.
    const rotulo = texto.match(/^(forma[cç][aã]o|idiomas?)\s*:\s*(.+)$/i);
    if (rotulo) {
      tipo = /^idioma/i.test(rotulo[1]) ? "idioma" : "formacao";
      texto = rotulo[2];
    }
    if (!texto) throw new Error("Fato sem texto.");
    if (tipo === "resultado" && !limpo(bruto.empresa)) throw new Error(`O resultado "${texto.slice(0, 40)}..." precisa de empresa.`);
    const dup = perfil.fatos.find((f) => f.tipo === tipo && f.texto.toLowerCase() === texto.toLowerCase() && !f.rejeitado);
    if (dup) continue;
    const fato = {
      id: novoId(perfil),
      tipo,
      empresa: limpo(bruto.empresa, 120),
      cargo: limpo(bruto.cargo, 120),
      periodo: limpo(bruto.periodo, 60),
      texto,
      confirmado: false,
      rejeitado: false,
      origem: "curriculo",
      criadoEm: hoje(),
    };
    perfil.fatos.push(fato);
    novos.push(fato);
  }
  await salvarPerfil(perfil);
  return novos;
}

const achar = (perfil, id) => {
  const f = perfil.fatos.find((x) => x.id === id);
  if (!f) throw new Error(`Nao existe o fato "${id}".`);
  return f;
};

export async function confirmarFato(id) {
  const perfil = await carregarPerfil();
  const f = achar(perfil, id);
  f.confirmado = true;
  f.rejeitado = false;
  f.confirmadoEm = hoje();
  await salvarPerfil(perfil);
  return f;
}

// Corrigir = a pessoa disse outra coisa. O texto novo e o que ela afirmou, entao ja conta como confirmado.
export async function corrigirFato(id, texto) {
  const perfil = await carregarPerfil();
  const f = achar(perfil, id);
  const novo = limpo(texto);
  if (!novo) throw new Error("Texto corrigido vazio.");
  f.textoOriginal = f.textoOriginal ?? f.texto;
  f.texto = novo;
  f.confirmado = true;
  f.rejeitado = false;
  f.origem = "pessoa";
  f.confirmadoEm = hoje();
  await salvarPerfil(perfil);
  return f;
}

export async function rejeitarFato(id) {
  const perfil = await carregarPerfil();
  const f = achar(perfil, id);
  f.confirmado = false;
  f.rejeitado = true;
  await salvarPerfil(perfil);
  return f;
}

export async function proximoPendente() {
  const perfil = await carregarPerfil();
  const pendentes = perfil.fatos.filter((f) => !f.confirmado && !f.rejeitado);
  if (!pendentes.length) return { fim: true, confirmados: perfil.fatos.filter((f) => f.confirmado).length };
  const f = pendentes[0];
  const total = perfil.fatos.filter((x) => !x.rejeitado).length;
  const feitos = perfil.fatos.filter((x) => x.confirmado).length;
  return { fim: false, id: f.id, tipo: f.tipo, empresa: f.empresa, cargo: f.cargo, periodo: f.periodo, texto: f.texto, indice: feitos + 1, total };
}

export async function salvarContato(c) {
  const perfil = await carregarPerfil();
  perfil.contato = {
    nome: limpo(c.nome, 120), email: limpo(c.email, 120), telefone: limpo(c.telefone, 40),
    local: limpo(c.local, 120), linkedin: limpo(c.linkedin, 200), portfolio: limpo(c.portfolio, 200),
    confirmado: false,
  };
  await salvarPerfil(perfil);
  return perfil.contato;
}

export async function confirmarContato() {
  const perfil = await carregarPerfil();
  if (!perfil.contato?.nome || !perfil.contato?.email) throw new Error("Falta nome ou e-mail no contato.");
  perfil.contato.confirmado = true;
  await salvarPerfil(perfil);
  return perfil.contato;
}

export function resumoPerfil(perfil) {
  const ativos = perfil.fatos.filter((f) => !f.rejeitado);
  return {
    confirmados: ativos.filter((f) => f.confirmado).length,
    pendentes: ativos.filter((f) => !f.confirmado).length,
    contatoConfirmado: Boolean(perfil.contato?.confirmado),
  };
}

export const fatosConfirmados = (perfil) => perfil.fatos.filter((f) => f.confirmado && !f.rejeitado);
