import { AgentClient } from "@21st-sdk/node";
import Link from "next/link";
import AgentChatClient from "./agent-chat-client";

type PageProps = { params: Promise<{ slug: string }> };

const PROJECT_REPOS: Record<string, string> = {
  "test-project": "remoteworkhq/sandbox-test",
};

const SANDBOX_TIMEOUT_MS = 30 * 60 * 1000;
const SETUP_WAIT_SECONDS = 30;
const PROJECT_PATH = "/home/user/workspace/project";
const READY_PATH = `${PROJECT_PATH}/.hub-ready`;

const NETWORK_ALLOW = [
  "github.com",
  "*.github.com",
  "objects.githubusercontent.com",
  "codeload.github.com",
];
const NETWORK_DENY = ["0.0.0.0/0"];

export default async function ProjectPage({ params }: PageProps) {
  const { slug } = await params;
  const apiKey = process.env.API_KEY_21ST;
  const ghToken = process.env.GITHUB_TOKEN;
  const repo = PROJECT_REPOS[slug];

  function ErrorState({ msg, hint }: { msg: string; hint?: string }) {
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
            error
          </p>
          <p className="text-paper">{msg}</p>
          {hint && (
            <p className="mt-3 text-sm text-paper-dim whitespace-pre-wrap">
              {hint}
            </p>
          )}
        </div>
      </main>
    );
  }

  if (!apiKey)
    return (
      <ErrorState msg="Missing API_KEY_21ST env var. Set it in Vercel and redeploy." />
    );
  if (!ghToken)
    return (
      <ErrorState msg="Missing GITHUB_TOKEN env var. Add a classic PAT with 'repo' scope, then redeploy." />
    );
  if (!repo)
    return (
      <ErrorState msg={`No GitHub repo mapped for project "${slug}".`} />
    );

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
      `chmod -R a+rw ${PROJECT_PATH}`,
      `git -C ${PROJECT_PATH} config user.name "Remote Work Hub Agent"`,
      `git -C ${PROJECT_PATH} config user.email "agent@remoteworkhq.local"`,
      `git -C ${PROJECT_PATH} remote set-url origin ${remoteUrl}`,
      `git config --system --add safe.directory '*' || git config --global --add safe.directory '*'`,
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
    <AgentChatClient
      sandboxId={sandbox.id}
      slug={slug}
      repo={repo}
    />
  );
}
