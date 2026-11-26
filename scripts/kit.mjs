#!/usr/bin/env node
// Comando unico do Kit de Vagas. Toda saida e JSON (ou texto, no caso de "ver"), para a IA apresentar sem inventar.
import { AREAS } from "./lib/pontuar.mjs";
import { CASA, carregarConfig, carregarPerfil, hoje, salvarConfig } from "./lib/casa.mjs";
import {
  confirmarContato, confirmarFato, confirmarTodos, contatoLink, corrigirFato, lacunas, proporFatos, proximoPendente, rejeitarFato, resumoPerfil, salvarContato,
} from "./lib/perfil.mjs";
import {
  acharPorLink, adicionarEmpresa, candidaturas, coletar, importarColada, listar, marcar, salvarAvaliacao, textoParaLeitor,
} from "./lib/vagas.mjs";
import { gerarPacote } from "./lib/cv.mjs";
import {
  acompanhar, gupyPerfilResponder, marcarVarias, orientarGupy, telaGupyBloco, telaGupyFim, telaMostradasQuais, validarTexto,
} from "./lib/acompanhar.mjs";
import { lerPdf } from "./lib/pdf.mjs";
import {
  abrirLista, estado, feedbackProxima, feedbackRegistrar, telaCandidaturas, telaComparar, telaEntendi, telaFatosLote, telaSoOlhar, telaVaga,
} from "./lib/telas.mjs";

const [cmd, ...args] = process.argv.slice(2);
// Toda tela com opcoes leva tambem o campo "pergunta": o texto da tela numa linha so (o VS Code junta as quebras de
// linha, entao o separador e " • "). A IA usa esse campo como a pergunta da caixa de escolha, que a pessoa sempre ve.
// Telas longas (lista de vagas, comparacao) definem uma pergunta curta propria: os detalhes ficam na pagina do navegador.
const umaLinha = (t) => String(t).split("\n").map((l) => l.trim()).filter(Boolean).join("  •  ");
const saida = (o) => {
  // A caixa de escolha do Claude Code exige no minimo 2 opcoes: tela com uma so ganha a saida.
  if (o && Array.isArray(o.opcoes) && o.opcoes.length === 1) o.opcoes.push({ id: "sair", rotulo: "Por hoje é só", procedimento: "sair" });
  if (o && typeof o === "object" && !Array.isArray(o) && o.texto && Array.isArray(o.opcoes) && o.opcoes.length && !o.pergunta) o.pergunta = umaLinha(o.texto);
  console.log(JSON.stringify(o, null, 1));
};

async function lerStdin() {
  if (process.stdin.isTTY) return "";
  let s = "";
  process.stdin.setEncoding("utf8");
  for await (const c of process.stdin) s += c;
  return s.trim();
}
async function lerJsonStdin() {
  const s = await lerStdin();
  if (!s) throw new Error("Esperava um JSON na entrada (use <<'EOF').");
  try {
    return JSON.parse(s);
  } catch {
    // Modelos menores as vezes cercam o JSON de texto ou de ```json: pega do primeiro "{" (ou "[") ao ultimo fecho.
    const ini = s.search(/[\[{]/);
    const fim = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
    if (ini >= 0 && fim > ini) {
      try {
        return JSON.parse(s.slice(ini, fim + 1));
      } catch {
        // cai no erro abaixo
      }
    }
    throw new Error("O JSON da entrada esta invalido.");
  }
}
const sim = (v) => /^(sim|s|true|1|ligar|ligada)$/i.test(String(v ?? ""));

const COMANDOS = {
  async estado() {
    const e = await estado();
    const c = await carregarConfig();
    c.ultimaVez = hoje();
    await salvarConfig(c);
    saida(e);
  },

  async config() {
    saida(await carregarConfig());
  },

  async "config-set"() {
    const [chave, ...resto] = args;
    const valor = resto.join(" ").trim();
    // Aceita "Pleno", "Sênior", "Brasil": o que importa e o sentido, nao a grafia.
    const norm = valor.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (chave === "feedback") return saida(await carregarConfig()); // opiniao nao pede mais aceite: fica so no computador
    const c = await carregarConfig();
    if (chave === "areas") {
      const lista = norm.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
      const ruins = lista.filter((a) => !AREAS.areas[a]);
      if (ruins.length || !lista.length) throw new Error(`Areas validas: ${Object.keys(AREAS.areas).join(", ")}.`);
      c.areas = lista;
    } else if (chave === "nivel") {
      if (!["pleno", "senior", "lead"].includes(norm)) throw new Error("Niveis validos: pleno, senior, lead.");
      c.nivel = norm;
    } else if (chave === "local") {
      if (!["brasil", "global"].includes(norm)) throw new Error("Locais validos: brasil, global.");
      c.local = norm;
    } else if (chave === "palavras") {
      c.palavrasChave = valor.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 20);
    } else if (chave === "gupy") {
      c.fontes.gupy = sim(valor);
    } else {
      throw new Error("Chaves validas: areas, nivel, local, palavras, gupy, feedback.");
    }
    c.ultimaColeta = null;
    await salvarConfig(c);
    saida(c);
  },

  async "ler-pdf"() {
    saida(await lerPdf(args.join(" ")));
  },

  async "perfil-resumo"() {
    const p = await carregarPerfil();
    const c = await carregarConfig();
    saida({ ...resumoPerfil(p), busca: { areas: c.areas, nivel: c.nivel, local: c.local, gupy: c.fontes.gupy, palavras: c.palavrasChave }, contato: p.contato, fatos: p.fatos.filter((f) => !f.rejeitado).map((f) => ({ id: f.id, tipo: f.tipo, empresa: f.empresa, texto: f.texto, confirmado: f.confirmado })) });
  },
  async "fato-propor"() {
    saida({ propostos: (await proporFatos(await lerJsonStdin())).map((f) => f.id) });
  },
  async "fato-proximo"() {
    saida(await proximoPendente());
  },
  async "fato-confirmar"() {
    saida(await confirmarFato(args[0]));
  },
  async "fato-corrigir"() {
    const texto = args.slice(1).join(" ") || (await lerStdin());
    saida(await corrigirFato(args[0], texto));
  },
  async "fato-rejeitar"() {
    saida(await rejeitarFato(args[0]));
  },
  async contato() {
    saida(await salvarContato(await lerJsonStdin()));
  },
  async "contato-confirmar"() {
    saida(await confirmarContato());
  },

  async coletar() {
    saida(await coletar({ forcar: args.includes("--forcar") }));
  },
  async lista() {
    saida(await listar(Number(args[0]) || 5));
  },
  async "abrir-lista"() {
    saida(await abrirLista({ abrirNavegador: !args.includes("--sem-abrir"), revisitar: args.includes("--revisitar") }));
  },
  async "tela-so-olhar"() {
    saida(await telaSoOlhar());
  },
  async "tela-vaga"() {
    saida(await telaVaga(args[0]));
  },
  async "tela-comparar"() {
    saida(await telaComparar(args));
  },
  async "tela-entendi"() {
    saida(await telaEntendi());
  },
  async "tela-fatos-lote"() {
    saida(await telaFatosLote());
  },
  async "fatos-confirmar-todos"() {
    saida(await confirmarTodos());
  },
  async lacunas() {
    saida(await lacunas((await carregarConfig()).areas));
  },
  async "contato-link"() {
    saida(await contatoLink(args[0], args.slice(1).join(" ")));
  },
  async ver() {
    console.log(await textoParaLeitor(args[0]));
  },
  async "avaliacao-salvar"() {
    saida(await salvarAvaliacao(args[0], await lerJsonStdin()));
  },
  async "tela-avaliacao"() {
    saida(await telaVaga(args[0]));
  },
  async "importar-vaga"() {
    saida(await importarColada(await lerJsonStdin()));
  },
  async "achar-vaga"() {
    saida(await acharPorLink(args[0]));
  },
  async "empresa-add"() {
    saida(await adicionarEmpresa(args[0]));
  },
  async marcar() {
    saida(await marcar(args[0], args[1], args.slice(2).join(" ")));
  },
  async "marcar-varias"() {
    const [status, ...curtos] = args;
    saida(await marcarVarias(status, curtos, "enviada por fora do kit"));
  },
  async "mostradas-quais"() {
    saida(await telaMostradasQuais());
  },
  async "gupy-perfil"() {
    saida(await gupyPerfilResponder(args[0]));
  },
  async "orientar-gupy"() {
    saida(await orientarGupy(args[0] ?? null));
  },
  async "tela-gupy-bloco"() {
    saida(await telaGupyBloco(args[0], args[1] ?? null));
  },
  async "tela-gupy-fim"() {
    saida(await telaGupyFim(args[0]));
  },
  async "texto-validar"() {
    saida(await validarTexto(await lerJsonStdin()));
  },
  async acompanhar() {
    saida(await acompanhar(args[0]));
  },
  async candidaturas() {
    saida(await telaCandidaturas());
  },
  async paradas() {
    saida((await candidaturas()).paradas);
  },
  async pacote() {
    saida(await gerarPacote(args[0], await lerJsonStdin()));
  },

  async "feedback-proxima"() {
    saida(await feedbackProxima());
  },
  async "feedback-registrar"() {
    saida(await feedbackRegistrar(args[0], args[1]));
  },

  async ajuda() {
    saida({ pasta: CASA, comandos: Object.keys(COMANDOS) });
  },
};

try {
  if (!COMANDOS[cmd]) throw new Error(`Comando desconhecido: "${cmd ?? ""}". Rode: ajuda`);
  await COMANDOS[cmd]();
} catch (e) {
  console.error(JSON.stringify({ erro: e.message }));
  process.exit(1);
}
