"use client";
import { createAgentChat } from "@21st-sdk/nextjs";
import { useChat } from "@ai-sdk/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUp,
  Download,
  FileText,
  ImageIcon,
  Loader2,
  Paperclip,
  Square,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSessions } from "@/components/session-provider";
import { cn } from "@/lib/utils";

type PushResult = { exitCode: number; stdout: string; stderr: string };

type Attachment = {
  filename: string;
  path: string;
  size: number;
  type: string;
};

type DownloadFile = {
  name: string;
  size: number;
  mtime: number;
  path: string;
};

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Props = {
  sandboxId: string;
  threadId: string | null;
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

function ToolCard({
  name,
  cmd,
  output,
  state,
}: {
  name: string;
  cmd: string;
  output: string;
  state?: string;
}) {
  const [open, setOpen] = useState(true);
  const isRunning =
    state && state !== "output-available" && state !== "result";

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

function extractText(part: Part): string {
  // Try common shapes the AI SDK / 21st might emit.
  const p = part as unknown as Record<string, unknown>;
  if (typeof p.text === "string") return p.text;
  if (typeof p.content === "string") return p.content;
  if (Array.isArray(p.content)) {
    return (p.content as Array<{ text?: string; type?: string }>)
      .filter((c) => c?.type === "text" || typeof c?.text === "string")
      .map((c) => c.text ?? "")
      .join("");
  }
  return "";
}

function MessagePart({ part }: { part: Part }) {
  const t = part.type;

  // Reasoning / step parts: render as italic muted (Claude thinking blocks)
  if (t === "reasoning" || t === "thinking") {
    const text = extractText(part);
    if (!text) return null;
    return (
      <p className="text-[13px] italic text-paper-faint whitespace-pre-wrap leading-relaxed">
        {text}
      </p>
    );
  }

  // Step markers — emit nothing visible (they're stream control)
  if (t === "step-start" || t === "step-end" || t === "data") return null;

  // Tool calls (any tool-*)
  if (typeof t === "string" && t.startsWith("tool-")) {
    const name = t.slice(5);
    const input = part.input ?? {};
    const cmd =
      typeof input.command === "string"
        ? input.command
        : Object.keys(input).length > 0
          ? JSON.stringify(input)
          : "";
    const output = part.output;
    const outputText =
      typeof output === "string"
        ? output
        : output && typeof output === "object"
          ? (output as { text?: string; stdout?: string; output?: string })
              .text ??
            (output as { stdout?: string }).stdout ??
            JSON.stringify(output, null, 2)
          : "";
    return (
      <ToolCard
        name={name}
        cmd={cmd || "(no input)"}
        output={outputText}
        state={part.state}
      />
    );
  }

  // Default: try to render any text-like content
  const text = extractText(part);
  if (text) {
    return (
      <p className="whitespace-pre-wrap leading-relaxed text-paper">{text}</p>
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
    <article
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
    </article>
  );
}

function ThinkingRow() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
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

export default function AgentChatClient({
  sandboxId,
  threadId,
  slug,
  repo,
}: Props) {
  const router = useRouter();
  const { end: endSession, recordThread } = useSessions();
  const [ending, setEnding] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<PushResult | null>(null);
  const [autoPush, setAutoPush] = useState(true);
  const draftKey = `rwh.draft.${slug}`;
  const [input, setInput] = useState<string>("");
  const [inputFocused, setInputFocused] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [downloads, setDownloads] = useState<DownloadFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastAutoPushedAtRef = useRef<number>(0);
  const prevStatusRef = useRef<string>("ready");
  const recordedThreadIdRef = useRef<string | null>(threadId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { ref: textareaRef, adjust } = useAutoResizeTextarea(56, 200);

  const chat = useMemo(
    () =>
      createAgentChat({
        agent: "hub-tester",
        tokenUrl: "/api/an-token",
        sandboxId,
        ...(threadId ? { threadId } : {}),
      }),
    [sandboxId, threadId],
  );

  const { messages, setMessages, status, stop, error, sendMessage } = useChat(
    { chat },
  );
  const [hydrated, setHydrated] = useState(false);

  // Restore input draft on mount (per-slug). Survives nav / session death.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) setInput(saved);
    } catch {}
  }, [draftKey]);

  // Persist draft on every change. Empty string clears it.
  useEffect(() => {
    try {
      if (input) localStorage.setItem(draftKey, input);
      else localStorage.removeItem(draftKey);
    } catch {}
  }, [input, draftKey]);

  // Auto-scroll (instant — smooth scroll added perceived lag)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, status]);

  // Hydrate prior chat on mount — always shows, regardless of how this
  // session was reached. Input is disabled (see `submit`/render below) until
  // hydration completes, so we never race a typed message against the seed.
  useEffect(() => {
    if (hydrated) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/sessions/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug }),
        });
        if (!r.ok || cancelled) return;
        const data = (await r.json()) as { messages?: unknown };
        if (cancelled) return;
        if (Array.isArray(data.messages) && data.messages.length > 0) {
          setMessages(
            data.messages as Parameters<typeof setMessages>[0],
          );
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, hydrated, setMessages]);

  // Hush unused-warning when threadId not used elsewhere
  void recordedThreadIdRef;
  void recordThread;

  const runPush = useCallback(
    async (auto: boolean): Promise<PushResult> => {
      setPushing(true);
      if (!auto) setPushResult(null);
      try {
        const r = await fetch(`/api/sessions/push`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug }),
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
    [slug],
  );

  // After each agent turn, list any new downloads the agent placed in /home/user/downloads/
  useEffect(() => {
    if (status !== "ready") return;
    void (async () => {
      try {
        const r = await fetch("/api/sessions/downloads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug }),
        });
        if (!r.ok) return;
        const data = (await r.json()) as { files?: DownloadFile[] };
        setDownloads(data.files ?? []);
      } catch {}
    })();
  }, [status, messages.length, slug]);

  // Persist transcript on every turn end so chat survives sandbox death.
  // Fires whenever messages.length grows after streaming completes.
  const lastPersistedLengthRef = useRef(0);
  useEffect(() => {
    if (status !== "ready") return;
    if (messages.length === 0) return;
    if (messages.length === lastPersistedLengthRef.current) return;
    lastPersistedLengthRef.current = messages.length;
    void fetch("/api/sessions/transcript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, messages }),
    }).catch(() => {});
  }, [status, messages, slug]);

  // Auto-push only when last reply mentioned repo work
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (
      autoPush &&
      prev === "streaming" &&
      status === "ready" &&
      messages.length > 0
    ) {
      const last = messages[messages.length - 1] as unknown as UIMessage;
      const text = (last?.parts ?? [])
        .map((p) => {
          if (p.type === "text") return p.text ?? "";
          if (typeof p.type === "string" && p.type.startsWith("tool-")) {
            const cmd =
              (p.input as { command?: string } | undefined)?.command ?? "";
            return cmd;
          }
          return "";
        })
        .join(" ")
        .toLowerCase();
      const touchedRepo = /\bcommit\b|\bgit\s+(?:add|commit|push|merge|rebase)\b|\b(?:wrote|edited|modified|created|deleted|updated)\b/.test(
        text,
      );
      if (!touchedRepo) return;
      const now = Date.now();
      if (now - lastAutoPushedAtRef.current > 2000) {
        lastAutoPushedAtRef.current = now;
        void runPush(true);
      }
    }
  }, [status, messages.length, runPush, autoPush]);

  const handleEnd = async () => {
    setEnding(true);
    try {
      await endSession(slug);
    } finally {
      router.push("/");
    }
  };

  const submit = () => {
    const text = input.trim();
    if (!text && attachments.length === 0) return;
    if (status === "streaming" || status === "submitted" || !hydrated) return;
    let payload = text;
    if (attachments.length > 0) {
      const list = attachments
        .map(
          (a) =>
            `- ${a.filename} (${fmtSize(a.size)}, ${a.type}) at ${a.path}`,
        )
        .join("\n");
      payload = `Attached files (already uploaded to the sandbox):\n${list}\n\n${text}`.trim();
    }
    void sendMessage({ text: payload });
    setInput("");
    setAttachments([]);
    try {
      localStorage.removeItem(draftKey);
    } catch {}
    adjust(true);
  };

  const handleAttachClick = () => fileInputRef.current?.click();

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (e.target) e.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        const r = await fetch(`/api/sessions/upload?slug=${encodeURIComponent(slug)}`, {
          method: "POST",
          body: fd,
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          alert(`Upload failed: ${d.error || r.statusText}`);
          continue;
        }
        const data = (await r.json()) as Attachment & { ok: boolean };
        setAttachments((prev) => [
          ...prev,
          {
            filename: data.filename,
            path: data.path,
            size: data.size,
            type: data.type,
          },
        ]);
      }
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (path: string) => {
    setAttachments((prev) => prev.filter((a) => a.path !== path));
  };

  const fileUrl = (path: string, inline = false) =>
    `/api/sessions/file?slug=${encodeURIComponent(slug)}&path=${encodeURIComponent(path)}${inline ? "&inline=1" : ""}`;

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const pushOk = pushResult?.exitCode === 0;
  const isStreaming = status === "streaming";
  const isSubmitted = status === "submitted";
  const lastMsg = messages[messages.length - 1] as unknown as
    | UIMessage
    | undefined;
  const lastAssistantHasText = (lastMsg?.parts ?? []).some(
    (p) => p.type === "text" && (p.text ?? "").length > 0,
  );
  const showThinking =
    (isSubmitted && lastMsg?.role === "user") ||
    (isStreaming &&
      (lastMsg?.role !== "assistant" || !lastAssistantHasText));
  const sandboxShort = sandboxId.split("-")[0];

  return (
    <div className="min-h-dvh flex flex-col">
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
              onClick={() => setAutoPush((v) => !v)}
              title={
                autoPush
                  ? "Auto-push is on after each turn"
                  : "Auto-push is off — push manually with the Push button"
              }
              className={cn(
                "font-mono text-[11px] uppercase tracking-[0.2em] px-3 py-2 border transition-colors flex items-center gap-2",
                autoPush
                  ? "border-amber/40 text-amber"
                  : "border-rule text-paper-faint hover:border-paper-faint",
              )}
            >
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  autoPush ? "bg-amber pulse-dot" : "bg-paper-faint/60",
                )}
              />
              auto
            </button>
            <button
              type="button"
              onClick={() => runPush(false)}
              disabled={pushing}
              title="Push manually now"
              className="font-mono text-[11px] uppercase tracking-[0.2em] px-3 py-2 bg-amber text-ink hover:bg-amber-2 transition-colors disabled:opacity-50"
            >
              {pushing ? "pushing…" : "push"}
            </button>
            <button
              type="button"
              onClick={handleEnd}
              disabled={ending}
              className="font-mono text-[11px] uppercase tracking-[0.2em] px-3 py-2 border border-rule hover:border-rose-soft/60 hover:text-rose-soft transition-colors disabled:opacity-50"
            >
              {ending ? "ending…" : "end"}
            </button>
          </div>
        </div>
      </header>

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
            // Auto-dismiss successful pushes after 4s so they don't pile up
            onAnimationComplete={() => {
              if (pushOk) {
                window.setTimeout(() => setPushResult(null), 4000);
              }
            }}
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
              <pre className="font-mono text-[11px] text-paper-dim whitespace-pre-wrap break-all flex-1 max-h-32 overflow-y-auto">
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

      <AnimatePresence>
        {downloads.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-b border-rule-soft/60 bg-amber/[0.02] overflow-hidden"
          >
            <div className="max-w-[1280px] mx-auto px-6 lg:px-10 py-3 flex items-start gap-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-amber/80 mt-0.5 shrink-0">
                Downloads
              </p>
              <div className="flex-1 flex flex-wrap gap-2">
                {downloads.map((f) => {
                  const isImg = IMAGE_EXT.test(f.name);
                  return (
                    <a
                      key={f.path}
                      href={fileUrl(f.path)}
                      download={f.name}
                      className="group flex items-center gap-2 px-3 py-1.5 border border-rule hover:border-amber/60 hover:bg-amber/[0.04] transition-colors"
                    >
                      {isImg ? (
                        <ImageIcon className="w-3.5 h-3.5 text-amber/70" />
                      ) : (
                        <FileText className="w-3.5 h-3.5 text-amber/70" />
                      )}
                      <span className="text-xs text-paper">{f.name}</span>
                      <span className="font-mono text-[10px] text-paper-faint">
                        {fmtSize(f.size)}
                      </span>
                      <Download className="w-3 h-3 text-paper-faint group-hover:text-amber transition-colors" />
                    </a>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <section ref={scrollRef} className="flex-1 overflow-y-auto">
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
                Anything the agent commits auto-pushes when the turn finishes.
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

      <div className="sticky bottom-0 z-10 border-t border-rule-soft/60 bg-ink/85 backdrop-blur-xl">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-10 py-4">
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((a) => {
                const isImg = IMAGE_EXT.test(a.filename);
                return (
                  <div
                    key={a.path}
                    className="flex items-center gap-2 px-2.5 py-1.5 border border-amber/40 bg-amber/[0.05]"
                  >
                    {isImg ? (
                      <ImageIcon className="w-3.5 h-3.5 text-amber" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 text-amber" />
                    )}
                    <span className="text-xs text-paper">{a.filename}</span>
                    <span className="font-mono text-[10px] text-paper-faint">
                      {fmtSize(a.size)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(a.path)}
                      className="text-paper-faint hover:text-rose-soft"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div
            className={cn(
              "flex items-end gap-3 border bg-ink-2/40 transition-colors",
              inputFocused ? "border-amber/40" : "border-rule",
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={handleFileSelected}
            />
            <button
              type="button"
              onClick={handleAttachClick}
              disabled={uploading || !hydrated}
              title="Attach files (uploaded into the sandbox; agent can read them)"
              className="pl-3 pt-3.5 text-paper-faint hover:text-amber transition-colors disabled:opacity-40"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Paperclip className="w-4 h-4" />
              )}
            </button>
            <div className="font-mono text-amber/80 text-sm pt-4 select-none">
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
              placeholder={
                hydrated
                  ? "Tell the agent what to change…"
                  : "Loading prior chat…"
              }
              disabled={!hydrated}
              className="flex-1 resize-none bg-transparent border-none text-paper text-[15px] placeholder:text-paper-faint focus:outline-none py-4 min-h-[56px] disabled:opacity-50"
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
            <span>enter sends · shift+enter newline · session persists across nav</span>
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  isStreaming || isSubmitted
                    ? "bg-amber pulse-dot"
                    : "bg-emerald-soft/70",
                )}
              />
              {isStreaming ? "streaming" : isSubmitted ? "queued" : "ready"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
