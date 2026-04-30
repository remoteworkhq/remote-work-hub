"use client";
import { AgentChat, createAgentChat } from "@21st-sdk/nextjs";
import { useChat } from "@ai-sdk/react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader, Send, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

type PushResult = { exitCode: number; stdout: string; stderr: string };

function useAutoResizeTextarea(min: number, max: number) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const adjust = useCallback(
    (reset?: boolean) => {
      const el = ref.current;
      if (!el) return;
      if (reset) {
        el.style.height = `${min}px`;
        return;
      }
      el.style.height = `${min}px`;
      el.style.height = `${Math.max(min, Math.min(el.scrollHeight, max))}px`;
    },
    [min, max],
  );
  useEffect(() => {
    if (ref.current) ref.current.style.height = `${min}px`;
  }, [min]);
  return { ref, adjust };
}

type Part = {
  type: string;
  text?: string;
  input?: { command?: string } & Record<string, unknown>;
  output?: unknown;
  state?: string;
};

function MessagePart({ part }: { part: Part }) {
  if (part.type === "text") {
    return <p className="whitespace-pre-wrap leading-relaxed">{part.text}</p>;
  }
  if (typeof part.type === "string" && part.type.startsWith("tool-")) {
    const name = part.type.slice(5);
    const input = part.input ?? {};
    const cmd = input.command || JSON.stringify(input);
    const output = part.output;
    const outputText =
      typeof output === "string"
        ? output
        : output && typeof output === "object"
          ? (output as { text?: string }).text ?? JSON.stringify(output)
          : "";
    const state = part.state;
    return (
      <div className="my-2 rounded-md border border-white/[0.05] bg-black/30 overflow-hidden text-xs">
        <div className="px-3 py-1.5 border-b border-white/[0.05] flex items-center gap-2 text-white/60">
          <span className="font-mono text-[10px] uppercase tracking-wider">
            {name}
          </span>
          {state && state !== "output-available" && (
            <span className="text-white/40 text-[10px]">{state}</span>
          )}
        </div>
        {cmd && (
          <pre className="px-3 py-2 font-mono text-white/80 whitespace-pre-wrap break-all">
            $ {cmd}
          </pre>
        )}
        {outputText && (
          <pre className="px-3 py-2 border-t border-white/[0.05] font-mono text-white/60 whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
            {outputText.slice(0, 4000)}
          </pre>
        )}
      </div>
    );
  }
  return null;
}

type UIMessage = {
  id: string;
  role: string;
  parts?: Part[];
};

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  const parts = message.parts ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
          isUser
            ? "bg-white text-zinc-900 rounded-br-md"
            : "bg-white/[0.04] border border-white/[0.05] text-white/90 rounded-bl-md",
        )}
      >
        {parts.map((p, i) => (
          <MessagePart key={i} part={p} />
        ))}
      </div>
    </motion.div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-1.5 h-1.5 bg-white/70 rounded-full"
          animate={{ opacity: [0.3, 0.9, 0.3], scale: [0.85, 1.1, 0.85] }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

export default function AgentChatClient({ sandboxId }: { sandboxId: string }) {
  const router = useRouter();
  const [ending, setEnding] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<PushResult | null>(null);
  const [input, setInput] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const closedRef = useRef(false);
  const lastAutoPushedAtRef = useRef<number>(0);
  const prevStatusRef = useRef<string>("ready");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { ref: textareaRef, adjust } = useAutoResizeTextarea(60, 200);

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
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, status]);

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

  const runPush = useCallback(
    async (auto: boolean): Promise<PushResult> => {
      setPushing(true);
      if (!auto) setPushResult(null);
      try {
        const r = await fetch(`/api/push-sandbox?id=${sandboxId}`, {
          method: "POST",
        });
        const data = (await r.json()) as PushResult | { error: string };
        const result: PushResult =
          "error" in data
            ? { exitCode: -1, stdout: "", stderr: data.error }
            : data;
        const isNoop =
          result.exitCode === 0 &&
          /Everything up-to-date/i.test(result.stdout + result.stderr);
        if (!auto || !isNoop) setPushResult(result);
        return result;
      } catch (e) {
        const result: PushResult = {
          exitCode: -1,
          stdout: "",
          stderr: e instanceof Error ? e.message : "fetch failed",
        };
        setPushResult(result);
        return result;
      } finally {
        setPushing(false);
      }
    },
    [sandboxId],
  );

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (prev === "streaming" && status === "ready" && messages.length > 0) {
      const now = Date.now();
      if (now - lastAutoPushedAtRef.current > 2000) {
        lastAutoPushedAtRef.current = now;
        void runPush(true);
      }
    }
  }, [status, messages.length, runPush]);

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

  const submit = () => {
    const text = input.trim();
    if (!text || status === "streaming") return;
    void sendMessage({ text });
    setInput("");
    adjust(true);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const pushOk = pushResult?.exitCode === 0;
  const isStreaming = status === "streaming";
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _AgentChat = AgentChat;

  return (
    <div className="relative">
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-500/[0.06] rounded-full blur-[128px] animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-500/[0.06] rounded-full blur-[128px] animate-pulse [animation-delay:700ms]" />
      </div>

      <div className="flex justify-between items-center mb-3 gap-2">
        <button
          type="button"
          onClick={() => runPush(false)}
          disabled={pushing}
          title="Manual push (auto-push runs after each agent turn)"
          className="text-sm rounded-md bg-white text-zinc-900 px-3 py-1.5 font-medium hover:bg-white/90 transition disabled:opacity-50 shadow-lg shadow-white/5"
        >
          {pushing ? "Pushing..." : "Push to GitHub"}
        </button>
        <button
          type="button"
          onClick={handleEnd}
          disabled={ending}
          className="text-sm rounded-md border border-white/[0.08] px-3 py-1.5 hover:border-white/[0.2] hover:bg-white/[0.04] transition disabled:opacity-50"
        >
          {ending ? "Ending..." : "End session"}
        </button>
      </div>

      <AnimatePresence>
        {pushResult && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={cn(
              "mb-3 rounded-md border p-3 text-xs font-mono whitespace-pre-wrap",
              pushOk
                ? "border-emerald-900/60 bg-emerald-950/30 text-emerald-300"
                : "border-red-900/60 bg-red-950/30 text-red-300",
            )}
          >
            {pushOk ? "✓ pushed\n\n" : `✗ exit ${pushResult.exitCode}\n\n`}
            {pushResult.stdout}
            {pushResult.stderr && `\n${pushResult.stderr}`}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] backdrop-blur-2xl shadow-2xl overflow-hidden flex flex-col h-[60vh] min-h-[400px]">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="h-full flex items-center justify-center text-center">
              <div>
                <h2 className="text-lg font-medium tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white/90 to-white/40">
                  Sandbox ready
                </h2>
                <p className="text-sm text-white/40 mt-1">
                  Ask the agent to make a code change.
                </p>
              </div>
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m as unknown as UIMessage} />
          ))}
          {isStreaming && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="bg-white/[0.04] border border-white/[0.05] rounded-2xl rounded-bl-md px-4 py-3">
                <TypingDots />
              </div>
            </motion.div>
          )}
          {error && (
            <div className="rounded-md border border-red-900/40 bg-red-950/30 p-3 text-xs text-red-300">
              {error.message}
            </div>
          )}
        </div>

        <div
          className={cn(
            "border-t border-white/[0.05] transition-colors",
            inputFocused && "bg-white/[0.01]",
          )}
        >
          <div className="p-3">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                adjust();
              }}
              onKeyDown={onKeyDown}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder="Ask the agent..."
              className="w-full resize-none bg-transparent border-none text-white/90 text-sm placeholder:text-white/30 focus:outline-none min-h-[60px]"
              style={{ overflow: "hidden" }}
            />
          </div>
          <div className="px-3 pb-3 flex items-center justify-between">
            <span className="text-[11px] text-white/30">
              Enter to send · Shift+Enter for newline
            </span>
            {isStreaming ? (
              <motion.button
                type="button"
                onClick={() => stop()}
                whileTap={{ scale: 0.96 }}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-white/[0.06] text-white/70 hover:bg-white/[0.1] flex items-center gap-2"
              >
                <Square className="w-3 h-3" />
                Stop
              </motion.button>
            ) : (
              <motion.button
                type="button"
                onClick={submit}
                whileTap={{ scale: 0.96 }}
                disabled={!input.trim()}
                className={cn(
                  "px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-all",
                  input.trim()
                    ? "bg-white text-zinc-900 shadow-lg shadow-white/10"
                    : "bg-white/[0.05] text-white/40",
                )}
              >
                {status === "submitted" ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                Send
              </motion.button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
