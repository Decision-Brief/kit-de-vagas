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
.go{grid-column:2;grid-row:1/span 4;background:var(--teal);color:var(--paper);text-decoration:none;font:700 14px/1.2 system-ui,sans-serif;padding:14px 16px;min-height:44px;display:inline-flex;align-items:center;border-radius:8px;white-space:nowrap}
.go:hover{background:var(--deep)}
.go:focus-visible{outline:3px solid var(--teal);outline-offset:2px}
.rec{font-size:14px;margin:0;grid-column:1}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.card{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin-top:16px}
.card h2{font:600 18px/1.3 Georgia,"Times New Roman",serif;margin:0 0 6px}
.card p{margin:6px 0 0;font-size:15px}
.produto{background:var(--wash);border-color:transparent}
.go2{display:inline-flex;align-items:center;min-height:44px;margin-top:12px;padding:0 16px;border:2px solid var(--teal);border-radius:8px;color:var(--deep);font:700 14px/1.2 system-ui,sans-serif;text-decoration:none}
.go2:hover{background:var(--paper)}
.go2:focus-visible{outline:3px solid var(--teal);outline-offset:2px}
details.termos{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:0 18px;margin-top:16px}
details.termos summary{cursor:pointer;min-height:44px;display:flex;align-items:center;font:700 15px/1.3 system-ui,sans-serif}
details.termos summary:focus-visible{outline:3px solid var(--teal);outline-offset:2px}
details.termos ul{margin:0 0 12px;padding-left:20px;font-size:14px}
details.termos li{margin:6px 0}
details.termos a,.card a:not(.go2),footer a{color:var(--deep)}
details.termos li a{display:inline-flex;align-items:center;min-height:24px}
@media (max-width:560px){details.termos li a{min-height:44px}}
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
  ${link ? `<a class="go" href="${escHtml(link)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir vaga ${i + 1}: ${escHtml(v.titulo)}, ${escHtml(v.empresa)} (abre em outra aba)">Abrir vaga ↗</a>` : `<span class="sub">sem link</span>`}
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
<section class="card" aria-labelledby="quem-t">
<h2 id="quem-t">Quem faz este kit</h2>
<p>Feito por Felipe Ribeiro, designer de produto e fundador do Decision Brief. O kit lê páginas públicas de vagas e organiza a sua busca, tudo no seu computador. <strong>Quem se candidata é você:</strong> o kit nunca envia nada por você nem entra nas suas contas.</p>
</section>
<section class="card produto" aria-labelledby="prod-t">
<h2 id="prod-t">Conheça o Decision Brief</h2>
<p>Decisões importantes costumam ficar espalhadas em conversas e planilhas. O Decision Brief registra uma decisão por documento: a posição antes da evidência, de onde vem cada dado, o que falta, quem responde e quando revisar. Serve para decisões de equipe e também para as pessoais difíceis, como escolher entre duas ofertas de emprego.</p>
<a class="go2" href="https://decision-brief.com/?origem=kit" target="_blank" rel="noopener noreferrer">Conhecer o Decision Brief<span class="sr"> (abre em outra aba)</span> ↗</a>
</section>
<details class="termos">
<summary>Termos de uso do kit</summary>
<ul>
<li>Uso pessoal e não comercial, sob a licença PolyForm Noncommercial 1.0.0.</li>
<li>Fornecido como está, sem garantia de resultado, de que a vaga ainda esteja aberta ou de contratação. Confira cada vaga na página da empresa.</li>
<li>Você revisa tudo e envia por conta própria. O kit não envia nada, não entra em contas e só escreve no currículo o que você confirmou.</li>
<li>Seus dados ficam no seu computador. O Decision Brief não recebe o seu currículo, as vagas nem o seu nome.</li>
<li>As vagas vêm de páginas públicas de terceiros. Cada site tem os próprios termos e você é responsável por usá-los de acordo com eles. A Gupy restringe a cópia automatizada de vagas.</li>
<li>A IA usada é a do seu Claude e conta no seu plano. O kit não tem relação com as empresas citadas.</li>
<li>Dúvidas: contato@decision-brief.com. <a href="https://github.com/Decision-Brief/kit-de-vagas/blob/main/TERMOS.md" target="_blank" rel="noopener noreferrer">Termos completos<span class="sr"> (abre em outra aba)</span></a>.</li>
</ul>
</details>
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
  if (process.env.KIT_VAGAS_NAO_ABRIR) return process.env.KIT_VAGAS_NAO_ABRIR === "simular"; // "simular": nos testes, finge que abriu
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
