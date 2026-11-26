// Le o texto de um PDF sem instalar nada: pdftotext, se existir; no macOS, o PDFKit que ja vem no sistema.
import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const LIMITE = 60000;

const JXA = `ObjC.import("PDFKit");
function run(a){ var d = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(a[0])); return d ? ObjC.unwrap(d.string) : ""; }`;

export async function lerPdf(caminho) {
  const arq = resolve(String(caminho ?? "").replace(/^~(?=\/|$)/, homedir()));
  if (!/\.pdf$/i.test(arq)) throw new Error("Esse arquivo nao e um PDF. Se for texto, cole o conteudo aqui.");
  if (!existsSync(arq)) throw new Error(`Nao achei o arquivo ${arq}. Confira o caminho ou cole o texto do curriculo.`);
  if (statSync(arq).size > 15 * 1024 * 1024) throw new Error("O PDF tem mais de 15 MB. Cole o texto do curriculo.");

  const tentativas = [
    ["pdftotext", ["-layout", arq, "-"]],
    ...(process.platform === "darwin" ? [["osascript", ["-l", "JavaScript", "-e", JXA, arq]]] : []),
  ];
  for (const [cmd, args] of tentativas) {
    try {
      const { stdout } = await exec(cmd, args, { timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
      const texto = stdout.replace(/\r/g, "").trim();
      if (texto.length > 40) return { arquivo: arq, caracteres: texto.length, cortado: texto.length > LIMITE, texto: texto.slice(0, LIMITE) };
    } catch {
      // tenta o proximo
    }
  }
  throw new Error("Nao consegui ler o texto desse PDF (pode ser uma imagem escaneada). Cole o texto do curriculo aqui.");
}
