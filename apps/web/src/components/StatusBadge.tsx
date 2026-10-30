import type { TournamentStatus } from "../types";

const labels: Record<TournamentStatus, string> = {
  OPEN: "Открыт",
  CLOSED: "Закрыт",
  CANCELLED: "Отменён",
  FINISHED: "Завершён"
};

const classes: Record<TournamentStatus, string> = {
  OPEN: "bg-electric/10 text-rose-100 ring-electric/25",
  CLOSED: "bg-white/8 text-white/60 ring-white/10",
  CANCELLED: "bg-rose-400/10 text-rose-200 ring-rose-400/20",
  FINISHED: "bg-slate-400/10 text-slate-300 ring-slate-400/15"
};

const dotClasses: Record<TournamentStatus, string> = {
  OPEN: "bg-electric",
  CLOSED: "bg-white/40",
  CANCELLED: "bg-rose-300",
  FINISHED: "bg-slate-400"
};

export function StatusBadge({ status }: { status: TournamentStatus }) {
  return (
    <span className={`inline-flex min-h-8 items-center gap-2 rounded-[0.45rem] px-2.5 text-[0.72rem] font-black uppercase tracking-[0.12em] ring-1 ${classes[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotClasses[status]}`} />
      {labels[status]}
    </span>
  );
}
