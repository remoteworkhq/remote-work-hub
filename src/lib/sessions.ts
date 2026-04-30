import "server-only";
import { AgentClient } from "@21st-sdk/node";
import { getAdminClient } from "@/lib/supabase/admin";
import { getRepoForSlug } from "@/lib/projects";

const PROJECT_PATH = "/home/user/workspace/project";
const READY_PATH = `${PROJECT_PATH}/.hub-ready`;
const SANDBOX_TIMEOUT_MS = 30 * 60 * 1000;

const NETWORK_ALLOW = [
  "github.com",
  "*.github.com",
  "objects.githubusercontent.com",
  "codeload.github.com",
];
const NETWORK_DENY = ["0.0.0.0/0"];

export type Session = {
  slug: string;
  sandboxId: string;
  threadId: string | null;
  repo: string;
  status: string;
  createdAt: string;
  lastActiveAt: string;
};

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function client(): AgentClient {
  return new AgentClient({ apiKey: need("API_KEY_21ST") });
}

function buildRemoteUrl(repo: string, ghToken: string): string {
  return `https://x-access-token:${ghToken}@github.com/${repo}.git`;
}

function buildSetup(remoteUrl: string, priorLog: string | null): string[] {
  const steps = [
    `mkdir -p /home/user/workspace`,
    // --depth 1 = ~3x faster clone; we don't need deep history.
    `git clone --depth 1 ${remoteUrl} ${PROJECT_PATH}`,
    `chmod -R a+rw ${PROJECT_PATH}`,
    `git -C ${PROJECT_PATH} config user.name "Remote Work Hub Agent"`,
    `git -C ${PROJECT_PATH} config user.email "agent@remoteworkhq.local"`,
    `git -C ${PROJECT_PATH} remote set-url origin ${remoteUrl}`,
    `git config --system --add safe.directory '*' || git config --global --add safe.directory '*'`,
  ];
  if (priorLog) {
    // Inject prior session context as a file the agent reads on init.
    // Use base64 so multi-line / quoted content survives the shell.
    const b64 = Buffer.from(priorLog, "utf8").toString("base64");
    steps.push(`mkdir -p /home/user/.hub`);
    steps.push(`echo ${b64} | base64 -d > /home/user/.hub/context.md`);
  }
  steps.push(`touch ${READY_PATH}`);
  return steps;
}

function rowToSession(row: {
  project_slug: string | null;
  sandbox_id: string | null;
  thread_id: string | null;
  repo: string | null;
  status: string;
  started_at: string;
  last_active_at: string;
}): Session | null {
  if (!row.project_slug || !row.sandbox_id || !row.repo) return null;
  return {
    slug: row.project_slug,
    sandboxId: row.sandbox_id,
    threadId: row.thread_id,
    repo: row.repo,
    status: row.status,
    createdAt: row.started_at,
    lastActiveAt: row.last_active_at,
  };
}

async function isSandboxAlive(sandboxId: string): Promise<boolean> {
  try {
    const detail = await client().sandboxes.get(sandboxId);
    return detail?.status !== "error" && detail?.status !== "dead";
  } catch {
    return false;
  }
}

async function markSessionDead(
  supabase: ReturnType<typeof getAdminClient>,
  sandboxId: string,
) {
  await supabase
    .from("sessions")
    .update({ status: "dead", ended_at: new Date().toISOString() })
    .eq("sandbox_id", sandboxId);
}

export async function getActiveSession(slug: string): Promise<Session | null> {
  const supabase = getAdminClient();
  const { data } = await supabase
    .from("sessions")
    .select("*")
    .eq("project_slug", slug)
    .in("status", ["ready", "spawning"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const session = rowToSession(data);
  if (!session) return null;
  // Only verify alive for ready sessions; spawning ones may not be queryable yet.
  if (session.status === "ready") {
    const alive = await isSandboxAlive(session.sandboxId);
    if (!alive) {
      await markSessionDead(supabase, session.sandboxId);
      return null;
    }
  }
  return session;
}

// Phase 1: create the sandbox + thread + insert the row + return immediately.
// The clone runs in 21st's sandbox in the background. Client must poll
// finalizeSpawn() to flip to status=ready.
export async function startSpawn(slug: string): Promise<Session> {
  const repo = getRepoForSlug(slug);
  if (!repo) throw new Error(`Unknown project slug: ${slug}`);

  const existing = await getActiveSession(slug);
  if (existing && existing.repo === repo) return existing;

  const ghToken = need("GITHUB_TOKEN");
  const remoteUrl = buildRemoteUrl(repo, ghToken);
  const c = client();

  const priorLog = await getLatestLog(slug);
  const sandbox = await c.sandboxes.create({
    agent: "hub-tester",
    timeoutMs: SANDBOX_TIMEOUT_MS,
    networkAllowOut: NETWORK_ALLOW,
    networkDenyOut: NETWORK_DENY,
    setup: buildSetup(remoteUrl, priorLog),
  });

  // Pre-create the conversation thread so we have a stable threadId from
  // the start. Same threadId is reused across page reloads / nav, so chat
  // history can be fetched and restored.
  const thread = await c.threads.create({
    sandboxId: sandbox.id,
    name: slug,
  });

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("sessions")
    .insert({
      project_slug: slug,
      sandbox_id: sandbox.id,
      thread_id: thread.id,
      repo,
      status: "spawning",
    })
    .select()
    .single();
  if (error || !data) {
    // Race: another spawn won the unique constraint. Use that.
    const winner = await getActiveSession(slug);
    if (winner) {
      await c.sandboxes.delete(sandbox.id).catch(() => {});
      return winner;
    }
    throw new Error(
      `DB insert failed: ${error?.message ?? "unknown"}. Sandbox ${sandbox.id} may need manual cleanup.`,
    );
  }

  const session = rowToSession(data);
  if (!session) throw new Error("Failed to materialize session row");
  return session;
}

export type StoredMessage = {
  id?: string;
  role: string;
  parts: Array<{ type: string; [k: string]: unknown }>;
};

export async function getThreadMessages(slug: string): Promise<StoredMessage[]> {
  const session = await getActiveSession(slug);
  if (session?.threadId) {
    try {
      const thread = await client().threads.get({
        sandboxId: session.sandboxId,
        threadId: session.threadId,
      });
      const raw = thread.messages;
      if (Array.isArray(raw) && raw.length > 0) return raw as StoredMessage[];
    } catch {
      // fall through to transcript fallback
    }
  }
  // Fallback: most recent persisted transcript for this slug, regardless of
  // session status. Survives sandbox death / 21st thread reap.
  return getLatestTranscript(slug);
}

export async function getLatestTranscript(slug: string): Promise<StoredMessage[]> {
  const supabase = getAdminClient();
  const { data } = await supabase
    .from("sessions")
    .select("transcript, started_at")
    .eq("project_slug", slug)
    .not("transcript", "is", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const t = data?.transcript;
  if (!Array.isArray(t)) return [];
  return t as StoredMessage[];
}

export async function persistTranscript(
  slug: string,
  messages: StoredMessage[],
): Promise<void> {
  if (!Array.isArray(messages)) return;
  const supabase = getAdminClient();
  // Save against the most recent session for this slug (active or dead).
  // Multi-tab: same session row, last writer wins, fine for our use.
  const { data: row } = await supabase
    .from("sessions")
    .select("id")
    .eq("project_slug", slug)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row?.id) return;
  await supabase
    .from("sessions")
    .update({
      transcript: messages,
      last_active_at: new Date().toISOString(),
    })
    .eq("id", row.id);
}

// Phase 2: check if the workspace marker exists. Updates DB to ready if so.
export async function finalizeSpawn(slug: string): Promise<{
  status: "spawning" | "ready" | "missing";
  session: Session | null;
}> {
  const session = await getActiveSession(slug);
  if (!session) return { status: "missing", session: null };
  if (session.status === "ready") return { status: "ready", session };

  const c = client();
  // Quick exec: did the marker land yet?
  let exit = 1;
  try {
    const r = await c.sandboxes.exec({
      sandboxId: session.sandboxId,
      command: `[ -f ${READY_PATH} ] && echo READY || echo PENDING`,
      timeoutMs: 8_000,
    });
    exit = /READY/.test(r.stdout) ? 0 : 1;
  } catch {
    return { status: "spawning", session };
  }

  if (exit !== 0) return { status: "spawning", session };

  const supabase = getAdminClient();
  const { data } = await supabase
    .from("sessions")
    .update({
      status: "ready",
      last_active_at: new Date().toISOString(),
    })
    .eq("sandbox_id", session.sandboxId)
    .select()
    .single();
  if (!data) return { status: "ready", session };
  const updated = rowToSession(data);
  return { status: "ready", session: updated ?? session };
}

export async function listActiveSessions(): Promise<Session[]> {
  const supabase = getAdminClient();
  const { data } = await supabase
    .from("sessions")
    .select("*")
    .in("status", ["ready", "spawning"])
    .order("last_active_at", { ascending: false });
  if (!data) return [];
  const sessions: Session[] = [];
  for (const row of data) {
    const session = rowToSession(row);
    if (!session) continue;
    sessions.push(session);
  }
  return sessions;
}

export async function endSession(slug: string): Promise<void> {
  const session = await getActiveSession(slug);
  if (!session) return;

  // Best-effort: ask the agent to summarize before we kill the sandbox.
  // Hard-cap so a slow summary never wedges the End action.
  if (session.status === "ready") {
    await writeSessionLog(slug, session.sandboxId).catch(() => {});
  }

  await client().sandboxes.delete(session.sandboxId).catch(() => {});

  const supabase = getAdminClient();
  await supabase
    .from("sessions")
    .update({ status: "dead", ended_at: new Date().toISOString() })
    .eq("project_slug", slug)
    .in("status", ["ready", "spawning"]);
}

const SUMMARY_PROMPT = `You are wrapping up a session inside /workspace/project. Write a concise log (UNDER 1800 characters TOTAL) of this session to /home/user/.hub/context.md as plain markdown. Include:

- "## Built" — what was added or changed (use git log -n 10 --oneline and git diff --stat HEAD~1)
- "## Open" — what is unfinished, pending, or has known issues
- "## Next" — one or two suggested next steps for the future you

Be terse. Bullet points. No fluff. Hard cap 1800 chars. After writing the file, reply only with "saved".`;

const SUMMARY_WAIT_SECONDS = 35;

async function writeSessionLog(slug: string, sandboxId: string): Promise<void> {
  const c = client();
  // Run on a separate thread so the user's main chat history stays clean.
  const summaryThread = await c.threads.create({
    sandboxId,
    name: `_summary_${Date.now()}`,
  });
  await c.threads.run({
    agent: "hub-tester",
    sandboxId,
    threadId: summaryThread.id,
    messages: [
      {
        role: "user",
        parts: [{ type: "text", text: SUMMARY_PROMPT }],
      },
    ],
    mode: "background",
  });

  // Poll until completed (or timeout)
  const deadline = Date.now() + SUMMARY_WAIT_SECONDS * 1000;
  let done = false;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    const t = await c.threads
      .get({ sandboxId, threadId: summaryThread.id })
      .catch(() => null);
    if (!t) break;
    if (t.status === "completed" || t.status === "error") {
      done = true;
      break;
    }
  }
  if (!done) {
    // Best-effort: clean up the summary thread
    await c.threads
      .delete({ sandboxId, threadId: summaryThread.id })
      .catch(() => {});
    return;
  }

  // Read the file the agent wrote
  const fileRead = await c.sandboxes
    .exec({
      sandboxId,
      command: "cat /home/user/.hub/context.md 2>/dev/null | head -c 4000",
      timeoutMs: 8_000,
    })
    .catch(() => null);

  await c.threads
    .delete({ sandboxId, threadId: summaryThread.id })
    .catch(() => {});

  const summary = (fileRead?.stdout || "").trim();
  if (!summary) return;

  // Cap stored summary
  const truncated = summary.length > 2000 ? summary.slice(0, 2000) : summary;
  const supabase = getAdminClient();
  await supabase
    .from("project_logs")
    .insert({ project_slug: slug, summary: truncated });
}

export async function getLatestLog(slug: string): Promise<string | null> {
  const supabase = getAdminClient();
  const { data } = await supabase
    .from("project_logs")
    .select("summary, created_at")
    .eq("project_slug", slug)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.summary) return null;
  const ts = new Date(data.created_at).toISOString();
  return `# Previous session log (${ts})\n\n${data.summary}\n`;
}

export async function recordThreadId(slug: string, threadId: string): Promise<void> {
  const supabase = getAdminClient();
  await supabase
    .from("sessions")
    .update({
      thread_id: threadId,
      last_active_at: new Date().toISOString(),
    })
    .eq("project_slug", slug)
    .eq("status", "ready");
}

export type PushResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export async function pushSession(slug: string): Promise<PushResult> {
  const expectedRepo = getRepoForSlug(slug);
  if (!expectedRepo) {
    return { exitCode: -1, stdout: "", stderr: `Unknown slug: ${slug}` };
  }
  const session = await getActiveSession(slug);
  if (!session) {
    return { exitCode: -1, stdout: "", stderr: `No active session for ${slug}` };
  }
  if (session.status !== "ready") {
    return { exitCode: -1, stdout: "", stderr: `Session not ready (status: ${session.status})` };
  }
  if (session.repo !== expectedRepo) {
    return {
      exitCode: -1,
      stdout: "",
      stderr: `Session repo mismatch (${session.repo} vs ${expectedRepo}); refusing push.`,
    };
  }

  const c = client();
  const r = await c.sandboxes.exec({
    sandboxId: session.sandboxId,
    command:
      `git -c safe.directory='*' -C ${PROJECT_PATH} status --short && ` +
      `git -c safe.directory='*' -C ${PROJECT_PATH} log --oneline -5 && ` +
      `echo '---PUSH---' && ` +
      `git -c safe.directory='*' -C ${PROJECT_PATH} push 2>&1`,
    timeoutMs: 50_000,
  });

  const supabase = getAdminClient();
  await supabase
    .from("sessions")
    .update({ last_active_at: new Date().toISOString() })
    .eq("sandbox_id", session.sandboxId);

  return {
    exitCode: r.exitCode,
    stdout: r.stdout,
    stderr: r.stderr,
  };
}
