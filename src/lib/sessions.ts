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

function buildSetup(remoteUrl: string): string[] {
  return [
    `mkdir -p /home/user/workspace`,
    `git clone ${remoteUrl} ${PROJECT_PATH}`,
    `chmod -R a+rw ${PROJECT_PATH}`,
    `git -C ${PROJECT_PATH} config user.name "Remote Work Hub Agent"`,
    `git -C ${PROJECT_PATH} config user.email "agent@remoteworkhq.local"`,
    `git -C ${PROJECT_PATH} remote set-url origin ${remoteUrl}`,
    `git config --system --add safe.directory '*' || git config --global --add safe.directory '*'`,
    `touch ${READY_PATH}`,
  ];
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

// Phase 1: create the sandbox + insert the row + return immediately.
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

  const sandbox = await c.sandboxes.create({
    agent: "hub-tester",
    timeoutMs: SANDBOX_TIMEOUT_MS,
    networkAllowOut: NETWORK_ALLOW,
    networkDenyOut: NETWORK_DENY,
    setup: buildSetup(remoteUrl),
  });

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("sessions")
    .insert({
      project_slug: slug,
      sandbox_id: sandbox.id,
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
  const supabase = getAdminClient();
  const { data: rows } = await supabase
    .from("sessions")
    .select("sandbox_id")
    .eq("project_slug", slug)
    .in("status", ["ready", "spawning"]);
  for (const row of rows ?? []) {
    if (row.sandbox_id) {
      await client().sandboxes.delete(row.sandbox_id).catch(() => {});
    }
  }
  await supabase
    .from("sessions")
    .update({ status: "dead", ended_at: new Date().toISOString() })
    .eq("project_slug", slug)
    .in("status", ["ready", "spawning"]);
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
