import "server-only";
import { AgentClient } from "@21st-sdk/node";
import { getAdminClient } from "@/lib/supabase/admin";
import { getRepoForSlug } from "@/lib/projects";

const PROJECT_PATH = "/home/user/workspace/project";
const READY_PATH = `${PROJECT_PATH}/.hub-ready`;
const SANDBOX_TIMEOUT_MS = 30 * 60 * 1000;
const SETUP_WAIT_SECONDS = 30;

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

async function markSessionDead(supabase: ReturnType<typeof getAdminClient>, sandboxId: string) {
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
    .eq("status", "ready")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const session = rowToSession(data);
  if (!session) return null;
  // Verify sandbox is still alive on 21st side.
  const alive = await isSandboxAlive(session.sandboxId);
  if (!alive) {
    await markSessionDead(supabase, session.sandboxId);
    return null;
  }
  return session;
}

export async function spawnOrGetSession(slug: string): Promise<Session> {
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

  // Block until clone finished
  const wait = await c.sandboxes.exec({
    sandboxId: sandbox.id,
    command: `for i in $(seq 1 ${SETUP_WAIT_SECONDS}); do [ -f ${READY_PATH} ] && echo READY && exit 0; sleep 1; done; exit 1`,
  });
  if (wait.exitCode !== 0) {
    await c.sandboxes.delete(sandbox.id).catch(() => {});
    throw new Error(
      `Sandbox setup timed out (${SETUP_WAIT_SECONDS}s). Likely cause: GITHUB_TOKEN invalid or lacks 'repo' scope.`,
    );
  }

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("sessions")
    .insert({
      project_slug: slug,
      sandbox_id: sandbox.id,
      repo,
      status: "ready",
    })
    .select()
    .single();
  if (error || !data) {
    // Race: another spawn won the unique constraint. Fetch and use that one.
    const winner = await getActiveSession(slug);
    if (winner) {
      // Discard our redundant sandbox.
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

export async function listActiveSessions(): Promise<Session[]> {
  const supabase = getAdminClient();
  const { data } = await supabase
    .from("sessions")
    .select("*")
    .eq("status", "ready")
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
  await client().sandboxes.delete(session.sandboxId).catch(() => {});
  const supabase = getAdminClient();
  await supabase
    .from("sessions")
    .update({ status: "dead", ended_at: new Date().toISOString() })
    .eq("sandbox_id", session.sandboxId);
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
  // CRITICAL: derive everything from slug. Never trust the client.
  const expectedRepo = getRepoForSlug(slug);
  if (!expectedRepo) {
    return { exitCode: -1, stdout: "", stderr: `Unknown slug: ${slug}` };
  }
  const session = await getActiveSession(slug);
  if (!session) {
    return { exitCode: -1, stdout: "", stderr: `No active session for ${slug}` };
  }
  if (session.repo !== expectedRepo) {
    // Belt-and-suspenders: if recorded repo differs from canonical, refuse.
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
    timeoutMs: 60_000,
  });

  // Bump last_active_at
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
