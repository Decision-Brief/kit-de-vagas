import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { CASA, acharPorCurto, carregarPerfil, carregarVagas, salvarVagas, hoje } from "./casa.mjs";
import { fatosConfirmados } from "./perfil.mjs";
import { escHtml, numeros, slug } from "./texto.mjs";

const exec = promisify(execFile);

const ROTULOS = {
  pt: { resumo: "Resumo", exp: "Experiência", skills: "Competências", edu: "Formação", lang: "Idiomas" },
  en: { resumo: "Summary", exp: "Experience", skills: "Skills", edu: "Education", lang: "Languages" },
};

// Montar = validar. Nada entra se a pessoa nao confirmou, e numero inventado no resumo ou na carta barra o pacote.
export function montarPacote(perfil, spec) {
  const erros = [];
  const L = spec.idioma === "en" ? "en" : "pt";
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
  const resumo = String(spec.resumo ?? "").trim();
  const carta = String(spec.carta ?? "").trim();
  if (!titulo) erros.push('Falta "titulo".');
  if (!resumo) erros.push('Falta "resumo".');
  if (resumo.length > 600) erros.push('O "resumo" passa de 600 caracteres.');
  if (carta.length > 1500) erros.push('A "carta" passa de 1500 caracteres.');

  const permitidos = new Set(numeros(todos.map((f) => `${f.texto} ${f.periodo} ${f.empresa}`).join(" ")));
  for (const n of numeros(`${titulo} ${resumo} ${carta}`)) {
    if (!permitidos.has(n)) erros.push(`O numero "${n}" aparece no titulo, resumo ou carta e nao esta em nenhum fato confirmado.`);
  }

  const grupos = new Map();
  for (const f of escolhidos) {
    const k = `${f.empresa}|${f.cargo}|${f.periodo}`;
    if (!grupos.has(k)) grupos.set(k, { empresa: f.empresa, cargo: f.cargo, periodo: f.periodo, itens: [] });
    grupos.get(k).itens.push(f.texto);
  }
  const doTipo = (t) => todos.filter((f) => f.tipo === t).map((f) => f.texto);
  return { L, erros, contato, titulo, resumo, carta, experiencias: [...grupos.values()], competencias: doTipo("competencia"), formacao: doTipo("formacao"), idiomas: doTipo("idioma") };
}

const CSS = `
@page{size:A4;margin:14mm}
*{box-sizing:border-box}
body{font:10.5pt/1.45 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif;color:#1f2b2c;margin:0}
h1{font-size:20pt;margin:0}
.role{font-size:12pt;margin:2px 0 4px;color:#0d5e67}
.contact{font-size:9pt;color:#5d686b;margin:0}
.contact span+span::before{content:" · "}
h2{font-size:9pt;letter-spacing:.08em;text-transform:uppercase;color:#5d686b;border-bottom:1px solid #ded8ca;padding-bottom:2px;margin:14px 0 6px}
.job{margin:0 0 8px}.job h3{font-size:10.5pt;margin:0}.org{margin:0;color:#5d686b;font-size:9.5pt}
ul{margin:4px 0 0;padding-left:16px}li{margin:2px 0}
.chips span{display:inline-block;border:1px solid #ded8ca;border-radius:4px;padding:1px 6px;margin:0 4px 4px 0;font-size:9pt}
p{margin:4px 0}
`;

function html(m) {
  const T = ROTULOS[m.L];
  const c = m.contato;
  return `<!doctype html>
<html lang="${m.L === "en" ? "en" : "pt-BR"}"><head><meta charset="utf-8"><title>${escHtml(c.nome)} · ${escHtml(m.titulo)}</title><style>${CSS}</style></head><body>
<h1>${escHtml(c.nome)}</h1>
<p class="role">${escHtml(m.titulo)}</p>
<p class="contact">${[c.email, c.telefone, c.local, c.linkedin, c.portfolio].filter(Boolean).map((x) => `<span>${escHtml(x)}</span>`).join("")}</p>
<h2>${T.resumo}</h2><p>${escHtml(m.resumo)}</p>
<h2>${T.exp}</h2>
${m.experiencias.map((e) => `<section class="job"><h3>${escHtml(e.cargo || e.empresa)}</h3><p class="org">${escHtml(e.empresa)}${e.periodo ? " · " + escHtml(e.periodo) : ""}</p><ul>${e.itens.map((i) => `<li>${escHtml(i)}</li>`).join("")}</ul></section>`).join("\n")}
${m.competencias.length ? `<h2>${T.skills}</h2><div class="chips">${m.competencias.map((k) => `<span>${escHtml(k)}</span>`).join("")}</div>` : ""}
${m.formacao.length ? `<h2>${T.edu}</h2>${m.formacao.map((f) => `<p>${escHtml(f)}</p>`).join("")}` : ""}
${m.idiomas.length ? `<h2>${T.lang}</h2><p>${m.idiomas.map(escHtml).join(" · ")}</p>` : ""}
</body></html>
`;
}

function texto(m) {
  const T = ROTULOS[m.L];
  const c = m.contato;
  return [
    c.nome.toUpperCase(), m.titulo, [c.email, c.telefone, c.local, c.linkedin, c.portfolio].filter(Boolean).join(" | "), "",
    T.resumo.toUpperCase(), m.resumo, "", T.exp.toUpperCase(), "",
    ...m.experiencias.map((e) => `${e.cargo || e.empresa} | ${e.empresa}${e.periodo ? " | " + e.periodo : ""}\n${e.itens.map((i) => `- ${i}`).join("\n")}\n`),
    ...(m.competencias.length ? [T.skills.toUpperCase(), m.competencias.join(", "), ""] : []),
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
  await writeFile(join(pasta, `${base}.html`), html(m));
  await writeFile(join(pasta, `${base}.txt`), texto(m));
  if (m.carta) await writeFile(join(pasta, "carta.txt"), m.carta + "\n");

  let pdf = null;
  let paginas = null;
  const chrome = acharChrome();
  if (chrome) {
    pdf = join(pasta, `${base}.pdf`);
    try {
      await exec(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${pdf}`, `file://${join(pasta, `${base}.html`)}`], { timeout: 60000 });
      paginas = ((await readFile(pdf, "latin1")).match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    } catch {
      pdf = null;
    }
  }

  vaga.status = vaga.status === "novo" || vaga.status === "interessante" ? "preparado" : vaga.status;
  vaga.historico = [...(vaga.historico ?? []), { em: hoje(), status: "preparado", nota: "pacote gerado" }];
  await salvarVagas(estado);
  return { pasta, pdf, html: join(pasta, `${base}.html`), paginas, carta: m.carta ? join(pasta, "carta.txt") : null, semPdf: !pdf ? "Nao achei o Chrome. Abra o arquivo .html no navegador e use Imprimir, Salvar como PDF." : null };
}
