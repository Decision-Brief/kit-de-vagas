const UA = "kit-de-vagas/0.1 (leitura de paginas publicas de vagas, uso pessoal)";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pedir(url, { timeout = 25000, headers = {} } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "application/json, text/plain, */*", ...headers },
    });
  } finally {
    clearTimeout(t);
  }
}

async function ler(url, opts, como) {
  const res = await pedir(url, opts);
  if (!res.ok) {
    const e = new Error(`HTTP ${res.status} em ${url}`);
    e.status = res.status;
    throw e;
  }
  return res[como]();
}

export const getJson = (url, opts) => ler(url, opts, "json");
export const getText = (url, opts) => ler(url, opts, "text");

// Uma tarefa por vez em cada "faixa", com pausa entre elas: leitura educada das paginas publicas.
export async function emParalelo(itens, limite, fn, pausa = 150) {
  const resultados = new Array(itens.length);
  let i = 0;
  async function worker() {
    while (i < itens.length) {
      const atual = i++;
      resultados[atual] = await fn(itens[atual], atual);
      await sleep(pausa);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, worker));
  return resultados;
}
