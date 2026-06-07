import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, Settings } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { api } from "../../lib/api";

export function AdminDashboard() {
  const { data, isLoading } = useQuery({ queryKey: ["admin", "stats"], queryFn: api.stats });
  const dailyFillRates = data?.dailyFillRates ?? [];

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
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Заполнение по дням</p>
            <p className="mt-1 text-sm font-semibold text-slate-400">Среднее по турнирам каждого дня</p>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {isLoading && <p className="text-sm text-slate-400">Загрузка…</p>}
          {!isLoading && dailyFillRates.length === 0 && <p className="text-sm text-slate-400">Данных пока нет.</p>}
          {dailyFillRates.slice(0, 10).map((item) => {
            const percent = Math.round(item.averageFillRate * 100);
            return (
              <div key={item.date} className="rounded-[1.25rem] bg-white/[0.04] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-white">{format(parseISO(item.date), "d MMMM", { locale: ru })}</p>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500">
                      {item.tournaments} турн. · {item.registrations}/{item.capacity}
                    </p>
                  </div>
                  <p className="text-xl font-black text-white">{percent}%</p>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-electric to-rose-400" style={{ width: `${Math.min(percent, 100)}%` }} />
                </div>
              </div>
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
