import type { TournamentStatus } from "../types";

const labels: Record<TournamentStatus, string> = {
  OPEN: "Открыт",
  CLOSED: "Закрыт",
  CANCELLED: "Отменён",
  FINISHED: "Завершён"
};

const classes: Record<TournamentStatus, string> = {
  OPEN: "border-electric/55 bg-electric/12 text-rose-200",
  CLOSED: "border-white/20 bg-white/10 text-white/70",
  CANCELLED: "border-rose-400/40 bg-rose-400/12 text-rose-300",
  FINISHED: "border-slate-400/30 bg-slate-400/10 text-slate-300"
};

export function StatusBadge({ status }: { status: TournamentStatus }) {
  return <span className={`rounded-full border px-4 py-2 text-sm font-black ${classes[status]}`}>{labels[status]}</span>;
}
