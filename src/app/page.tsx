import Link from "next/link";

type Project = {
  slug: string;
  name: string;
  description: string;
  status: string;
};

const projects: Project[] = [
  {
    slug: "test-project",
    name: "Sandbox Test",
    description: "Throwaway repo for proving the Claude Code agent flow end-to-end.",
    status: "live",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-dvh">
      {/* Header band */}
      <header className="border-b border-rule-soft/60">
        <div className="max-w-[1440px] mx-auto px-8 lg:px-14 pt-12 pb-10 flex items-end justify-between gap-8">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-amber/80">
              Remote Work / 2026
            </p>
            <h1 className="mt-2 font-display text-[64px] leading-[1.02] tracking-tight text-paper">
              Remote Work <span className="italic text-paper-dim">Hub</span>
            </h1>
            <p className="mt-3 max-w-xl text-paper-dim text-[15px] leading-relaxed">
              Cloud-orchestrated Claude Code agents, one per project. Click in,
              edit through chat, push the change to a Vercel preview without
              leaving the page.
            </p>
          </div>

          <div className="hidden md:flex items-center gap-6 text-right">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-paper-faint">
                Projects
              </p>
              <p className="font-display text-3xl text-paper mt-1 tabular-nums">
                {String(projects.length).padStart(2, "0")}
              </p>
            </div>
            <div className="h-12 w-px bg-rule-soft" />
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-paper-faint">
                Status
              </p>
              <p className="mt-1.5 flex items-center gap-2 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-soft pulse-dot" />
                <span className="text-paper-dim">all systems</span>
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Project list */}
      <section className="max-w-[1440px] mx-auto px-8 lg:px-14 py-12">
        <div className="flex items-baseline justify-between mb-8">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.32em] text-paper-faint">
            Active Projects
          </h2>
          <p className="font-mono text-[11px] text-paper-faint">
            Click any tile to spin up a fresh sandbox
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-rule-soft/40">
          {projects.map((p, idx) => (
            <Link
              key={p.slug}
              href={`/projects/${p.slug}`}
              className="group relative bg-ink hover:bg-ink-2 transition-colors p-7 min-h-[220px] flex flex-col justify-between"
            >
              {/* index */}
              <div className="flex items-start justify-between">
                <span className="font-mono text-[11px] text-paper-faint tracking-wider tabular-nums">
                  /{String(idx + 1).padStart(2, "0")}
                </span>
                <span
                  className={`font-mono text-[10px] uppercase tracking-[0.2em] px-2 py-0.5 rounded-sm ${
                    p.status === "live"
                      ? "text-amber bg-amber-glow"
                      : "text-paper-faint bg-rule-soft/40"
                  }`}
                >
                  {p.status}
                </span>
              </div>
              <div>
                <h3 className="font-display text-2xl text-paper">
                  {p.name}
                </h3>
                <p className="mt-2 text-sm text-paper-dim leading-relaxed">
                  {p.description}
                </p>
                <div className="mt-5 flex items-center gap-2 font-mono text-[11px] text-paper-faint group-hover:text-amber transition-colors">
                  <span>open sandbox</span>
                  <span className="caret-blink">_</span>
                </div>
              </div>
              {/* Hover accent */}
              <div className="absolute inset-x-0 top-0 h-px bg-amber/0 group-hover:bg-amber/60 transition-colors" />
            </Link>
          ))}

          {/* Placeholder tile to keep grid sized */}
          <div className="bg-ink p-7 min-h-[220px] flex flex-col justify-between border border-dashed border-rule-soft/30 m-px">
            <span className="font-mono text-[11px] text-paper-faint">
              /02
            </span>
            <div>
              <h3 className="font-display text-2xl italic text-paper-faint">
                Add a project
              </h3>
              <p className="mt-2 text-sm text-paper-faint leading-relaxed">
                Wire it via the registry. UI for this is on the roadmap.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer rule */}
      <footer className="max-w-[1440px] mx-auto px-8 lg:px-14 pb-10">
        <div className="rule-hairline mb-4" />
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.28em] text-paper-faint">
          <span>remote-work-hub · vercel · supabase · 21st</span>
          <span>v0.1</span>
        </div>
      </footer>
    </main>
  );
}
