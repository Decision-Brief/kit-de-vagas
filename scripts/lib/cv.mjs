import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { CASA, acharPorCurto, carregarPerfil, carregarVagas, salvarVagas, hoje } from "./casa.mjs";
import { fatosConfirmados } from "./perfil.mjs";
import { escHtml, numeros, semAcento, slug } from "./texto.mjs";
import { abrir } from "./lista-html.mjs";

const exec = promisify(execFile);
export const ESTILOS = ["classico", "moderno", "compacto"];

const ROTULOS = {
  pt: { resumo: "Resumo", exp: "Experiência", skills: "Competências", edu: "Formação", lang: "Idiomas", tec: "Tecnologias" },
  en: { resumo: "Summary", exp: "Experience", skills: "Skills", edu: "Education", lang: "Languages", tec: "Technologies" },
};

const chave = (s) => semAcento(s).toLowerCase().replace(/[^a-z0-9+#.]/g, "");
const itensDe = (texto) => String(texto).split(/[,;·]/).map((x) => x.trim()).filter(Boolean);

// Montar = validar. Nada entra se a pessoa nao confirmou, e numero inventado no titulo, resumo ou carta barra o pacote.
export function montarPacote(perfil, spec) {
  const erros = [];
  const L = spec.idioma === "en" ? "en" : "pt";
  const estilo = ESTILOS.includes(spec.estilo) ? spec.estilo : "moderno";
  const contato = perfil.contato ?? {};
  if (!contato.confirmado) erros.push("Os dados de contato ainda nao foram confirmados pela pessoa.");

  const todos = fatosConfirmados(perfil);
  const porId = new Map(perfil.fatos.map((f) => [f.id, f]));
  const escolhidos = [];
  for (const id of spec.fatos ?? []) {
    const f = porId.get(id);
    if (!f) erros.push(`O fato "${id}" nao existe.`);
    else if (!f.confirmado || f.rejeitado) erros.push(`O fato "${id}" nao foi confirmado pela pessoa.`);
    else if (f.tipo === "resultado") escolhidos.push(f);
  }
  if (!escolhidos.length) erros.push("Escolha ao menos 1 resultado confirmado em \"fatos\".");

  const titulo = String(spec.titulo ?? "").trim();
  const posicionamento = String(spec.posicionamento ?? "").trim();
  const resumo = String(spec.resumo ?? "").trim();
  const carta = String(spec.carta ?? "").trim();
  if (!titulo) erros.push('Falta "titulo".');
  if (!resumo) erros.push('Falta "resumo".');
  if (posicionamento.length > 120) erros.push('O "posicionamento" passa de 120 caracteres.');
  if (resumo.length > 600) erros.push('O "resumo" passa de 600 caracteres.');
  if (carta.length > 1500) erros.push('A "carta" passa de 1500 caracteres.');

  const permitidos = new Set(numeros(todos.map((f) => `${f.texto} ${f.periodo} ${f.empresa}`).join(" ")));
  for (const n of numeros(`${titulo} ${posicionamento} ${resumo} ${carta}`)) {
    if (!permitidos.has(n)) erros.push(`O numero "${n}" aparece no titulo, posicionamento, resumo ou carta e nao esta em nenhum fato confirmado.`);
  }

  // Competencias: so o que a pessoa confirmou; grupos e tecnologias por cargo so reorganizam o que ja existe.
  const competencias = todos.filter((f) => f.tipo === "competencia").flatMap((f) => itensDe(f.texto));
  const conhecidas = new Set(competencias.map(chave));
  const confere = (itens, onde) => {
    for (const it of itens ?? []) if (!conhecidas.has(chave(it))) erros.push(`"${it}" (${onde}) nao esta nas competencias confirmadas.`);
  };
  const grupos = spec.grupos && typeof spec.grupos === "object" ? Object.entries(spec.grupos).map(([nome, itens]) => [String(nome), Array.isArray(itens) ? itens.map(String) : []]) : [];
  for (const [nome, itens] of grupos) confere(itens, `grupo ${nome}`);

  const grupos_exp = new Map();
  for (const f of escolhidos) {
    const k = `${f.empresa}|${f.cargo}|${f.periodo}`;
    if (!grupos_exp.has(k)) grupos_exp.set(k, { empresa: f.empresa, cargo: f.cargo, periodo: f.periodo, itens: [] });
    grupos_exp.get(k).itens.push(f.texto);
  }
  const experiencias = [...grupos_exp.values()];
  const tecnologias = spec.tecnologias && typeof spec.tecnologias === "object" ? spec.tecnologias : {};
  for (const [emp, itens] of Object.entries(tecnologias)) {
    if (!experiencias.some((e) => e.empresa === emp)) erros.push(`"tecnologias" cita "${emp}", que nao esta nos fatos escolhidos.`);
    confere(Array.isArray(itens) ? itens : [], `tecnologias de ${emp}`);
  }
  for (const e of experiencias) e.tecnologias = Array.isArray(tecnologias[e.empresa]) ? tecnologias[e.empresa].map(String) : [];

  const doTipo = (t) => todos.filter((f) => f.tipo === t).map((f) => f.texto);
  return {
    L, estilo, erros, contato, titulo, posicionamento, resumo, carta, experiencias, grupos,
    competencias: grupos.length ? [] : competencias, formacao: doTipo("formacao"), idiomas: doTipo("idioma"),
  };
}

// Coluna unica, texto de verdade, fontes comuns, sem icones nem foto: o formato que os guias de triagem automatica
// e o checklist da Gupy recomendam. Os tres estilos so mudam tipografia, espaco e destaque.
const BASE = `
@page{size:A4;margin:14mm}
*{box-sizing:border-box}
body{color:#1f2b2c;margin:0}
p{margin:3px 0 0}ul{margin:4px 0 0;padding-left:16px}li{margin:2px 0}
.row{display:flex;justify-content:space-between;gap:12px;align-items:baseline}
`;
const CSS = {
  classico: `${BASE}
body{font:10.5pt/1.45 Arial,Helvetica,sans-serif}
h1{font-size:20pt;margin:0}.role{font-size:12pt;margin:2px 0 4px;color:#0d5e67}
.contact{font-size:9pt;color:#5d686b;margin:0}
h2{font-size:9pt;letter-spacing:.08em;text-transform:uppercase;color:#5d686b;border-bottom:1px solid #ded8ca;padding-bottom:2px;margin:14px 0 6px}
.job{margin:0 0 8px}.job h3{font-size:10.5pt;margin:0}.org{margin:0;color:#5d686b;font-size:9.5pt}.stack{color:#5d686b;font-size:9.5pt;margin-top:3px}`,
  moderno: `${BASE}
body{font:10.5pt/1.45 Arial,Helvetica,sans-serif}
h1{font:700 25pt/1.1 Georgia,"Times New Roman",serif;margin:0;letter-spacing:-.01em}
.role{font:12.5pt Georgia,serif;margin:3px 0 4px;color:#0d5e67}.contact{font-size:9pt;color:#444;margin:0}
h2{font:700 11.5pt Georgia,serif;color:#0d5e67;border-bottom:2px solid #0d5e67;display:inline-block;padding:0 28px 2px 0;margin:16px 0 6px}
.job{margin:0 0 9px}.job h3{font-size:10.5pt;margin:0;display:inline}.org{display:inline;color:#444}
.dt{color:#5d686b;font-size:9.5pt;white-space:nowrap}.stack{color:#5d686b;font-size:9.5pt;margin-top:3px}`,
  compacto: `${BASE}
body{font:9.5pt/1.35 Arial,Helvetica,sans-serif}
h1{font-size:16pt;margin:0}.role{font-size:10.5pt;margin:1px 0}.contact{font-size:8.5pt;color:#5d686b;margin:0}
h2{font-size:8.5pt;letter-spacing:.07em;text-transform:uppercase;border-bottom:1px solid #bbb;padding-bottom:1px;margin:9px 0 4px}
.job{margin:0 0 5px}.job h3{font-size:9.5pt;margin:0}.org{margin:0;color:#5d686b;font-size:9pt}.stack{color:#5d686b;font-size:9pt;margin-top:2px}`,
};

function html(m) {
  const T = ROTULOS[m.L];
  const c = m.contato;
  const links = [c.email, c.telefone, c.local, c.linkedin, c.github, c.portfolio].filter(Boolean);
  const role = [m.titulo, m.posicionamento].filter(Boolean).join(" · ");
  const vaiEmLinha = m.estilo === "moderno";
  const jobs = m.experiencias.map((e) => {
    const cabeca = vaiEmLinha
      ? `<div class="row"><span><h3>${escHtml(e.cargo || e.empresa)}</h3> <span class="org">· ${escHtml(e.empresa)}</span></span><span class="dt">${escHtml(e.periodo)}</span></div>`
      : `<h3>${escHtml(e.cargo || e.empresa)}</h3><p class="org">${escHtml(e.empresa)}${e.periodo ? " · " + escHtml(e.periodo) : ""}</p>`;
    return `<section class="job">${cabeca}<ul>${e.itens.map((i) => `<li>${escHtml(i)}</li>`).join("")}</ul>${e.tecnologias.length ? `<p class="stack">${T.tec}: ${e.tecnologias.map(escHtml).join(", ")}</p>` : ""}</section>`;
  }).join("\n");
  const skills = m.grupos.length
    ? m.grupos.map(([nome, itens]) => `<p><b>${escHtml(nome)}:</b> ${itens.map(escHtml).join(", ")}</p>`).join("")
    : m.competencias.length ? `<p>${m.competencias.map(escHtml).join(", ")}</p>` : "";
  return `<!doctype html>
<html lang="${m.L === "en" ? "en" : "pt-BR"}"><head><meta charset="utf-8"><title>${escHtml(c.nome)} · ${escHtml(m.titulo)}</title><style>${CSS[m.estilo]}</style></head><body>
<h1>${escHtml(c.nome)}</h1>
<p class="role">${escHtml(role)}</p>
<p class="contact">${links.map(escHtml).join(" · ")}</p>
<h2>${T.resumo}</h2><p>${escHtml(m.resumo)}</p>
<h2>${T.exp}</h2>
${jobs}
${skills ? `<h2>${T.skills}</h2>${skills}` : ""}
${m.formacao.length ? `<h2>${T.edu}</h2>${m.formacao.map((f) => `<p>${escHtml(f)}</p>`).join("")}` : ""}
${m.idiomas.length ? `<h2>${T.lang}</h2><p>${m.idiomas.map(escHtml).join(" · ")}</p>` : ""}
</body></html>
`;
}

function texto(m) {
  const T = ROTULOS[m.L];
  const c = m.contato;
  return [
    c.nome.toUpperCase(), [m.titulo, m.posicionamento].filter(Boolean).join(" · "),
    [c.email, c.telefone, c.local, c.linkedin, c.github, c.portfolio].filter(Boolean).join(" | "), "",
    T.resumo.toUpperCase(), m.resumo, "", T.exp.toUpperCase(), "",
    ...m.experiencias.map((e) => `${e.cargo || e.empresa} | ${e.empresa}${e.periodo ? " | " + e.periodo : ""}\n${e.itens.map((i) => `- ${i}`).join("\n")}${e.tecnologias.length ? `\n${T.tec}: ${e.tecnologias.join(", ")}` : ""}\n`),
    ...(m.grupos.length ? [T.skills.toUpperCase(), ...m.grupos.map(([n, i]) => `${n}: ${i.join(", ")}`), ""] : m.competencias.length ? [T.skills.toUpperCase(), m.competencias.join(", "), ""] : []),
    ...(m.formacao.length ? [T.edu.toUpperCase(), ...m.formacao, ""] : []),
    ...(m.idiomas.length ? [T.lang.toUpperCase(), m.idiomas.join(", "), ""] : []),
  ].join("\n");
}

export function acharChrome() {
  const candidatos = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  return candidatos.find((p) => existsSync(p)) ?? null;
}

async function paraPdf(chrome, arqHtml, arqPdf) {
  try {
    await exec(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${arqPdf}`, `file://${arqHtml}`], { timeout: 60000 });
    return ((await readFile(arqPdf, "latin1")).match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  } catch {
    return null;
  }
}

// Gera os tres estilos, para a pessoa comparar. O escolhido (padrao: moderno) abre sozinho.
export async function gerarPacote(curto, spec) {
  const perfil = await carregarPerfil();
  const estado = await carregarVagas();
  const vaga = acharPorCurto(estado, curto);
  const m = montarPacote(perfil, spec);
  if (m.erros.length) {
    const e = new Error(`Pacote nao gerado:\n- ${m.erros.join("\n- ")}`);
    e.codigo = "PACOTE_INVALIDO";
    throw e;
  }
  const pasta = join(CASA, "pacotes", `${vaga.curto}_${slug(vaga.empresa)}`);
  await mkdir(pasta, { recursive: true });
  const base = `${slug(m.contato.nome)}_cv_${slug(vaga.empresa)}`;
  await writeFile(join(pasta, `${base}.txt`), texto(m));
  if (m.carta) await writeFile(join(pasta, "carta.txt"), m.carta + "\n");

  const chrome = acharChrome();
  const arquivos = {};
  for (const estilo of ESTILOS) {
    const arqHtml = join(pasta, `${base}_${estilo}.html`);
    await writeFile(arqHtml, html({ ...m, estilo }));
    let pdf = null;
    let paginas = null;
    if (chrome) {
      pdf = join(pasta, `${base}_${estilo}.pdf`);
      paginas = await paraPdf(chrome, arqHtml, pdf);
      if (paginas === null) pdf = null;
    }
    arquivos[estilo] = { html: arqHtml, pdf, paginas };
  }
  const principal = arquivos[m.estilo];
  const aberto = abrir(principal.pdf ?? principal.html);

  vaga.status = vaga.status === "novo" || vaga.status === "interessante" ? "preparado" : vaga.status;
  vaga.historico = [...(vaga.historico ?? []), { em: hoje(), status: "preparado", nota: "pacote gerado" }];
  await salvarVagas(estado);
  return {
    pasta, estiloPrincipal: m.estilo, arquivos, aberto, carta: m.carta ? join(pasta, "carta.txt") : null,
    avisoPaginas: principal.paginas && principal.paginas > 2 ? "O curriculo passou de 2 paginas: corte alguns resultados." : null,
    semPdf: !chrome ? "Nao achei o Chrome. Abra o arquivo .html no navegador e use Imprimir, Salvar como PDF." : null,
  };
}
