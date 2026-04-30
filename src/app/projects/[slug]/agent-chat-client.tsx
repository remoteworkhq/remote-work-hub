"use client";
import { AgentChat, createAgentChat } from "@21st-sdk/nextjs";
import { useChat } from "@ai-sdk/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

export default function AgentChatClient({ sandboxId }: { sandboxId: string }) {
  const router = useRouter();
  const [ending, setEnding] = useState(false);
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
    } catch {
      // best-effort; sandbox will time out anyway
    }
    router.push("/");
  };

  return (
    <>
      <div className="flex justify-end mb-3">
        <button
          type="button"
          onClick={handleEnd}
          disabled={ending}
          className="text-sm rounded-md border border-zinc-700 px-3 py-1.5 hover:border-zinc-500 hover:bg-zinc-900/60 transition disabled:opacity-50"
        >
          {ending ? "Ending..." : "End session"}
        </button>
      </div>
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
