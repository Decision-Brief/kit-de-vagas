import { createHash } from "node:crypto";
import { getJson, getText, sleep } from "./http.mjs";
import { htmlParaTexto, limitar, decodificar } from "./texto.mjs";

export function montarVaga({ fonte, empresa, idOriginal, titulo, local, remoto, url, descricao, publicadoEm, equipe }) {
  empresa = decodificar(String(empresa ?? "?")).trim();
  const id = `${fonte}:${empresa}:${idOriginal}`;
  return {
    id,
    curto: createHash("sha1").update(id).digest("hex").slice(0, 7),
    fonte,
    empresa,
    titulo: decodificar(String(titulo ?? "")).trim(),
    local: decodificar(String(local ?? "")).trim(),
    remoto: remoto ?? null,
    url,
    equipe: equipe ?? "",
    publicadoEm: publicadoEm ? new Date(publicadoEm).toISOString().slice(0, 10) : null,
    descricao: limitar(htmlParaTexto(descricao), 8000),
  };
}

// ---------- ATS com pagina publica por empresa ----------
const lerGreenhouse = async (slug, nome) => {
  const d = await getJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`);
  return (d.jobs ?? []).map((j) =>
    montarVaga({
      fonte: "greenhouse", empresa: nome, idOriginal: j.id, titulo: j.title,
      local: j.location?.name, url: j.absolute_url, descricao: j.content,
      publicadoEm: j.first_published ?? j.updated_at,
      equipe: (j.departments ?? []).map((x) => x.name).join(", "),
    }),
  );
};

const lerLever = async (slug, nome) => {
  let lista;
  try {
    lista = await getJson(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  } catch (e) {
    if (e.status !== 404) throw e;
    lista = await getJson(`https://api.eu.lever.co/v0/postings/${slug}?mode=json`);
  }
  return lista.map((j) =>
    montarVaga({
      fonte: "lever", empresa: nome, idOriginal: j.id, titulo: j.text,
      local: j.categories?.location ?? (j.categories?.allLocations ?? []).join(", "),
      remoto: j.workplaceType ? j.workplaceType === "remote" : null,
      url: j.hostedUrl, descricao: j.descriptionPlain ?? j.description,
      publicadoEm: j.createdAt, equipe: j.categories?.team,
    }),
  );
};

const lerAshby = async (slug, nome) => {
  const d = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`);
  return (d.jobs ?? [])
    .filter((j) => j.isListed !== false)
    .map((j) =>
      montarVaga({
        fonte: "ashby", empresa: nome, idOriginal: j.id, titulo: j.title,
        local: [j.location, ...(j.secondaryLocations ?? []).map((x) => x.location)].filter(Boolean).join("; "),
        remoto: j.isRemote ?? null, url: j.jobUrl,
        descricao: j.descriptionPlain ?? j.descriptionHtml,
        publicadoEm: j.publishedAt, equipe: j.team ?? j.department,
      }),
    );
};

const lerWorkable = async (slug, nome) => {
  const d = await getJson(`https://apply.workable.com/api/v1/widget/accounts/${slug}?details=true`);
  return (d.jobs ?? []).map((j) =>
    montarVaga({
      fonte: "workable", empresa: nome, idOriginal: j.shortcode, titulo: j.title,
      local: [j.city, j.state, j.country].filter(Boolean).join(", "),
      remoto: j.telecommuting ?? null, url: j.url,
      descricao: j.description, publicadoEm: j.published_on, equipe: j.department,
    }),
  );
};

export const LEITORES = { greenhouse: lerGreenhouse, lever: lerLever, ashby: lerAshby, workable: lerWorkable };

// Descobre o sistema de vagas a partir do link da pagina de carreiras da empresa.
export function detectarAts(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const partes = u.pathname.split("/").filter(Boolean);
  const h = u.hostname.toLowerCase();
  if (/(^|\.)greenhouse\.io$/.test(h) && partes[0]) return { ats: "greenhouse", slug: partes[0] };
  if (/(^|\.)lever\.co$/.test(h) && partes[0]) return { ats: "lever", slug: partes[0] };
  if (/(^|\.)ashbyhq\.com$/.test(h) && partes[0]) return { ats: "ashby", slug: partes[0] };
  if (/(^|\.)workable\.com$/.test(h) && partes[0]) return { ats: "workable", slug: partes[0] };
  return null;
}

export async function sondar(ats, slug) {
  try {
    const vagas = await LEITORES[ats](slug, slug);
    return { ok: true, total: vagas.length };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
}

// ---------- feeds de vagas remotas ----------
function tag(bloco, nome) {
  const m = bloco.match(new RegExp(`<${nome}[^>]*>([\\s\\S]*?)</${nome}>`, "i"));
  return m ? m[1].replace(/^<!\[CDATA\[|\]\]>$/g, "").trim() : "";
}

export const lerRemotive = async (categoria) => {
  const d = await getJson(`https://remotive.com/api/remote-jobs?category=${encodeURIComponent(categoria)}&limit=200`);
  return (d.jobs ?? []).map((j) =>
    montarVaga({
      fonte: "remotive", empresa: j.company_name, idOriginal: j.id, titulo: j.title,
      local: j.candidate_required_location, remoto: true, url: j.url,
      descricao: j.description, publicadoEm: j.publication_date, equipe: j.category,
    }),
  );
};

export const lerRemoteOk = async () => {
  const d = await getJson("https://remoteok.com/api");
  return d
    .filter((j) => j && j.id && j.position)
    .map((j) =>
      montarVaga({
        fonte: "remoteok", empresa: j.company, idOriginal: j.id, titulo: j.position,
        local: j.location || "Remote", remoto: true, url: j.url,
        descricao: j.description, publicadoEm: j.date, equipe: (j.tags ?? []).join(", "),
      }),
    );
};

export const lerWeWorkRemotely = async (categoria) => {
  const xml = await getText(`https://weworkremotely.com/categories/${categoria}.rss`);
  return xml.split(/<item>/i).slice(1).map((it) => {
    const titulo = tag(it, "title");
    const [empresa, ...resto] = titulo.split(":");
    return montarVaga({
      fonte: "weworkremotely", empresa: resto.length ? empresa.trim() : "?",
      idOriginal: tag(it, "guid") || tag(it, "link"),
      titulo: resto.length ? resto.join(":").trim() : titulo,
      local: tag(it, "region") || "Remote", remoto: true, url: tag(it, "link"),
      descricao: tag(it, "description"), publicadoEm: tag(it, "pubDate") || null,
    });
  });
};

// ---------- Gupy ----------
// Rota publica SEM documentacao oficial: ja mudou antes e pode mudar de novo.
// Os termos de uso do candidato da Gupy restringem copia automatizada. O kit liga esta fonte por
// padrao e avisa a pessoa, que pode desligar com: kit.mjs config-set gupy nao
const GUPY = "https://portal.gupy.io/api/job-search/jobs";
const ROTULO_LOCAL = { remote: "Remoto", hybrid: "Hibrido", "on-site": "Presencial" };

export async function lerGupy(buscas, paginasMax = 4) {
  const vistas = new Map();
  for (const busca of buscas) {
    let offset = 0;
    for (let pagina = 0; pagina < paginasMax; pagina++) {
      const d = await getJson(`${GUPY}?jobName=${encodeURIComponent(busca)}&limit=50&offset=${offset}`);
      for (const j of d.data ?? []) vistas.set(j.id, j);
      offset += 50;
      if (offset >= (d.pagination?.total ?? 0)) break;
      await sleep(250);
    }
    await sleep(250);
  }
  return [...vistas.values()].map((j) =>
    montarVaga({
      fonte: "gupy", empresa: j.careerPageName || "?", idOriginal: j.id, titulo: j.name,
      local: [j.city, j.state, "Brasil", ROTULO_LOCAL[j.workplaceType]].filter(Boolean).join(", "),
      remoto: j.workplaceType === "remote", url: j.jobUrl,
      descricao: j.description, publicadoEm: j.publishedDate,
    }),
  );
}
