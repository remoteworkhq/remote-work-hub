"use client";
import { AgentChat, createAgentChat } from "@21st-sdk/nextjs";
import { useChat } from "@ai-sdk/react";
import { useMemo } from "react";

export default function AgentChatClient({ sandboxId }: { sandboxId: string }) {
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

  return (
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
  );
}
