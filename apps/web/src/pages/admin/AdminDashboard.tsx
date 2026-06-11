import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, Plus, Settings } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { api } from "../../lib/api";

export function AdminDashboard() {
  const { data, isLoading } = useQuery({ queryKey: ["admin", "stats"], queryFn: api.stats });
  const tournamentFillRates = data?.tournamentFillRates ?? [];

  return (
    <section className="space-y-4">
      <div>
        <p className="page-kicker">Flop Club</p>
        <h2 className="page-title mt-3">Админ</h2>
        <p className="page-subtitle mt-4">Турниры, участники и статистика клуба.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          ["Турниров", data?.totalTournaments ?? "…"],
          ["Активных", data?.activeTournaments ?? "…"],
          ["Записей", data?.totalRegistrations ?? "…"],
          ["Пользователей", data?.totalUsers ?? "…"],
          ["Заполнение", data ? `${Math.round(data.averageFillRate * 100)}%` : "…"]
        ].map(([label, value]) => (
          <div key={label} className={`app-panel p-4 ${label === "Заполнение" ? "col-span-2" : ""}`}>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-black">{isLoading ? "…" : value}</p>
          </div>
        ))}
      </div>

      <div className="app-panel p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Заполнение турниров</p>
            <p className="mt-1 text-sm font-semibold text-slate-400">По занятым местам за столами</p>
          </div>
          <Link to="/admin/fill-rates" className="tap grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/8 text-white" aria-label="Все турниры по заполнению">
            <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
        <div className="mt-4 space-y-3">
          {isLoading && <p className="text-sm text-slate-400">Загрузка…</p>}
          {!isLoading && tournamentFillRates.length === 0 && <p className="text-sm text-slate-400">Данных пока нет.</p>}
          {tournamentFillRates.slice(0, 5).map((item) => {
            const percent = Math.round(item.fillRate * 100);
            return (
              <Link key={item.id} to={`/admin/tournaments/${item.id}/participants`} className="tap block rounded-[1.25rem] bg-white/[0.04] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-white">{item.title}</p>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500">
                      {format(parseISO(item.startsAt), "d MMMM", { locale: ru })} · {item.participants}/{item.capacity}
                    </p>
                  </div>
                  <p className="text-xl font-black text-white">{percent}%</p>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-electric to-rose-400" style={{ width: `${Math.min(percent, 100)}%` }} />
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3">
        <Link to="/admin/tournaments/new" className="app-button-primary tap flex items-center justify-between px-5">
          Создать турнир <Plus className="h-5 w-5" />
        </Link>
        <Link to="/admin/tournaments" className="app-panel tap flex items-center justify-between p-4 font-bold">
          Управление турнирами <Settings className="h-5 w-5 text-electric" />
        </Link>
      </div>
    </section>
  );
}
