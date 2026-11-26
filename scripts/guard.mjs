#!/usr/bin/env node
// Gancho PreToolUse do plugin. So age dentro do subagente "leitor-de-vaga": la, NENHUMA ferramenta e permitida.
// O leitor recebe o texto da vaga (de terceiros, nao confiavel) e so responde com um JSON. Fora dele, nao opina.
let entrada = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (entrada += c));
process.stdin.on("end", () => {
  let d = {};
  try {
    d = JSON.parse(entrada);
  } catch {
    process.exit(0);
  }
  if (/(^|:)leitor-de-vaga$/.test(String(d.agent_type ?? ""))) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: "O leitor de vaga nao usa ferramentas. Responda so com o JSON de avaliacao.",
        },
      }),
    );
  }
  process.exit(0);
});
