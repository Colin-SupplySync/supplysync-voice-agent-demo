import type { SessionStatus } from "../types";

const palette: Record<SessionStatus, string> = {
  disconnected: "bg-slate-500",
  connecting: "bg-amber-300",
  listening: "bg-emerald-400",
  "assistant-speaking": "bg-cyan-300",
  ended: "bg-slate-300",
  error: "bg-rose-400",
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  return (
    <span className="relative inline-flex h-3.5 w-3.5 items-center justify-center">
      <span className={`absolute h-3.5 w-3.5 rounded-full opacity-30 ${palette[status]}`} />
      <span className={`relative h-2.5 w-2.5 rounded-full ${palette[status]}`} />
    </span>
  );
}
