"use client";
import Link from "next/link";
import { useSessions } from "@/components/session-provider";
import AgentChatClient from "./agent-chat-client";

export default function ProjectShell({
  slug,
  repo,
}: {
  slug: string;
  repo: string;
}) {
  const { getOrCreate, getSession, spawnStates, errors } = useSessions();
  const session = getSession(slug);
  const state = spawnStates[slug];
  const error = errors[slug];

  if (error) {
    return (
      <main className="min-h-dvh max-w-3xl mx-auto px-8 py-16">
        <Link
          href="/"
          className="font-mono text-[11px] uppercase tracking-[0.28em] text-paper-faint hover:text-amber transition-colors"
        >
          ← back
        </Link>
        <h1 className="mt-6 font-display text-4xl text-paper">{slug}</h1>
        <div className="mt-8 border border-rose-soft/40 bg-rose-soft/[0.05] p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-rose-soft mb-2">
            spawn failed
          </p>
          <p className="text-paper whitespace-pre-wrap">{error}</p>
          <button
            type="button"
            onClick={() => getOrCreate(slug).catch(() => {})}
            className="mt-4 font-mono text-[11px] uppercase tracking-[0.2em] px-3 py-2 bg-amber text-ink"
          >
            retry
          </button>
        </div>
      </main>
    );
  }

  if (session && session.status === "ready") {
    return (
      <AgentChatClient
        key={session.sandboxId}
        sandboxId={session.sandboxId}
        threadId={session.threadId}
        slug={slug}
        repo={repo}
      />
    );
  }

  const spawning = state === "spawning" || state === "preparing" || session?.status === "spawning";

  if (spawning) {
    const phase =
      state === "preparing" || session?.status === "spawning"
        ? "cloning repo"
        : "spinning up";
    return (
      <main className="min-h-dvh flex items-center justify-center">
        <div className="text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-amber/80">
            {phase}
          </p>
          <h1 className="mt-3 font-display text-3xl italic text-paper">
            {slug}
          </h1>
          <p className="mt-2 text-sm text-paper-dim">
            {phase === "cloning repo"
              ? `pulling ${repo} into the sandbox…`
              : `requesting a fresh sandbox…`}
          </p>
          <div className="mt-6 flex justify-center gap-1.5" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-amber/70"
                style={{
                  animation: `pulse-dot 1.2s ease-in-out ${i * 0.15}s infinite`,
                }}
              />
            ))}
          </div>
        </div>
      </main>
    );
  }

  // Idle — no auto-spawn. User must explicitly start a sandbox.
  return (
    <main className="min-h-dvh max-w-3xl mx-auto px-8 py-16">
      <Link
        href="/"
        className="font-mono text-[11px] uppercase tracking-[0.28em] text-paper-faint hover:text-amber transition-colors"
      >
        ← back
      </Link>
      <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.32em] text-paper-faint">
        Project · idle
      </p>
      <h1 className="mt-2 font-display text-4xl italic text-paper">{slug}</h1>
      <p className="mt-2 text-sm text-paper-dim">
        Repo: <span className="font-mono text-paper">{repo}</span>
      </p>
      <p className="mt-6 max-w-md text-sm text-paper-dim leading-relaxed">
        No active sandbox. Click below to spin one up — sandboxes cost money
        while alive, so we don&apos;t auto-start them on every page load.
      </p>
      <button
        type="button"
        onClick={() => getOrCreate(slug).catch(() => {})}
        className="mt-6 font-mono text-[11px] uppercase tracking-[0.2em] px-4 py-2 bg-amber text-ink hover:bg-amber/90 transition-colors"
      >
        Start sandbox →
      </button>
    </main>
  );
}
