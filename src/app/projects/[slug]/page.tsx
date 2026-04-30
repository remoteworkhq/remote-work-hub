import { AgentClient } from "@21st-sdk/node";
import AgentChatClient from "./agent-chat-client";

type PageProps = { params: Promise<{ slug: string }> };

export default async function ProjectPage({ params }: PageProps) {
  const { slug } = await params;

  const apiKey = process.env.API_KEY_21ST;
  if (!apiKey) {
    return (
      <main className="min-h-dvh px-6 py-16 max-w-4xl mx-auto">
        <a href="/" className="text-sm text-zinc-500 hover:text-zinc-300">&larr; Back</a>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">{slug}</h1>
        <p className="mt-4 text-red-400 text-sm">
          Missing <code>API_KEY_21ST</code> env var. Set it in Vercel and redeploy.
        </p>
      </main>
    );
  }

  const client = new AgentClient({ apiKey });
  const sandbox = await client.sandboxes.create({ agent: "hub-tester" });

  return (
    <main className="min-h-dvh px-6 py-10 max-w-4xl mx-auto">
      <a href="/" className="text-sm text-zinc-500 hover:text-zinc-300">&larr; Back</a>
      <header className="mt-3 mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{slug}</h1>
        <span className="text-xs text-zinc-500 font-mono">{sandbox.id}</span>
      </header>
      <AgentChatClient sandboxId={sandbox.id} />
    </main>
  );
}
