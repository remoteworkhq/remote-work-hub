import Link from "next/link";

type Project = {
  slug: string;
  name: string;
  description: string;
  status: string;
};

// Hardcoded for now. Wired to Supabase once we decide on data path.
const projects: Project[] = [];

export default function HomePage() {
  return (
    <main className="min-h-dvh px-6 py-16 max-w-6xl mx-auto">
      <header className="mb-12">
        <h1 className="text-4xl font-semibold tracking-tight">Remote Work Hub</h1>
        <p className="mt-2 text-zinc-400">
          Cloud agents per project. Click in, edit via Claude Code, push to preview.
        </p>
      </header>

      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-xl font-medium">Projects</h2>
          <span className="text-sm text-zinc-500">{projects.length} connected</span>
        </div>

        {projects.length === 0 ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-8 text-center">
            <p className="text-zinc-400">No projects yet.</p>
            <p className="text-sm text-zinc-500 mt-1">
              Wire the first one once we pick the data path.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <Link
                key={p.slug}
                href={`/projects/${p.slug}`}
                className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5 hover:border-zinc-700 hover:bg-zinc-900/70 transition block"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{p.name}</h3>
                  <span className="text-xs text-zinc-500">{p.status}</span>
                </div>
                <p className="mt-1 text-sm text-zinc-400">{p.description}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
