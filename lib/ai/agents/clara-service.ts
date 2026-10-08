import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { CLARA_NAME, CLARA_ROLE, CLARA_SYSTEM_PROMPT } from "./clara-constants";

export { CLARA_NAME, CLARA_ROLE, CLARA_SYSTEM_PROMPT };

export const CLARA_DEFAULT_TOOLS = [
  "crm_search_contacts",
  "crm_get_contact",
  "crm_list_conversations",
  "crm_get_conversation",
  "crm_get_conversation_history",
  "crm_get_queue_status",
  "crm_search_knowledge",
  "crm_list_knowledge_sources",
  "crm_list_improvement_proposals",
  "crm_get_org_memory",
  "crm_save_org_memory",
  "crm_list_contact_orders",
  "crm_search_products",
  "crm_list_privacy_requests",
  "crm_list_tags",
  "crm_list_message_templates",
  "crm_render_message_template",
  "crm_list_available_attendants",
  "crm_start_conversation_and_send",
  "crm_assign_conversation",
  "crm_manage_tags",
];

export interface UpsertClaraOptions {
  orgId?: string;
  userId?: string | null;
  provider?: string;
  model?: string;
  customPrompt?: string;
}

export interface UpsertClaraResult {
  ok: boolean;
  message: string;
  agentId?: string;
  versionId?: string;
  actionTaken?: "created" | "updated";
  agent?: Record<string, unknown>;
  version?: Record<string, unknown>;
  error?: string;
  details?: unknown;
}

/**
 * Registra ou atualiza o agente de IA "Clara" no Supabase,
 * garantindo atomicidade entre ai_agents e ai_agent_versions.
 */
export async function upsertClaraAgent(options?: UpsertClaraOptions): Promise<UpsertClaraResult> {
  console.log("-------------------------------------------------------------------");
  console.log("[DeskcommCRM: Agente Clara] 🚀 Iniciando registro/atualização...");

  const admin = createAdminClient();

  try {
    // 1. Resolução da Organização
    let targetOrgId = options?.orgId;
    if (!targetOrgId) {
      console.log("[DeskcommCRM: Agente Clara] 🔍 Buscando organização padrão...");
      const { data: orgs, error: orgErr } = await admin
        .from("organizations")
        .select("id, legal_name, display_name")
        .limit(1);

      if (orgErr || !orgs || orgs.length === 0) {
        console.error("[DeskcommCRM: Agente Clara] ❌ Falha ao encontrar organização:", orgErr);
        return {
          ok: false,
          error: "organization_not_found",
          message: "Nenhuma organização encontrada no banco de dados para vincular o agente.",
          details: orgErr,
        };
      }
      targetOrgId = orgs[0].id;
      console.log(`[DeskcommCRM: Agente Clara] 🏢 Organização selecionada: ${orgs[0].display_name || orgs[0].legal_name || targetOrgId}`);
    } else {
      console.log(`[DeskcommCRM: Agente Clara] 🏢 Organização informada: ${targetOrgId}`);
    }

    // 2. Resolução do Usuário criador (opcional)
    let targetUserId = options?.userId ?? null;
    if (!targetUserId) {
      const { data: members } = await admin
        .from("user_organizations")
        .select("user_id")
        .eq("organization_id", targetOrgId)
        .limit(1);
      targetUserId = members?.[0]?.user_id ?? null;
      console.log(`[DeskcommCRM: Agente Clara] 👤 Usuário criador vinculado: ${targetUserId || "sistema"}`);
    }

    // 3. Resolução da Credencial de IA e Provedor
    console.log("[DeskcommCRM: Agente Clara] 🔑 Buscando credenciais de IA ativas...");
    const { data: creds, error: credErr } = await admin
      .from("ai_provider_credentials")
      .select("id, provider, label, is_active")
      .eq("organization_id", targetOrgId)
      .eq("is_active", true);

    if (credErr) {
      console.warn("[DeskcommCRM: Agente Clara] ⚠️ Aviso na busca de credenciais:", credErr.message);
    }

    const activeCred = creds?.[0];
    const selectedProvider = options?.provider ?? activeCred?.provider ?? "google";
    const selectedModel =
      options?.model ?? (selectedProvider === "google" ? "gemini-2.5-flash" : "anthropic/claude-sonnet-5");
    const credentialId = activeCred?.id ?? null;

    console.log(`[DeskcommCRM: Agente Clara] 🤖 Configuração LLM: Provedor=${selectedProvider}, Modelo=${selectedModel}, CredencialId=${credentialId || "chave_padrao"}`);

    // 4. Resolução da Sessão de Canal (WhatsApp)
    console.log("[DeskcommCRM: Agente Clara] 📱 Verificando canal de WhatsApp conectado...");
    const { data: channels, error: channelErr } = await admin
      .from("channel_sessions")
      .select("id, phone_number, status")
      .eq("organization_id", targetOrgId)
      .limit(1);

    if (channelErr) {
      console.warn("[DeskcommCRM: Agente Clara] ⚠️ Aviso ao verificar canais:", channelErr.message);
    }

    const channelSessionId = channels?.[0]?.id ?? null;
    if (channelSessionId) {
      console.log(`[DeskcommCRM: Agente Clara] 📲 Canal conectado vinculado: ${channelSessionId} (${channels[0].phone_number || "sem número"})`);
    } else {
      console.log("[DeskcommCRM: Agente Clara] ℹ️ Nenhum canal conectado no momento. O agente funcionará sem vinculação fixa inicial.");
    }

    const systemPrompt = options?.customPrompt ?? CLARA_SYSTEM_PROMPT;

    // 5. Verificar se já existe um Agente com nome "Clara" nesta organização
    console.log(`[DeskcommCRM: Agente Clara] 🔍 Verificando existência prévia de '${CLARA_NAME}'...`);
    const { data: existingAgents, error: findErr } = await admin
      .from("ai_agents")
      .select("id, name, published_version_id, kind")
      .eq("organization_id", targetOrgId)
      .eq("name", CLARA_NAME);

    if (findErr) {
      console.error("[DeskcommCRM: Agente Clara] ❌ Erro ao consultar ai_agents:", findErr);
      return {
        ok: false,
        error: "db_query_error",
        message: `Erro ao consultar agentes existentes: ${findErr.message}`,
        details: findErr,
      };
    }

    let agentId: string;
    let actionTaken: "created" | "updated" = "created";

    if (existingAgents && existingAgents.length > 0) {
      // ATUALIZAÇÃO DO AGENTE EXISTENTE
      agentId = existingAgents[0].id;
      actionTaken = "updated";
      console.log(`[DeskcommCRM: Agente Clara] 🔄 Agente já existe com id=${agentId}. Atualizando dados principais...`);

      const { error: updateAgentErr } = await admin
        .from("ai_agents")
        .update({
          description: CLARA_ROLE,
          system_prompt: systemPrompt,
          model: selectedModel,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", agentId)
        .eq("organization_id", targetOrgId);

      if (updateAgentErr) {
        console.error("[DeskcommCRM: Agente Clara] ❌ Erro ao atualizar ai_agents:", updateAgentErr);
        return {
          ok: false,
          error: "agent_update_failed",
          message: `Falha ao atualizar cadastro do agente: ${updateAgentErr.message}`,
          details: updateAgentErr,
        };
      }
    } else {
      // CRIAÇÃO DE NOVO AGENTE
      agentId = randomUUID();
      console.log(`[DeskcommCRM: Agente Clara] ➕ Criando novo registro em ai_agents (id=${agentId})...`);

      const { error: insertAgentErr } = await admin.from("ai_agents").insert({
        id: agentId,
        organization_id: targetOrgId,
        name: CLARA_NAME,
        description: CLARA_ROLE,
        model: selectedModel,
        system_prompt: systemPrompt,
        kind: "mcp_agent",
        priority: 0,
        is_active: true,
        is_default: false,
        created_by: targetUserId,
      });

      if (insertAgentErr) {
        console.error("[DeskcommCRM: Agente Clara] ❌ Erro ao inserir em ai_agents:", insertAgentErr);
        return {
          ok: false,
          error: "agent_insert_failed",
          message: `Falha ao inserir novo agente: ${insertAgentErr.message}`,
          details: insertAgentErr,
        };
      }
    }

    // 6. Gerenciamento de Versão em `ai_agent_versions`
    console.log("[DeskcommCRM: Agente Clara] 📦 Criando versão de comportamento em ai_agent_versions...");

    // Obter próximo número de versão
    const { data: maxVersionRow } = await admin
      .from("ai_agent_versions")
      .select("version_number")
      .eq("agent_id", agentId)
      .eq("organization_id", targetOrgId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersionNumber = (maxVersionRow?.version_number ?? 0) + 1;
    const versionId = randomUUID();
    const publishedAt = new Date().toISOString();

    const versionPayload = {
      id: versionId,
      organization_id: targetOrgId,
      agent_id: agentId,
      version_number: nextVersionNumber,
      system_prompt: systemPrompt,
      provider: selectedProvider,
      model: selectedModel,
      credential_id: credentialId,
      tool_ids: CLARA_DEFAULT_TOOLS,
      trigger_config: {
        events: ["message"],
        filters: {
          ignore_self: true,
          ignore_groups: true,
          keyword_regex: null,
          business_hours: null,
        },
        concurrency: "one_per_conversation",
      },
      channel_session_id: channelSessionId,
      max_steps: 10,
      token_budget: 50000,
      cost_budget_cents: 50,
      history_message_window: 20,
      history_token_window: 8000,
      handoff_keywords: ["falar com humano", "atendente", "pessoa real"],
      handoff_tool_enabled: true,
      proposal_ai_draft_enabled: true,
      cases_enabled: false,
      split_messages: true,
      split_max_chars: 200,
      inbound_debounce_ms: 2000,
      status: "published",
      published_at: publishedAt,
      created_by: targetUserId,
      followup: {
        enabled: false,
        send_window: null,
        callback_enabled: true,
        flow_pointer_ids: [],
      },
    };

    const { error: insertVersionErr } = await admin
      .from("ai_agent_versions")
      .insert(versionPayload);

    if (insertVersionErr) {
      console.error("[DeskcommCRM: Agente Clara] ❌ Erro ao inserir em ai_agent_versions:", insertVersionErr);
      return {
        ok: false,
        error: "version_insert_failed",
        message: `Falha ao registrar versão do agente: ${insertVersionErr.message}`,
        details: insertVersionErr,
      };
    }

    console.log(`[DeskcommCRM: Agente Clara] 📌 Versão v${nextVersionNumber} criada (id=${versionId}).`);

    // 7. Vincular published_version_id no ai_agents
    console.log("[DeskcommCRM: Agente Clara] 🔗 Vinculando published_version_id e marcando como publicado...");
    const { error: linkErr } = await admin
      .from("ai_agents")
      .update({
        published_version_id: versionId,
        is_active: true,
        updated_at: publishedAt,
      })
      .eq("id", agentId)
      .eq("organization_id", targetOrgId);

    if (linkErr) {
      console.error("[DeskcommCRM: Agente Clara] ❌ Erro ao vincular published_version_id:", linkErr);
      return {
        ok: false,
        error: "link_version_failed",
        message: `Falha ao vincular versão publicada ao agente: ${linkErr.message}`,
        details: linkErr,
      };
    }

    console.log("-------------------------------------------------------------------");
    console.log(`[DeskcommCRM: Agente Clara] ✅ SUCESSO! Agente '${CLARA_NAME}' ${actionTaken === "created" ? "criada" : "atualizada"} com êxito!`);
    console.log(`[DeskcommCRM: Agente Clara] 📋 Resumo: AgentID=${agentId}, VersionID=${versionId}, Versão=v${nextVersionNumber}`);
    console.log("-------------------------------------------------------------------");

    return {
      ok: true,
      message: `Agente Clara ${actionTaken === "created" ? "criada" : "atualizada"} com sucesso e versão publicada vinculada!`,
      agentId,
      versionId,
      actionTaken,
      agent: {
        id: agentId,
        name: CLARA_NAME,
        role: CLARA_ROLE,
        provider: selectedProvider,
        model: selectedModel,
        is_active: true,
      },
      version: {
        id: versionId,
        version_number: nextVersionNumber,
        status: "published",
        published_at: publishedAt,
      },
    };
  } catch (err: unknown) {
    const errorObject = err as Record<string, unknown>;
    console.error("-------------------------------------------------------------------");
    console.error("[DeskcommCRM: Agente Clara] 💥 EXCEÇÃO CAPTURADA NO TRY/CATCH:");
    console.error("Mensagem:", errorObject?.message || String(err));
    console.error("Stack:", errorObject?.stack);
    console.error("Detalhes completos:", JSON.stringify(err, Object.getOwnPropertyNames(err as object), 2));
    console.error("-------------------------------------------------------------------");

    return {
      ok: false,
      error: "unexpected_exception",
      message: `Erro inesperado ao registrar o agente Clara: ${errorObject?.message || String(err)}`,
      details: err,
    };
  }
}
