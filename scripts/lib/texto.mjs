const ENTIDADES = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'",
  "&nbsp;": " ", "&ndash;": "-", "&mdash;": "-", "&rsquo;": "'", "&lsquo;": "'",
  "&ldquo;": '"', "&rdquo;": '"', "&bull;": "-", "&hellip;": "...",
};

export function decodificar(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&[a-z]+;|&#39;/gi, (m) => ENTIDADES[m.toLowerCase()] ?? m);
}

export function htmlParaTexto(html) {
  if (!html) return "";
  let s = String(html);
  if (/&lt;\w+/.test(s) && !/<\w+/.test(s)) s = decodificar(s);
  s = s
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|ul|ol|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ");
  s = decodificar(s);
  return s.replace(/[ \t ]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
}

export function semAcento(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function limitar(s, n) {
  s = String(s ?? "");
  return s.length > n ? s.slice(0, n) + "..." : s;
}

export const escHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const slug = (s) =>
  semAcento(s).replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "").toLowerCase() || "vaga";

export const numeros = (s) => (String(s).match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", "."));
