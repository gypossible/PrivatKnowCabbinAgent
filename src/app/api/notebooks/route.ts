import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth-api";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { NextResponse } from "next/server";

export async function GET() {
  if (!hasSupabasePublicEnv()) {
    return NextResponse.json(
      {
        error:
          "Missing Supabase env: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY from Vercel integration).",
      },
      { status: 500 },
    );
  }
  const supabase = await createClient();
  const user = await requireUser(supabase);
  const { data, error } = await supabase
    .from("notebooks")
    .select("id,title,created_at,updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ notebooks: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const user = await requireUser(supabase);
  let body: { title?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body ok */
  }
  const title = (body.title?.trim() || "Untitled notebook").slice(0, 200);
  const { data, error } = await supabase
    .from("notebooks")
    .insert({ user_id: user.id, title })
    .select("id,title,created_at")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ notebook: data });
}
