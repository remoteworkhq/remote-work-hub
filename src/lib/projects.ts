import "server-only";

// SERVER-ONLY slug -> GitHub repo map. Never imported by client code.
// Cross-contamination defense: every server-side write/push derives the repo
// from this table, NOT from anything the client sends.
export const PROJECT_REPOS: Record<string, string> = {
  "test-project": "remoteworkhq/sandbox-test",
};

export type ProjectMeta = {
  slug: string;
  name: string;
  description: string;
  repo: string;
};

// Public-safe project metadata (no secrets, no token URLs). Safe to ship to
// the browser via server components.
export const PROJECTS: ProjectMeta[] = [
  {
    slug: "test-project",
    name: "Sandbox Test",
    description:
      "Throwaway repo for proving the Claude Code agent flow end-to-end.",
    repo: "remoteworkhq/sandbox-test",
  },
];

export function getRepoForSlug(slug: string): string | null {
  return PROJECT_REPOS[slug] ?? null;
}
