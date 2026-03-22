import Link from "next/link";

export default function NotebooksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link
            href="/notebooks"
            className="text-sm font-semibold text-emerald-900"
          >
            Private KB
          </Link>
          <nav className="flex items-center gap-4 text-sm text-zinc-600">
            <Link href="/notebooks" className="hover:text-zinc-900">
              Notebooks
            </Link>
          </nav>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
