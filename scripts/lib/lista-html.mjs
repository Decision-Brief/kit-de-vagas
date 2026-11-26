// A lista de vagas e uma pagina HTML gerada pelo programa e aberta no navegador.
// Assim o link de cada vaga aparece sempre, sem depender de a IA repetir o texto.
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CASA } from "./casa.mjs";
import { escHtml } from "./texto.mjs";

export const DIAS_AVISO = 60;

export function idadeDias(iso) {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return Number.isFinite(d) && d >= 0 ? d : null;
}

export const textoIdade = (dias) => (dias === null ? "data não informada" : dias === 0 ? "hoje" : dias === 1 ? "há 1 dia" : `há ${dias} dias`);

// So links http(s). Texto de vaga vem de terceiros: nunca vira "javascript:" nem HTML solto.
export function linkSeguro(url) {
  try {
    const u = new URL(String(url ?? ""));
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

const CSS = `
:root{--paper:#fffdf8;--sand:#f5f0e7;--ink:#1f2b2c;--soft:#5d686b;--teal:#0d5e67;--deep:#073f46;--wash:#e5f1ef;--amber:#8a5a00;--amberw:#f6ecd2;--line:#ded8ca}
@media (prefers-color-scheme:dark){:root{--paper:#172224;--sand:#101a1c;--ink:#ece8dd;--soft:#a3aeb0;--teal:#5fb3bc;--deep:#8ed0d7;--wash:#1c3a3e;--amber:#e3b45a;--amberw:#3a301a;--line:#2c3b3e;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--sand);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;padding:32px 16px 56px}
main{max-width:760px;margin:0 auto}
h1{font:600 28px/1.2 Georgia,"Times New Roman",serif;margin:0}
.meta{color:var(--soft);font-size:14px;margin:6px 0 20px}
.jobs{display:grid;gap:12px;list-style:none;margin:0;padding:0}
.job{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:16px 18px;display:grid;grid-template-columns:1fr auto;gap:6px 16px;align-items:center}
.job h2{font-size:17px;line-height:1.3;margin:0}
.sub{color:var(--soft);font-size:14px;grid-column:1}
.chips{grid-column:1;display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}
.chip{font:700 12px/1 system-ui,sans-serif;border-radius:4px;padding:4px 7px;background:var(--wash);color:var(--deep)}
.chip.nota{background:var(--teal);color:var(--paper)}
.chip.warn{background:var(--amberw);color:var(--amber)}
.go{grid-column:2;grid-row:1/span 4;background:var(--teal);color:var(--paper);text-decoration:none;font:700 14px/1 system-ui,sans-serif;padding:12px 14px;border-radius:8px;white-space:nowrap}
.go:hover{background:var(--deep)}
.go:focus-visible{outline:3px solid var(--teal);outline-offset:2px}
.rec{font-size:14px;margin:0;grid-column:1}
footer{color:var(--soft);font-size:13px;margin-top:20px}
@media (max-width:560px){.job{grid-template-columns:1fr}.go{grid-column:1;grid-row:auto;text-align:center}}
`;

export function htmlLista({ vagas, lidas, combinam, comPerfil, data }) {
  const cards = vagas.map((v, i) => {
    const dias = idadeDias(v.publicadoEm);
    const velha = dias !== null && dias >= DIAS_AVISO;
    const link = linkSeguro(v.url);
    const chips = [
      `<span class="chip nota">Nota ${v.score}</span>`,
      v.rank ? `<span class="chip nota">Combina nº ${v.rank}</span>` : "",
      ...(v.combinaCom ?? []).slice(0, 4).map((k) => `<span class="chip">${escHtml(k)}</span>`),
      velha ? `<span class="chip warn">publicada ${escHtml(textoIdade(dias))}: confira se ainda está aberta</span>` : "",
      ...(v.flags ?? []).slice(0, 2).map((f) => `<span class="chip warn">${escHtml(f)}</span>`),
    ].join("");
    const rec = v.avaliacao ? `<p class="rec"><b>${escHtml(v.avaliacao.recomendacao)}</b> · ${escHtml(v.avaliacao.motivo)}</p>` : "";
    return `<li class="job">
  <h2>${i + 1}. ${escHtml(v.titulo)}</h2>
  <div class="sub">${escHtml(v.empresa)} · ${escHtml(v.local || "local não informado")} · ${velha ? "" : escHtml(textoIdade(dias))}${velha ? escHtml(textoIdade(dias)) : ""}</div>
  <div class="chips">${chips}</div>${rec}
  ${link ? `<a class="go" href="${escHtml(link)}" target="_blank" rel="noopener noreferrer">Abrir vaga ↗</a>` : `<span class="sub">sem link</span>`}
</li>`;
  }).join("\n");
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vagas de hoje · Kit de Vagas</title><style>${CSS}</style></head>
<body><main>
<h1>Vagas de hoje</h1>
<p class="meta">${lidas} vagas lidas · ${combinam} combinam ${comPerfil ? "com você" : "com o que você procura"} · ${escHtml(data)}</p>
<ol class="jobs">
${cards}
</ol>
<footer>Gerada no seu computador pelo Kit de Vagas. Volte ao Claude Code para comparar ou montar o currículo. Se mudou algo lá, recarregue esta página.</footer>
</main></body></html>
`;
}

export async function escreverLista(dados) {
  await mkdir(CASA, { recursive: true });
  const arq = join(CASA, "vagas-de-hoje.html");
  await writeFile(arq, htmlLista(dados));
  return arq;
}

// Abre um arquivo no programa padrao. Falhar aqui nunca derruba o kit: o caminho do arquivo e dito na tela.
export function abrir(caminho) {
  if (process.env.KIT_VAGAS_NAO_ABRIR) return false;
  try {
    const [cmd, args] =
      process.platform === "darwin" ? ["open", [caminho]]
      : process.platform === "win32" ? ["cmd", ["/c", "start", "", caminho]]
      : ["xdg-open", [caminho]];
    const p = spawn(cmd, args, { detached: true, stdio: "ignore" });
    p.on("error", () => {});
    p.unref();
    return true;
  } catch {
    return false;
  }
}
