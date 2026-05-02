import "server-only";

// SERVER-ONLY slug -> GitHub repo map. Never imported by client code.
// Cross-contamination defense: every server-side write/push derives the repo
// from this table, NOT from anything the client sends.
export const PROJECT_REPOS: Record<string, string> = {
  "test-project": "daniels-project-space/sandbox-test",
  "music-house": "daniels-project-space/music-house",
};

export type ProjectMeta = {
  slug: string;
  name: string;
  description: string;
  repo: string;
  // Vault services to fetch and inject into the sandbox as env vars.
  // Each entry maps to a 'service' in the project-hub Convex secrets table.
  // Setup script pulls every key under those services and writes them to .env.local.
  services?: string[];
};

// Public-safe project metadata (no secrets, no token URLs). Safe to ship to
// the browser via server components.
export const PROJECTS: ProjectMeta[] = [
  {
    slug: "test-project",
    name: "Sandbox Test",
    description:
      "Throwaway repo for proving the Claude Code agent flow end-to-end.",
    repo: "daniels-project-space/sandbox-test",
    services: ["anthropic"],
  },
  {
    slug: "music-house",
    name: "Music House",
    description:
      "AI music label. Suno + Mureka generation, organized catalog with timestamped lyrics, hearts, playlists, distribution-ready.",
    repo: "daniels-project-space/music-house",
    services: ["convex", "cloudflare", "suno", "mureka", "kits", "anthropic", "replicate", "trigger"],
  },
];

export function getRepoForSlug(slug: string): string | null {
  return PROJECT_REPOS[slug] ?? null;
}

export function getServicesForSlug(slug: string): string[] {
  const meta = PROJECTS.find((p) => p.slug === slug);
  return meta?.services ?? [];
}
