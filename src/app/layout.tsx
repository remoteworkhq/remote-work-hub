import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Remote Work Hub",
  description: "Cloud-orchestrated Claude Code agents per project",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
