import { AgentClient } from "@21st-sdk/node";
import AgentChatClient from "./agent-chat-client";

type PageProps = { params: Promise<{ slug: string }> };

const PROJECT_REPOS: Record<string, string> = {
  "test-project": "remoteworkhq/sandbox-test",
};

const SANDBOX_TIMEOUT_MS = 30 * 60 * 1000;
const SETUP_WAIT_SECONDS = 30;
const PROJECT_PATH = "/home/user/workspace/project";
const ERROR_PATH = "/home/user/workspace/.hub-error";
const READY_PATH = `${PROJECT_PATH}/.hub-ready`;

export default async function ProjectPage({ params }: PageProps) {
  const { slug } = await params;
  const apiKey = process.env.API_KEY_21ST;
  const ghToken = process.env.GITHUB_TOKEN;
  const repo = PROJECT_REPOS[slug];

  function ErrorState({ msg, hint }: { msg: string; hint?: string }) {
    return (
      <main className="min-h-dvh px-6 py-16 max-w-4xl mx-auto">
        <a href="/" className="text-sm text-zinc-500 hover:text-zinc-300">&larr; Back</a>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">{slug}</h1>
        <div className="mt-6 rounded-lg border border-red-900/60 bg-red-950/30 p-4">
          <p className="text-sm text-red-300 font-medium">{msg}</p>
          {hint && <p className="text-xs text-red-400/80 mt-2 whitespace-pre-wrap">{hint}</p>}
        </div>
      </main>
    );
  }

  if (!apiKey) return <ErrorState msg="Missing API_KEY_21ST env var. Set it in Vercel and redeploy." />;
  if (!ghToken) return <ErrorState msg="Missing GITHUB_TOKEN env var. Add a PAT with 'repo' scope on remoteworkhq, then redeploy." />;
  if (!repo) return <ErrorState msg={`No GitHub repo mapped for project "${slug}".`} />;

  const client = new AgentClient({ apiKey });
  const sandbox = await client.sandboxes.create({
    agent: "hub-tester",
    timeoutMs: SANDBOX_TIMEOUT_MS,
    setup: [
      `mkdir -p /home/user/workspace`,
      // 1. Validate token has push access by hitting the repo collaborators endpoint
      //    (returns 200 only with push scope; 403 with read-only; 401 with bad token).
      `code=$(curl -sS -o /tmp/gh-check.json -w "%{http_code}" -H "Authorization: Bearer ${ghToken}" -H "Accept: application/vnd.github+json" https://api.github.com/repos/${repo}); ` +
      `if [ "$code" != "200" ]; then ` +
      `printf 'GITHUB_TOKEN failed validation against %s (HTTP %s)\n%s\n' '${repo}' "$code" "$(cat /tmp/gh-check.json)" > ${ERROR_PATH}; exit 0; ` +
      `fi`,
      // 2. Clone + configure
      `git clone "https://x-access-token:${ghToken}@github.com/${repo}.git" ${PROJECT_PATH}`,
      `git -C ${PROJECT_PATH} config user.name "Remote Work Hub Agent"`,
      `git -C ${PROJECT_PATH} config user.email "agent@remoteworkhq.local"`,
      `git -C ${PROJECT_PATH} remote set-url origin "https://x-access-token:${ghToken}@github.com/${repo}.git"`,
      `touch ${READY_PATH}`,
    ],
  });

  const wait = await client.sandboxes.exec({
    sandboxId: sandbox.id,
    command:
      `for i in $(seq 1 ${SETUP_WAIT_SECONDS}); do ` +
      `[ -f ${ERROR_PATH} ] && cat ${ERROR_PATH} && exit 2; ` +
      `[ -f ${READY_PATH} ] && echo READY && exit 0; ` +
      `sleep 1; ` +
      `done; echo TIMEOUT && exit 1`,
  });

  if (wait.exitCode === 2) {
    await client.sandboxes.delete(sandbox.id).catch(() => {});
    return (
      <ErrorState
        msg="GITHUB_TOKEN is invalid or lacks access to the repo."
        hint={
          (wait.stdout || "").trim() +
          "\n\nFix: Generate a classic PAT at https://github.com/settings/tokens/new with 'repo' scope, " +
          "update GITHUB_TOKEN in Vercel (all 3 environments), then redeploy."
        }
      />
    );
  }

  if (wait.exitCode !== 0) {
    await client.sandboxes.delete(sandbox.id).catch(() => {});
    return (
      <ErrorState
        msg={`Sandbox setup timed out (${SETUP_WAIT_SECONDS}s).`}
        hint="Either the clone hung or git config commands errored. Check the sandbox's setup logs in the 21st dashboard."
      />
    );
  }

  return (
    <main className="min-h-dvh px-6 py-10 max-w-4xl mx-auto">
      <a href="/" className="text-sm text-zinc-500 hover:text-zinc-300">&larr; Back</a>
      <header className="mt-3 mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{slug}</h1>
          <p className="text-xs text-zinc-500 mt-1">
            <a className="hover:text-zinc-300" href={`https://github.com/${repo}`} target="_blank" rel="noreferrer">{repo}</a>
          </p>
        </div>
        <span className="text-xs text-zinc-500 font-mono">{sandbox.id}</span>
      </header>
      <AgentChatClient sandboxId={sandbox.id} />
    </main>
  );
}
