import { AgentClient } from "@21st-sdk/node";
import AgentChatClient from "./agent-chat-client";

type PageProps = { params: Promise<{ slug: string }> };

const PROJECT_REPOS: Record<string, string> = {
  "test-project": "remoteworkhq/sandbox-test",
};

const SANDBOX_TIMEOUT_MS = 30 * 60 * 1000;
const SETUP_WAIT_SECONDS = 30;
const PROJECT_PATH = "/home/user/workspace/project";
const READY_PATH = `${PROJECT_PATH}/.hub-ready`;

// Restrict sandbox outbound to GitHub only — bypasses 21st vault proxy substitution
// so the real PAT in the remote URL flows through to github.com unchanged.
const NETWORK_ALLOW = ["github.com", "*.github.com", "objects.githubusercontent.com", "codeload.github.com"];
const NETWORK_DENY = ["0.0.0.0/0"];

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

  const remoteUrl = `https://x-access-token:${ghToken}@github.com/${repo}.git`;

  const client = new AgentClient({ apiKey });
  const sandbox = await client.sandboxes.create({
    agent: "hub-tester",
    timeoutMs: SANDBOX_TIMEOUT_MS,
    networkAllowOut: NETWORK_ALLOW,
    networkDenyOut: NETWORK_DENY,
    setup: [
      `mkdir -p /home/user/workspace`,
      `git clone ${remoteUrl} ${PROJECT_PATH}`,
      `git -C ${PROJECT_PATH} config user.name "Remote Work Hub Agent"`,
      `git -C ${PROJECT_PATH} config user.email "agent@remoteworkhq.local"`,
      `git -C ${PROJECT_PATH} remote set-url origin ${remoteUrl}`,
      `touch ${READY_PATH}`,
    ],
  });

  const wait = await client.sandboxes.exec({
    sandboxId: sandbox.id,
    command: `for i in $(seq 1 ${SETUP_WAIT_SECONDS}); do [ -f ${READY_PATH} ] && echo READY && exit 0; sleep 1; done; echo TIMEOUT && exit 1`,
  });

  if (wait.exitCode !== 0) {
    await client.sandboxes.delete(sandbox.id).catch(() => {});
    return (
      <ErrorState
        msg={`Sandbox setup timed out (${SETUP_WAIT_SECONDS}s).`}
        hint="Likely cause: clone failed. Verify GITHUB_TOKEN in Vercel is a classic PAT with 'repo' scope, then redeploy."
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
