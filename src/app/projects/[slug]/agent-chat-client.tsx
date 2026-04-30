"use client";
import { createAgentChat } from "@21st-sdk/nextjs";
import { useChat } from "@ai-sdk/react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp, Loader2, Square } from "lucide-react";
import Link from "next/link";
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

type Props = {
  sandboxId: string;
  slug: string;
  repo: string;
};

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

function ToolCard({ name, cmd, output, state }: {
  name: string;
  cmd: string;
  output: string;
  state?: string;
}) {
  const [open, setOpen] = useState(true);
  const isRunning = state && state !== "output-available" && state !== "result";

  return (
    <div className="my-3 border border-rule-soft/60 bg-ink-2/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-ink-3/40 transition-colors text-left"
      >
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full shrink-0",
            isRunning ? "bg-amber pulse-dot" : "bg-emerald-soft/80",
          )}
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-amber/80">
          {name}
        </span>
        <span className="font-mono text-[11px] text-paper-faint flex-1 truncate">
          {cmd.split("\n")[0].slice(0, 80)}
        </span>
        <span className="font-mono text-[10px] text-paper-faint">
          {open ? "−" : "+"}
        </span>
      </button>
      {open && (
        <>
          <pre className="px-3 py-2 font-mono text-[12px] text-paper/90 whitespace-pre-wrap break-all border-t border-rule-soft/40">
            <span className="text-amber/70">$</span> {cmd}
          </pre>
          {output && (
            <pre className="px-3 py-2 font-mono text-[12px] text-paper-dim whitespace-pre-wrap break-all border-t border-rule-soft/40 max-h-72 overflow-y-auto">
              {output.slice(0, 8000)}
            </pre>
          )}
        </>
      )}
    </div>
  );
}

function MessagePart({ part }: { part: Part }) {
  if (part.type === "text") {
    return (
      <p className="whitespace-pre-wrap leading-relaxed text-paper">
        {part.text}
      </p>
    );
  }
  if (typeof part.type === "string" && part.type.startsWith("tool-")) {
    const name = part.type.slice(5);
    const input = part.input ?? {};
    const cmd =
      typeof input.command === "string" ? input.command : JSON.stringify(input);
    const output = part.output;
    const outputText =
      typeof output === "string"
        ? output
        : output && typeof output === "object"
          ? (output as { text?: string }).text ?? JSON.stringify(output, null, 2)
          : "";
    return (
      <ToolCard
        name={name}
        cmd={cmd}
        output={outputText}
        state={part.state}
      />
    );
  }
  return null;
}

type UIMessage = {
  id: string;
  role: string;
  parts?: Part[];
};

function MessageRow({
  message,
  index,
}: {
  message: UIMessage;
  index: number;
}) {
  const isUser = message.role === "user";
  const parts = message.parts ?? [];
  const label = isUser ? "you" : "agent";

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "py-6 grid w-full",
        isUser ? "justify-items-end" : "justify-items-start",
      )}
    >
      <div
        className={cn(
          "w-full max-w-[68ch]",
          isUser
            ? "border-r-2 border-amber/60 pr-5 text-right"
            : "border-l-2 border-amber/40 pl-5",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.28em]",
            isUser ? "justify-end text-amber/80" : "justify-start text-amber/80",
          )}
        >
          <span>{label}</span>
          <span className="text-paper-faint">·</span>
          <span className="text-paper-faint tabular-nums">
            {String(index + 1).padStart(2, "0")}
          </span>
        </div>
        <div className={cn("mt-3 space-y-2 text-[15px]", isUser && "text-right")}>
          {parts.map((p, i) => (
            <MessagePart key={i} part={p} />
          ))}
        </div>
      </div>
    </motion.article>
  );
}

function ThinkingRow() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="py-6 grid justify-items-start"
    >
      <div className="border-l-2 border-amber/40 pl-5 max-w-[68ch]">
        <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-amber/80">
          agent
        </div>
        <div className="mt-3 flex items-center gap-2 text-paper-dim text-sm">
          <span className="italic font-display">thinking</span>
          <span className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="w-1 h-1 rounded-full bg-amber/70"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  delay: i * 0.15,
                }}
              />
            ))}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

export default function AgentChatClient({ sandboxId, slug, repo }: Props) {
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
  const { ref: textareaRef, adjust } = useAutoResizeTextarea(56, 200);

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

  // Auto-scroll to latest
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, status]);

  // Sandbox cleanup on close
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

  // Auto-push when streaming -> ready
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
    if (!text || status === "streaming" || status === "submitted") return;
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
  const isSubmitted = status === "submitted";
  const lastMsg = messages[messages.length - 1];
  // Show thinking only when waiting and last message is from user
  // (avoids duplicating with the streaming assistant bubble)
  const showThinking = isSubmitted && lastMsg?.role === "user";
  const sandboxShort = sandboxId.split("-")[0];

  return (
    <div className="min-h-dvh flex flex-col">
      {/* HEADER */}
      <header className="border-b border-rule-soft/60 sticky top-0 z-20 backdrop-blur-xl bg-ink/70">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-10 py-5 flex items-center gap-6">
          <Link
            href="/"
            className="font-mono text-[10px] uppercase tracking-[0.28em] text-paper-faint hover:text-amber transition-colors shrink-0"
          >
            ← hub
          </Link>
          <div className="h-8 w-px bg-rule-soft" />
          <div className="flex-1 min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-amber/80">
              project
            </p>
            <h1 className="mt-0.5 font-display text-2xl text-paper truncate">
              {slug}
            </h1>
          </div>
          <div className="hidden md:flex items-center gap-6 shrink-0">
            <a
              href={`https://github.com/${repo}`}
              target="_blank"
              rel="noreferrer"
              className="text-right group"
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-paper-faint group-hover:text-amber transition-colors">
                repo
              </p>
              <p className="mt-0.5 font-mono text-xs text-paper-dim group-hover:text-paper transition-colors">
                {repo}
              </p>
            </a>
            <div className="text-right">
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-paper-faint">
                sandbox
              </p>
              <p className="mt-0.5 font-mono text-xs text-paper-dim flex items-center gap-1.5 justify-end">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-soft pulse-dot" />
                {sandboxShort}…
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => runPush(false)}
              disabled={pushing}
              title="Push (auto-push runs after each agent turn)"
              className="font-mono text-[11px] uppercase tracking-[0.2em] px-3 py-2 bg-amber text-ink hover:bg-amber-2 transition-colors disabled:opacity-50"
            >
              {pushing ? "pushing…" : "push"}
            </button>
            <button
              type="button"
              onClick={handleEnd}
              disabled={ending}
              className="font-mono text-[11px] uppercase tracking-[0.2em] px-3 py-2 border border-rule hover:border-amber/60 hover:text-amber transition-colors disabled:opacity-50"
            >
              {ending ? "ending…" : "end"}
            </button>
          </div>
        </div>
      </header>

      {/* PUSH RESULT */}
      <AnimatePresence>
        {pushResult && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className={cn(
              "border-b overflow-hidden",
              pushOk
                ? "border-emerald-soft/40 bg-emerald-soft/[0.05]"
                : "border-rose-soft/40 bg-rose-soft/[0.05]",
            )}
          >
            <div className="max-w-[1280px] mx-auto px-6 lg:px-10 py-3 flex items-start gap-4">
              <span
                className={cn(
                  "font-mono text-[10px] uppercase tracking-[0.28em] mt-0.5 shrink-0",
                  pushOk ? "text-emerald-soft" : "text-rose-soft",
                )}
              >
                {pushOk ? "✓ pushed" : `✗ exit ${pushResult.exitCode}`}
              </span>
              <pre className="font-mono text-[11px] text-paper-dim whitespace-pre-wrap break-all flex-1">
                {pushResult.stdout}
                {pushResult.stderr && `\n${pushResult.stderr}`}
              </pre>
              <button
                type="button"
                onClick={() => setPushResult(null)}
                className="font-mono text-[10px] uppercase tracking-[0.2em] text-paper-faint hover:text-paper transition-colors shrink-0"
              >
                dismiss
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CHAT FEED — full width, scroll inside */}
      <section
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
      >
        <div className="max-w-[1280px] mx-auto px-6 lg:px-10 divide-y divide-rule-soft/30">
          {messages.length === 0 && !showThinking && (
            <div className="py-24 text-center">
              <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-amber/80">
                ready
              </p>
              <h2 className="mt-3 font-display text-3xl italic text-paper-dim">
                What should the agent do?
              </h2>
              <p className="mt-3 text-sm text-paper-faint max-w-md mx-auto">
                Sandbox spun up, repo cloned to{" "}
                <code className="font-mono text-paper-dim">./project</code>.
                Anything you commit auto-pushes when the turn finishes.
              </p>
            </div>
          )}
          {messages.map((m, i) => (
            <MessageRow
              key={m.id}
              message={m as unknown as UIMessage}
              index={i}
            />
          ))}
          <AnimatePresence>{showThinking && <ThinkingRow />}</AnimatePresence>
          {error && (
            <div className="py-6 max-w-[68ch]">
              <div className="border-l-2 border-rose-soft pl-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-rose-soft">
                  error
                </p>
                <p className="mt-2 text-sm text-paper-dim">{error.message}</p>
              </div>
            </div>
          )}
          <div className="h-32" />
        </div>
      </section>

      {/* INPUT DOCK */}
      <div className="sticky bottom-0 z-10 border-t border-rule-soft/60 bg-ink/85 backdrop-blur-xl">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-10 py-4">
          <div
            className={cn(
              "flex items-end gap-3 border bg-ink-2/40 transition-colors",
              inputFocused ? "border-amber/40" : "border-rule",
            )}
          >
            <div className="font-mono text-amber/80 text-sm pl-4 pt-4 select-none">
              ›
            </div>
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
              placeholder="Tell the agent what to change…"
              className="flex-1 resize-none bg-transparent border-none text-paper text-[15px] placeholder:text-paper-faint focus:outline-none py-4 min-h-[56px]"
              style={{ overflow: "hidden" }}
            />
            <div className="p-2">
              {isStreaming ? (
                <motion.button
                  type="button"
                  onClick={() => stop()}
                  whileTap={{ scale: 0.96 }}
                  className="px-3 py-2 font-mono text-[11px] uppercase tracking-[0.2em] bg-rule text-paper hover:bg-rule-soft transition-colors flex items-center gap-2"
                >
                  <Square className="w-3 h-3" />
                  stop
                </motion.button>
              ) : (
                <motion.button
                  type="button"
                  onClick={submit}
                  whileTap={{ scale: 0.96 }}
                  disabled={!input.trim() || isSubmitted}
                  className={cn(
                    "px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] flex items-center gap-2 transition-all",
                    input.trim() && !isSubmitted
                      ? "bg-amber text-ink hover:bg-amber-2"
                      : "bg-rule-soft text-paper-faint",
                  )}
                >
                  {isSubmitted ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ArrowUp className="w-3.5 h-3.5" />
                  )}
                  send
                </motion.button>
              )}
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.22em] text-paper-faint">
            <span>enter sends · shift+enter newline</span>
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  isStreaming
                    ? "bg-amber pulse-dot"
                    : isSubmitted
                      ? "bg-amber pulse-dot"
                      : "bg-emerald-soft/70",
                )}
              />
              {isStreaming
                ? "streaming"
                : isSubmitted
                  ? "queued"
                  : "ready"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
