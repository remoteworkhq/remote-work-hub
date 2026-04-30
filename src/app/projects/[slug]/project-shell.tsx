"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
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
  const [pollTick, setPollTick] = useState(0);

  // Trigger spawn on mount (idempotent on backend).
  useEffect(() => {
    if (!session && state !== "spawning") {
      void getOrCreate(slug).catch(() => {
        // error surfaced via context
      });
    }
  }, [slug, session, state, getOrCreate]);

  // While spawning, light heartbeat so UI re-renders if the spawn succeeds via another tab
  useEffect(() => {
    if (session) return;
    const id = setInterval(() => setPollTick((t) => t + 1), 1500);
    return () => clearInterval(id);
  }, [session]);

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

  if (!session) {
    return (
      <main className="min-h-dvh flex items-center justify-center">
        <div className="text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-amber/80">
            spinning up
          </p>
          <h1 className="mt-3 font-display text-3xl italic text-paper">
            {slug}
          </h1>
          <p className="mt-2 text-sm text-paper-dim">
            cloning {repo} into a fresh sandbox…
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
          <span className="hidden">{pollTick}</span>
        </div>
      </main>
    );
  }

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
