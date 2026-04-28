interface ActionButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "accent";
}

const variantClasses: Record<NonNullable<ActionButtonProps["variant"]>, string> = {
  primary:
    "border-cyan-300/30 bg-cyan-300 text-slate-950 shadow-[0_12px_30px_rgba(86,196,255,0.35)] hover:bg-cyan-200",
  secondary:
    "border-white/12 bg-white/6 text-white hover:bg-white/10",
  ghost:
    "border-white/10 bg-slate-950/35 text-slate-200 hover:bg-slate-950/55",
  accent:
    "border-amber-300/35 bg-amber-300 text-slate-950 shadow-[0_12px_30px_rgba(255,190,92,0.3)] hover:bg-amber-200",
};

export function ActionButton({
  label,
  onClick,
  disabled = false,
  variant = "secondary",
}: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition duration-200 ${variantClasses[variant]} disabled:cursor-not-allowed disabled:border-white/8 disabled:bg-white/5 disabled:text-slate-500 disabled:shadow-none`}
    >
      {label}
    </button>
  );
}
