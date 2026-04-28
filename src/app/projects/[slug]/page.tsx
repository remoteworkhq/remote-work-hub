type PageProps = { params: Promise<{ slug: string }> };

export default async function ProjectPage({ params }: PageProps) {
  const { slug } = await params;
  return (
    <main className="min-h-dvh px-6 py-16 max-w-4xl mx-auto">
      <a href="/" className="text-sm text-zinc-500 hover:text-zinc-300">&larr; Back</a>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">{slug}</h1>
      <p className="mt-2 text-zinc-400">
        Project detail page. Agent chat panel + session history land here.
      </p>
    </main>
  );
}
