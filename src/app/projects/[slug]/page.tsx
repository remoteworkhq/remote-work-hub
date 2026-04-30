import { AgentClient } from "@21st-sdk/node";
import AgentChatClient from "./agent-chat-client";

type PageProps = { params: Promise<{ slug: string }> };

const PROJECT_REPOS: Record<string, string> = {
  "test-project": "remoteworkhq/sandbox-test",
};

const SANDBOX_TIMEOUT_MS = 30 * 60 * 1000;

function buildRecoveryScript(repo: string, ghToken: string): string {
  // Inline-quoted bash. Lives only inside the sandbox; never exposed to the browser.
  return [
    "#!/bin/bash",
    "set -e",
    `git clone "https://x-access-token:${ghToken}@github.com/${repo}.git" /workspace`,
    `git -C /workspace config user.name "Remote Work Hub Agent"`,
    `git -C /workspace config user.email "agent@remoteworkhq.local"`,
    `git -C /workspace remote set-url origin "https://x-access-token:${ghToken}@github.com/${repo}.git"`,
    `echo "ready" > /workspace/.hub-ready`,
  ].join("\n");
}

export default async function ProjectPage({ params }: PageProps) {
  const { slug } = await params;
  const apiKey = process.env.API_KEY_21ST;
  const ghToken = process.env.GITHUB_TOKEN;
  const repo = PROJECT_REPOS[slug];

  function ErrorState({ msg }: { msg: string }) {
    return (
      <main className="min-h-dvh px-6 py-16 max-w-4xl mx-auto">
        <a href="/" className="text-sm text-zinc-500 hover:text-zinc-300">&larr; Back</a>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">{slug}</h1>
        <p className="mt-4 text-sm text-red-400">{msg}</p>
      </main>
    );
  }

  if (!apiKey) return <ErrorState msg="Missing API_KEY_21ST env var. Set it in Vercel and redeploy." />;
  if (!ghToken) return <ErrorState msg="Missing GITHUB_TOKEN env var. Add a PAT with 'repo' scope on remoteworkhq, then redeploy." />;
  if (!repo) return <ErrorState msg={`No GitHub repo mapped for project "${slug}".`} />;

  const recoveryScript = buildRecoveryScript(repo, ghToken);

  const client = new AgentClient({ apiKey });
  const sandbox = await client.sandboxes.create({
    agent: "hub-tester",
    timeoutMs: SANDBOX_TIMEOUT_MS,
    files: {
      "/usr/local/bin/init-workspace": recoveryScript,
    },
    setup: [
      "chmod +x /usr/local/bin/init-workspace",
      "/usr/local/bin/init-workspace",
    ],
  });

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
