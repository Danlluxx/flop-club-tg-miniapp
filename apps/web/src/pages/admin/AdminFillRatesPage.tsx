import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { ArrowRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";

export function AdminFillRatesPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["admin", "stats"], queryFn: api.stats });
  const tournaments = data?.tournamentFillRates ?? [];

  return (
    <section className="space-y-4">
      <button type="button" onClick={() => navigate("/admin")} className="screen-back tap" aria-label="Назад">
        <ArrowRight className="h-5 w-5 rotate-180" />
      </button>

      <div>
        <p className="page-kicker">Flop Club</p>
        <h1 className="page-title mt-3 text-[3rem]">Заполнение</h1>
        <p className="page-subtitle mt-4">Процент занятых мест по каждому турниру.</p>
      </div>

      <div className="space-y-3">
        {isLoading && <div className="app-panel p-5 text-sm text-slate-400">Загрузка…</div>}
        {!isLoading && tournaments.length === 0 && <div className="app-panel p-5 text-sm text-slate-400">Турниров пока нет.</div>}
        {tournaments.map((item) => {
          const percent = Math.round(item.fillRate * 100);
          return (
            <Link key={item.id} to={`/admin/tournaments/${item.id}/participants`} className="app-panel tap block p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-lg font-black text-white">{item.title}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    {format(parseISO(item.startsAt), "d MMMM, HH:mm", { locale: ru })} · {item.participants}/{item.capacity}
                  </p>
                </div>
                <p className="shrink-0 text-2xl font-black text-white">{percent}%</p>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-electric to-rose-400" style={{ width: `${Math.min(percent, 100)}%` }} />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
