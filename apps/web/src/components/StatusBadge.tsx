import type { TournamentStatus } from "../types";

const labels: Record<TournamentStatus, string> = {
  OPEN: "Открыт",
  CLOSED: "Закрыт",
  CANCELLED: "Отменён",
  FINISHED: "Завершён"
};

const classes: Record<TournamentStatus, string> = {
  OPEN: "text-rose-100",
  CLOSED: "text-white/60",
  CANCELLED: "text-rose-200",
  FINISHED: "text-slate-300"
};

export function StatusBadge({ status }: { status: TournamentStatus }) {
  return (
    <span className={`text-[0.72rem] font-black uppercase tracking-[0.12em] ${classes[status]}`}>
      {labels[status]}
    </span>
  );
}
