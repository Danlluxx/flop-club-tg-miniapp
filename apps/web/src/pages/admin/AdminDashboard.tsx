import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, Plus, Settings } from "lucide-react";
import { api } from "../../lib/api";

export function AdminDashboard() {
  const { data, isLoading } = useQuery({ queryKey: ["admin", "stats"], queryFn: api.stats });
  const averageFillPercent = data ? Math.round(data.averageFillRate * 100) : 0;

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

      <Link to="/admin/fill-rates" className="app-panel tap block p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Заполнение турниров</p>
            <p className="mt-1 text-sm font-semibold text-slate-400">Среднее по всем турнирам</p>
          </div>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/8 text-white" aria-hidden="true">
            <ArrowRight className="h-5 w-5" />
          </span>
        </div>

        <div className="mt-6 flex items-end justify-between gap-4">
          <p className="text-5xl font-black text-white">{isLoading ? "…" : `${averageFillPercent}%`}</p>
          <p className="pb-1 text-right text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Открыть<br />детали</p>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-electric to-rose-400" style={{ width: `${Math.min(averageFillPercent, 100)}%` }} />
        </div>
      </Link>

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
