import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { ok, fail } from "@/lib/api/wrappers";
import { upsertClaraAgent } from "@/lib/ai/agents/clara-service";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/ai/agents/clara
 * Rota para criar ou sincronizar a configuração da Agente Clara no Supabase.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  console.log(`[API /api/v1/ai/agents/clara] [POST] [reqId=${requestId}] Recebendo requisição...`);

  try {
    let orgId: string | undefined;
    let userId: string | null = null;

    // Tentar resolver a sessão ativa se existir
    const user = await loadAuthUser();
    if (user) {
      userId = user.id;
      const activeOrg = await resolveActiveOrg(user);
      if (activeOrg) {
        orgId = activeOrg.orgId;
      }
    }

    // Permitir sobrescrever via body opcionalmente
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      // Body vazio é aceitável, usa os valores padrão da Clara
    }

    const customOrgId = (body.orgId as string) || orgId;
    const provider = body.provider as string | undefined;
    const model = body.model as string | undefined;
    const customPrompt = body.system_prompt as string | undefined;

    console.log(`[API /api/v1/ai/agents/clara] [reqId=${requestId}] Executando upsertClaraAgent...`);
    const result = await upsertClaraAgent({
      orgId: customOrgId,
      userId,
      provider,
      model,
      customPrompt,
    });

    if (!result.ok) {
      console.error(`[API /api/v1/ai/agents/clara] [reqId=${requestId}] ❌ Falha no registro:`, result.message);
      return fail(result.error ?? "internal_error", result.message, 500, {
        requestId,
        details: result.details,
      });
    }

    console.log(`[API /api/v1/ai/agents/clara] [reqId=${requestId}] ✅ Agente Clara registrada/atualizada com sucesso!`);
    return ok(result, { requestId, status: 200 });
  } catch (error: unknown) {
    const err = error as Record<string, unknown>;
    console.error(`[API /api/v1/ai/agents/clara] [reqId=${requestId}] 💥 Exceção não tratada na rota:`, err);
    return fail("unexpected_error", `Erro inesperado na rota: ${err?.message || String(error)}`, 500, {
      requestId,
      details: err,
    });
  }
}

/**
 * GET /api/v1/ai/agents/clara
 * Permite também testar via GET direto no navegador ou via fetch simples.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  console.log(`[API /api/v1/ai/agents/clara] [GET] [reqId=${requestId}] Teste rápido via GET...`);
  return POST(req);
}
