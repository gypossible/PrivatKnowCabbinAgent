"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Notebook = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export default function NotebooksPage() {
  const router = useRouter();
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/notebooks");
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    const json = await res.json();
    setNotebooks(json.notebooks ?? []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/notebooks");
      if (cancelled) return;
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const json = await res.json();
      if (cancelled) return;
      setNotebooks(json.notebooks ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function createNotebook(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    const res = await fetch("/api/notebooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() || undefined }),
    });
    setCreating(false);
    if (!res.ok) return;
    const { notebook } = await res.json();
    setTitle("");
    router.push(`/notebooks/${notebook.id}`);
  }

  async function removeNotebook(id: string) {
    if (!confirm("Delete this notebook and all its data?")) return;
    await fetch(`/api/notebooks/${id}`, { method: "DELETE" });
    void load();
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-zinc-600">
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Notebooks</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Upload sources, then chat with retrieval and optional images.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="text-sm text-zinc-600 underline hover:text-zinc-900"
        >
          Sign out
        </button>
      </div>

      <form
        onSubmit={createNotebook}
        className="mt-8 flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center"
      >
        <input
          placeholder="New notebook title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none ring-emerald-500/20 focus:border-emerald-600 focus:ring-2"
        />
        <button
          type="submit"
          disabled={creating}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {creating ? "Creating…" : "New notebook"}
        </button>
      </form>

      <ul className="mt-8 space-y-2">
        {notebooks.map((n) => (
          <li
            key={n.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm"
          >
            <Link
              href={`/notebooks/${n.id}`}
              className="font-medium text-zinc-900 hover:text-emerald-800"
            >
              {n.title}
            </Link>
            <button
              type="button"
              onClick={() => void removeNotebook(n.id)}
              className="text-xs text-red-600 hover:underline"
            >
              Delete
            </button>
          </li>
        ))}
        {notebooks.length === 0 ? (
          <li className="text-sm text-zinc-500">No notebooks yet.</li>
        ) : null}
      </ul>
    </div>
  );
}
