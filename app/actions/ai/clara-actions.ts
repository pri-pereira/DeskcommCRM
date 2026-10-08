"use server";

import { revalidatePath } from "next/cache";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { upsertClaraAgent, type UpsertClaraResult } from "@/lib/ai/agents/clara-service";

/**
 * Server action chamada pelo botão ou formulário na UI
 */
export async function registrarClaraAction(): Promise<UpsertClaraResult> {
  console.log("[Server Action: registrarClaraAction] 🚀 Disparando ação do servidor...");

  try {
    const authUser = await loadAuthUser();
    let orgId: string | undefined;

    if (authUser) {
      const activeOrg = await resolveActiveOrg(authUser);
      orgId = activeOrg?.orgId;
    }

    const result = await upsertClaraAgent({
      orgId,
      userId: authUser?.id,
    });

    if (result.ok) {
      revalidatePath("/app/ai/agents");
      revalidatePath("/app/ai/agents/[id]");
    }

    return result;
  } catch (error: unknown) {
    const err = error as Record<string, unknown>;
    console.error("[Server Action: registrarClaraAction] ❌ Falha:", err);
    return {
      ok: false,
      error: "action_failed",
      message: err?.message ? String(err.message) : "Falha na Server Action",
      details: err,
    };
  }
}
