import { upsertClaraAgent } from "@/lib/ai/agents/clara-service";

async function main() {
  console.log("===================================================================");
  console.log("Executando teste direto de cadastro/atualização da Agente Clara...");
  console.log("===================================================================");

  const result = await upsertClaraAgent();

  console.log("===================================================================");
  console.log("RESULTADO FINAL:", JSON.stringify(result, null, 2));
  console.log("===================================================================");

  if (!result.ok) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("ERRO FATAL:", err);
  process.exit(1);
});
