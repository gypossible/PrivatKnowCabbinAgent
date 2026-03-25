import { getSupabasePublicEnvIssue } from "@/lib/supabase/env";

type SupabaseSetupNoticeProps = {
  className?: string;
};

export function SupabaseSetupNotice({
  className = "",
}: SupabaseSetupNoticeProps) {
  const issue = getSupabasePublicEnvIssue();
  if (!issue) {
    return null;
  }

  return (
    <div
      className={`rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 ${className}`.trim()}
    >
      <p className="font-medium">Supabase setup required</p>
      <p className="mt-1 text-amber-900">{issue}</p>
    </div>
  );
}
