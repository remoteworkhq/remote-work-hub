import Link from "next/link";
import { getRepoForSlug } from "@/lib/projects";
import ProjectShell from "./project-shell";

type PageProps = { params: Promise<{ slug: string }> };

export default async function ProjectPage({ params }: PageProps) {
  const { slug } = await params;
  const repo = getRepoForSlug(slug);

  if (!repo) {
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
            unknown project
          </p>
          <p className="text-paper">
            No GitHub repo mapped for slug &quot;{slug}&quot;. Add it to{" "}
            <code className="font-mono">PROJECT_REPOS</code> in{" "}
            <code className="font-mono">src/lib/projects.ts</code>.
          </p>
        </div>
      </main>
    );
  }

  return <ProjectShell slug={slug} repo={repo} />;
}
