"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkle, CheckCircle, Warning, ArrowsClockwise } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { registrarClaraAction } from "@/app/actions/ai/clara-actions";
import { CLARA_NAME, CLARA_ROLE, CLARA_SYSTEM_PROMPT } from "@/lib/ai/agents/clara-constants";

interface BotaoRegistrarClaraProps {
  className?: string;
  onSuccess?: () => void;
}

export function BotaoRegistrarClara({ className, onSuccess }: BotaoRegistrarClaraProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [statusLog, setStatusLog] = useState<{
    tipo: "idle" | "sucesso" | "erro";
    mensagem: string;
    detalhes?: unknown;
  }>({
    tipo: "idle",
    mensagem: "Pronto para sincronizar o agente Clara com a base de dados.",
  });

  const handleCadastrarViaAction = () => {
    console.log("-------------------------------------------------------------------");
    console.log("[DeskcommCRM Front-end] 🚀 Iniciando requisição para registrar Agente Clara...");
    console.log("[DeskcommCRM Front-end] 📋 Payload a ser enviado:", {
      name: CLARA_NAME,
      role: CLARA_ROLE,
      promptPreview: CLARA_SYSTEM_PROMPT.slice(0, 120) + "...",
    });

    startTransition(async () => {
      try {
        const res = await registrarClaraAction();
        console.log("[DeskcommCRM Front-end] 📥 Resposta recebida da Server Action:", res);

        if (res.ok) {
          console.log("[DeskcommCRM Front-end] ✅ SUCESSO! Agente registrada:", res.data || res);
          toast.success(res.message || "Agente Clara registrada e publicada com sucesso!");
          setStatusLog({
            tipo: "sucesso",
            mensagem: `Agente Clara ${res.actionTaken === "created" ? "criada" : "atualizada"} com sucesso! Versão publicada ativa.`,
            detalhes: res,
          });
          router.refresh();
          onSuccess?.();
        } else {
          console.error("[DeskcommCRM Front-end] ❌ ERRO retornado pela Server Action:", res);
          toast.error(res.message || "Falha ao registrar agente Clara.");
          setStatusLog({
            tipo: "erro",
            mensagem: `Erro (${res.error || "falha"}): ${res.message}`,
            detalhes: res.details,
          });
        }
      } catch (err: unknown) {
        const errorObj = err as Record<string, unknown>;
        console.error("[DeskcommCRM Front-end] 💥 EXCEÇÃO disparada na chamada:", err);
        toast.error("Erro inesperado na chamada do servidor. Verifique o console.");
        setStatusLog({
          tipo: "erro",
          mensagem: `Exceção: ${errorObj?.message || String(err)}`,
          detalhes: err,
        });
      } finally {
        console.log("-------------------------------------------------------------------");
      }
    });
  };

  const handleTestarViaApiRoute = async () => {
    console.log("[DeskcommCRM Front-end] 🌐 Disparando fetch direto para /api/v1/ai/agents/clara...");
    try {
      const response = await fetch("/api/v1/ai/agents/clara", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await response.json();
      console.log(`[DeskcommCRM Front-end] 📡 Status HTTP: ${response.status}`, data);

      if (response.ok && data.ok) {
        toast.success("API Route respondeu com sucesso! Agente Clara sincronizada.");
        setStatusLog({
          tipo: "sucesso",
          mensagem: "Sincronizado via rota de API REST (/api/v1/ai/agents/clara).",
          detalhes: data,
        });
        router.refresh();
        onSuccess?.();
      } else {
        toast.error(data.message || "Erro na API Route.");
        setStatusLog({
          tipo: "erro",
          mensagem: `API Route retornou erro HTTP ${response.status}: ${data.message || JSON.stringify(data)}`,
          detalhes: data,
        });
      }
    } catch (err: unknown) {
      console.error("[DeskcommCRM Front-end] 💥 Erro no fetch da API Route:", err);
      toast.error("Erro ao comunicar com a rota de API.");
    }
  };

  return (
    <Card className={`overflow-hidden border border-border/80 bg-surface-elevated/50 p-5 shadow-xs ${className ?? ""}`}>
      <div className="flex flex-col gap-4">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-accent/15 text-accent">
              <Sparkle size={22} weight="fill" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-text text-base">Agente Clara</h3>
                <span className="rounded-full bg-accent-soft px-2.5 py-0.5 font-medium text-accent text-xs">
                  {CLARA_ROLE}
                </span>
              </div>
              <p className="text-muted-foreground text-xs">
                Recepcionista e Concierge Exclusiva • Studio Sarah Brauz
              </p>
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestarViaApiRoute}
              disabled={isPending}
              className="text-xs"
              title="Testar requisição HTTP via Rota de API Next.js"
            >
              Testar via API REST
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCadastrarViaAction}
              disabled={isPending}
              className="gap-1.5 text-xs font-semibold"
            >
              <ArrowsClockwise
                size={14}
                className={isPending ? "animate-spin" : ""}
                weight="bold"
              />
              {isPending ? "Gravando no Supabase..." : "Criar / Atualizar Clara"}
            </Button>
          </div>
        </div>

        {/* Resumo do System Prompt */}
        <div className="rounded-md border border-border/50 bg-background/50 p-3">
          <div className="mb-1 flex items-center justify-between text-muted-foreground text-xs">
            <span className="font-medium text-text">System Prompt (Comportamento):</span>
            <span>pt-BR</span>
          </div>
          <p className="line-clamp-3 text-muted-foreground text-xs leading-relaxed">
            {CLARA_SYSTEM_PROMPT}
          </p>
        </div>

        {/* Console / Status Log */}
        {statusLog.tipo !== "idle" && (
          <div
            className={`flex items-start gap-2 rounded-md p-3 text-xs ${
              statusLog.tipo === "sucesso"
                ? "border border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-400"
                : "border border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400"
            }`}
          >
            {statusLog.tipo === "sucesso" ? (
              <CheckCircle size={16} className="mt-0.5 shrink-0" weight="fill" />
            ) : (
              <Warning size={16} className="mt-0.5 shrink-0" weight="fill" />
            )}
            <div className="flex-1">
              <p className="font-medium">{statusLog.mensagem}</p>
              {statusLog.detalhes != null ? (
                <details className="mt-1 cursor-pointer">
                  <summary className="text-[11px] opacity-80 hover:opacity-100">
                    Ver detalhes do payload
                  </summary>
                  <pre className="mt-1 max-h-36 overflow-auto rounded bg-black/20 p-2 font-mono text-[10px]">
                    {JSON.stringify(statusLog.detalhes, null, 2)}
                  </pre>
                </details>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
