"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type Session = {
  id: string;
  slug: string;
  sandboxId: string;
  threadId: string | null;
  repo: string;
  status: string;
  createdAt: string;
  lastActiveAt: string;
  lastResponseAt: string | null;
};

type SpawnState = "idle" | "spawning" | "preparing" | "ready" | "error";

type Ctx = {
  sessions: Session[];
  spawnStates: Record<string, SpawnState>;
  errors: Record<string, string | null>;
  refresh: () => Promise<void>;
  getOrCreate: (slug: string) => Promise<Session>;
  end: (slug: string) => Promise<void>;
  recordThread: (slug: string, threadId: string) => Promise<void>;
  isActive: (slug: string) => boolean;
  getSession: (slug: string) => Session | undefined;
};

const SessionCtx = createContext<Ctx | null>(null);

const STORAGE_KEY = "rwh.sessions.v1";

function loadCached(): Session[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCached(sessions: Session[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {}
}

async function pollUntilReady(slug: string, signal: AbortSignal): Promise<Session> {
  // Poll fast (every ~1s) for ~40s total
  for (let i = 0; i < 35; i++) {
    if (signal.aborted) throw new Error("cancelled");
    await new Promise((r) => setTimeout(r, i === 0 ? 300 : 1000));
    if (signal.aborted) throw new Error("cancelled");
    const r = await fetch("/api/sessions/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    if (!r.ok) continue;
    const data = await r.json();
    if (data?.status === "ready" && data?.session) {
      return data.session as Session;
    }
    if (data?.status === "missing") {
      throw new Error("Session disappeared during spawn");
    }
  }
  throw new Error("Spawn timed out waiting for workspace clone (40s)");
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = useState<Session[]>(() => loadCached());
  const [spawnStates, setSpawnStates] = useState<Record<string, SpawnState>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const inFlightRef = useRef<Record<string, Promise<Session> | undefined>>({});

  const upsertSession = useCallback((session: Session) => {
    setSessions((prev) => {
      const without = prev.filter((s) => s.slug !== session.slug);
      const next = [session, ...without];
      saveCached(next);
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/sessions");
    if (!r.ok) return;
    const data = (await r.json()) as { sessions: Session[] };
    setSessions(data.sessions);
    saveCached(data.sessions);
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const getOrCreate = useCallback(
    async (slug: string): Promise<Session> => {
      const existingPromise = inFlightRef.current[slug];
      if (existingPromise) return existingPromise;

      const ctrl = new AbortController();
      const promise = (async (): Promise<Session> => {
        setSpawnStates((s) => ({ ...s, [slug]: "spawning" }));
        setErrors((e) => ({ ...e, [slug]: null }));
        try {
          const r = await fetch("/api/sessions/spawn", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slug }),
          });
          const data = await r.json();
          if (!r.ok || !data.session) {
            throw new Error(data.error || "spawn failed");
          }
          let session: Session = data.session;
          upsertSession(session);

          if (session.status !== "ready") {
            setSpawnStates((s) => ({ ...s, [slug]: "preparing" }));
            session = await pollUntilReady(slug, ctrl.signal);
            upsertSession(session);
          }

          setSpawnStates((s) => ({ ...s, [slug]: "ready" }));
          return session;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "spawn failed";
          setSpawnStates((s) => ({ ...s, [slug]: "error" }));
          setErrors((e2) => ({ ...e2, [slug]: msg }));
          throw e;
        } finally {
          inFlightRef.current[slug] = undefined;
        }
      })();
      inFlightRef.current[slug] = promise;
      return promise;
    },
    [upsertSession],
  );

  const end = useCallback(
    async (slug: string) => {
      // Optimistic: remove from UI immediately so the hub doesn't keep showing it.
      const previous = sessions;
      setSessions((prev) => {
        const next = prev.filter((s) => s.slug !== slug);
        saveCached(next);
        return next;
      });
      setSpawnStates((s) => {
        const next = { ...s };
        delete next[slug];
        return next;
      });
      try {
        const r = await fetch("/api/sessions/end", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug }),
        });
        if (!r.ok) {
          // Roll back on failure
          setSessions(previous);
          saveCached(previous);
          throw new Error(`end failed: ${r.status}`);
        }
      } finally {
        // Always reconcile with server state shortly after
        void refresh();
      }
    },
    [sessions, refresh],
  );

  const recordThread = useCallback(async (slug: string, threadId: string) => {
    setSessions((prev) => {
      const next = prev.map((s) =>
        s.slug === slug ? { ...s, threadId } : s,
      );
      saveCached(next);
      return next;
    });
    await fetch("/api/sessions/thread", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, threadId }),
    }).catch(() => {});
  }, []);

  const isActive = useCallback(
    (slug: string) => sessions.some((s) => s.slug === slug),
    [sessions],
  );

  const getSession = useCallback(
    (slug: string) => sessions.find((s) => s.slug === slug),
    [sessions],
  );

  const value = useMemo<Ctx>(
    () => ({
      sessions,
      spawnStates,
      errors,
      refresh,
      getOrCreate,
      end,
      recordThread,
      isActive,
      getSession,
    }),
    [
      sessions,
      spawnStates,
      errors,
      refresh,
      getOrCreate,
      end,
      recordThread,
      isActive,
      getSession,
    ],
  );

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSessions(): Ctx {
  const ctx = useContext(SessionCtx);
  if (!ctx) throw new Error("useSessions outside of SessionProvider");
  return ctx;
}
