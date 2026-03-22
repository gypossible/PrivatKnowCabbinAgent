"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Source = {
  id: string;
  type: string;
  title: string | null;
  canonical_url: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
};

type ChatMessage = {
  id: string;
  role: string;
  content: string;
  metadata: {
    citations?: {
      index: number;
      chunkId: string;
      sourceId: string;
      excerpt: string;
    }[];
    imageUrl?: string | null;
  };
  created_at: string;
};

type Citation = NonNullable<ChatMessage["metadata"]["citations"]>[number];

export function NotebookWorkspace({ notebookId }: { notebookId: string }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [sessions, setSessions] = useState<{ id: string; title: string | null }[]>(
    [],
  );
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [allowWeb, setAllowWeb] = useState(false);
  const [generateImage, setGenerateImage] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const lastAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === "assistant") return messages[i];
    }
    return null;
  }, [messages]);

  const panelCitations = lastAssistant?.metadata?.citations ?? [];

  const loadSources = useCallback(async () => {
    const res = await fetch(`/api/notebooks/${notebookId}/sources`);
    const json = await res.json();
    setSources(json.sources ?? []);
  }, [notebookId]);

  const loadSessions = useCallback(async () => {
    const res = await fetch(`/api/notebooks/${notebookId}/chat/sessions`);
    const json = await res.json();
    const list = json.sessions ?? [];
    setSessions(list);
    setSessionId((current) => current ?? list[0]?.id ?? null);
  }, [notebookId]);

  const loadMessages = useCallback(
    async (sid: string) => {
      const res = await fetch(
        `/api/notebooks/${notebookId}/chat/messages?sessionId=${encodeURIComponent(sid)}`,
      );
      const json = await res.json();
      setMessages(json.messages ?? []);
    },
    [notebookId],
  );

  useEffect(() => {
    void loadSources();
    void loadSessions();
  }, [loadSources, loadSessions]);

  useEffect(() => {
    if (sessionId) void loadMessages(sessionId);
  }, [sessionId, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/notebooks/${notebookId}/upload`, {
      method: "POST",
      body: fd,
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Upload failed");
      return;
    }
    void loadSources();
  }

  async function addUrl() {
    const url = prompt("Page URL to ingest");
    if (!url) return;
    setBusy(true);
    const res = await fetch(`/api/notebooks/${notebookId}/sources/url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "URL ingest failed");
      return;
    }
    void loadSources();
  }

  async function runSearch() {
    const q = prompt("Search query (uses Tavily API)");
    if (!q) return;
    setBusy(true);
    const res = await fetch(`/api/notebooks/${notebookId}/sources/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, maxResults: 4 }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Search ingest failed");
      return;
    }
    void loadSources();
  }

  async function newSession() {
    const res = await fetch(`/api/notebooks/${notebookId}/chat/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Chat" }),
    });
    const json = await res.json();
    if (json.session?.id) {
      setSessionId(json.session.id);
      setMessages([]);
    }
    void loadSessions();
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    setStreaming("");

    const res = await fetch(`/api/notebooks/${notebookId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message: text,
        allowWeb,
        generateImage,
      }),
    });

    if (!res.ok || !res.body) {
      setBusy(false);
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Chat failed");
      void loadMessages(sessionId!);
      return;
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let sid = sessionId;
    let assistantText = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const block of parts) {
          const line = block.trim();
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          let evt: Record<string, unknown>;
          try {
            evt = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            continue;
          }
          if (evt.type === "session" && typeof evt.sessionId === "string") {
            sid = evt.sessionId;
            setSessionId(evt.sessionId);
          }
          if (evt.type === "token" && typeof evt.text === "string") {
            assistantText += evt.text;
            setStreaming(assistantText);
          }
          if (evt.type === "error" && typeof evt.message === "string") {
            alert(evt.message);
          }
          if (evt.type === "done") {
            /* citations and image persisted; reload messages below */
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    setStreaming("");
    setBusy(false);
    if (sid) {
      await loadMessages(sid);
      void loadSessions();
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-zinc-600">
          <Link href="/notebooks" className="hover:text-zinc-900">
            ← Notebooks
          </Link>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Sources</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Upload files, add a URL, or search the web (Tavily). Text is chunked
            and embedded for retrieval.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <label className="cursor-pointer rounded-lg bg-emerald-700 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-800">
              Upload file
              <input
                type="file"
                className="hidden"
                accept=".pdf,.txt,.md,.docx"
                onChange={(e) => void onUpload(e)}
                disabled={busy}
              />
            </label>
            <button
              type="button"
              onClick={() => void addUrl()}
              disabled={busy}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
            >
              Add URL
            </button>
            <button
              type="button"
              onClick={() => void runSearch()}
              disabled={busy}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
            >
              Search &amp; ingest
            </button>
          </div>
          <ul className="mt-4 max-h-64 space-y-2 overflow-auto text-xs">
            {sources.map((s) => (
              <li
                key={s.id}
                className="rounded-lg border border-zinc-100 bg-zinc-50 px-2 py-1.5"
              >
                <div className="font-medium text-zinc-800">
                  {s.title || s.canonical_url || s.type}
                </div>
                <div className="text-zinc-500">
                  {s.type} · {s.status}
                  {s.error_message ? ` — ${s.error_message}` : ""}
                </div>
              </li>
            ))}
            {sources.length === 0 ? (
              <li className="text-zinc-500">No sources yet.</li>
            ) : null}
          </ul>
        </div>

        {panelCitations.length > 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-zinc-900">
              Last answer — citations
            </h3>
            <ul className="mt-2 space-y-2 text-xs text-zinc-700">
              {panelCitations.map((c) => (
                <li key={c.chunkId} className="rounded border border-zinc-100 p-2">
                  <span className="font-mono text-zinc-500">[{c.index}]</span>{" "}
                  {c.excerpt}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="flex min-h-[70vh] flex-col rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex cursor-pointer items-center gap-1.5 text-zinc-700">
              <input
                type="checkbox"
                checked={allowWeb}
                onChange={(e) => setAllowWeb(e.target.checked)}
              />
              Allow web snippets
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-zinc-700">
              <input
                type="checkbox"
                checked={generateImage}
                onChange={(e) => setGenerateImage(e.target.checked)}
              />
              Generate illustration
            </label>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={sessionId ?? ""}
              onChange={(e) => setSessionId(e.target.value || null)}
              className="max-w-[200px] rounded border border-zinc-300 px-2 py-1 text-xs"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {(s.title || "Chat").slice(0, 40)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void newSession()}
              className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50"
            >
              New chat
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm">
          {messages.map((m) => (
            <div
              key={m.id}
              className={
                m.role === "user"
                  ? "ml-8 rounded-lg bg-emerald-50 px-3 py-2 text-zinc-900"
                  : "mr-8 rounded-lg bg-zinc-100 px-3 py-2 text-zinc-900"
              }
            >
              <div className="whitespace-pre-wrap">{m.content}</div>
              {m.role === "assistant" && m.metadata?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.metadata.imageUrl}
                  alt="Generated illustration"
                  className="mt-3 max-h-64 w-auto rounded border border-zinc-200"
                />
              ) : null}
            </div>
          ))}
          {streaming ? (
            <div className="mr-8 rounded-lg bg-zinc-100 px-3 py-2 text-zinc-900">
              <div className="whitespace-pre-wrap">{streaming}</div>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={(e) => void sendMessage(e)}
          className="border-t border-zinc-100 p-3"
        >
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={2}
              placeholder="Ask a question about your sources…"
              className="min-h-[48px] flex-1 resize-y rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none ring-emerald-500/20 focus:border-emerald-600 focus:ring-2"
            />
            <button
              type="submit"
              disabled={busy}
              className="self-end rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              {busy ? "…" : "Send"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
