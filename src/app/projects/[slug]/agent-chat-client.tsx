"use client";
import { AgentChat, createAgentChat } from "@21st-sdk/nextjs";
import { useChat } from "@ai-sdk/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type PushResult = { exitCode: number; stdout: string; stderr: string };

export default function AgentChatClient({ sandboxId }: { sandboxId: string }) {
  const router = useRouter();
  const [ending, setEnding] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<PushResult | null>(null);
  const closedRef = useRef(false);

  const chat = useMemo(
    () =>
      createAgentChat({
        agent: "hub-tester",
        tokenUrl: "/api/an-token",
        sandboxId,
      }),
    [sandboxId],
  );

  const { messages, status, stop, error, sendMessage } = useChat({ chat });

  useEffect(() => {
    const beacon = () => {
      if (closedRef.current) return;
      closedRef.current = true;
      navigator.sendBeacon(`/api/close-sandbox?id=${sandboxId}`);
    };
    window.addEventListener("beforeunload", beacon);
    window.addEventListener("pagehide", beacon);
    return () => {
      window.removeEventListener("beforeunload", beacon);
      window.removeEventListener("pagehide", beacon);
      beacon();
    };
  }, [sandboxId]);

  const handleEnd = async () => {
    if (closedRef.current) {
      router.push("/");
      return;
    }
    setEnding(true);
    closedRef.current = true;
    try {
      await fetch(`/api/close-sandbox?id=${sandboxId}`, { method: "POST" });
    } catch {}
    router.push("/");
  };

  const handlePush = async () => {
    setPushing(true);
    setPushResult(null);
    try {
      const r = await fetch(`/api/push-sandbox?id=${sandboxId}`, { method: "POST" });
      const data = (await r.json()) as PushResult | { error: string };
      if ("error" in data) {
        setPushResult({ exitCode: -1, stdout: "", stderr: data.error });
      } else {
        setPushResult(data);
      }
    } catch (e) {
      setPushResult({
        exitCode: -1,
        stdout: "",
        stderr: e instanceof Error ? e.message : "fetch failed",
      });
    } finally {
      setPushing(false);
    }
  };

  const pushOk = pushResult?.exitCode === 0;

  return (
    <>
      <div className="flex justify-between items-center mb-3 gap-2">
        <button
          type="button"
          onClick={handlePush}
          disabled={pushing}
          className="text-sm rounded-md bg-zinc-100 text-zinc-900 px-3 py-1.5 font-medium hover:bg-white transition disabled:opacity-50"
        >
          {pushing ? "Pushing..." : "Push to GitHub"}
        </button>
        <button
          type="button"
          onClick={handleEnd}
          disabled={ending}
          className="text-sm rounded-md border border-zinc-700 px-3 py-1.5 hover:border-zinc-500 hover:bg-zinc-900/60 transition disabled:opacity-50"
        >
          {ending ? "Ending..." : "End session"}
        </button>
      </div>

      {pushResult && (
        <div
          className={`mb-3 rounded-md border p-3 text-xs font-mono whitespace-pre-wrap ${
            pushOk
              ? "border-emerald-900/60 bg-emerald-950/30 text-emerald-300"
              : "border-red-900/60 bg-red-950/30 text-red-300"
          }`}
        >
          {pushOk ? "✓ pushed\n\n" : `✗ exit ${pushResult.exitCode}\n\n`}
          {pushResult.stdout}
          {pushResult.stderr && `\n${pushResult.stderr}`}
        </div>
      )}

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        <AgentChat
          messages={messages}
          onSend={(message) => {
            void sendMessage({ text: message.content });
          }}
          status={status}
          onStop={stop}
          error={error ?? undefined}
        />
      </div>
    </>
  );
}
