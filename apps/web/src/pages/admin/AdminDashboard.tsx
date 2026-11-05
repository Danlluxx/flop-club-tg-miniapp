import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, Plus, Settings } from "lucide-react";
import { api } from "../../lib/api";
import { formatRubles } from "./AdminAnalyticsPage";

export function AdminDashboard() {
  const { data, isLoading } = useQuery({ queryKey: ["admin", "stats"], queryFn: api.stats });
  const access = useQuery({ queryKey: ["admin", "analytics-access"], queryFn: api.analyticsAccess });
  const canViewAnalytics = Boolean(access.data?.allowed);
  const week = useQuery({ queryKey: ["admin", "analytics", "week", undefined], queryFn: () => api.analytics("week"), enabled: canViewAnalytics });
  const month = useQuery({ queryKey: ["admin", "analytics", "month", undefined], queryFn: () => api.analytics("month"), enabled: canViewAnalytics });

  return (
    <section className="space-y-4">
      <div>
        <p className="page-kicker">Flop Club</p>
        <h2 className="page-title mt-3">Админ</h2>
        <p className="page-subtitle mt-4">Турниры, участники и статистика клуба.</p>
      </div>

      {canViewAnalytics && (
        <Link to="/admin/analytics" className="app-panel tap block p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-black text-white">Выручка</p>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-400">Аналитика <ArrowRight className="h-4 w-4" /></span>
          </div>
          <div className="analytics-revenue-grid mt-3">
            {[
              ["Эта неделя", "Прошлая", week.data],
              ["Этот месяц", "Прошлый", month.data]
            ].map(([label, previousLabel, period]) => (
              <div key={label as string} className="min-w-0">
                <p className="text-xs font-semibold text-slate-500">{label as string}</p>
                <p className="analytics-value mt-1">{typeof period === "object" ? formatRubles(period.summary.revenue) : "…"}</p>
                <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                  {previousLabel as string}: {typeof period === "object" ? formatRubles(period.previous.revenue) : "…"}
                </p>
              </div>
            ))}
          </div>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3">
        {[
          ["Проведено", data?.finishedTournaments ?? "…"],
          ["Активных", data?.activeTournaments ?? "…"],
          ["Записей", data?.totalRegistrations ?? "…"],
          ["Пользователей", data?.totalUsers ?? "…"]
        ].map(([label, value]) => (
          <div key={label} className="app-panel p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-black">{isLoading ? "…" : value}</p>
          </div>
        ))}
      </div>

      <Link to="/admin/fill-rates" className="app-panel tap block p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Статистика турниров</p>
            <p className="mt-1 text-sm font-semibold text-slate-400">Заполнение и среднее количество участников</p>
          </div>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[0.65rem] bg-white/8 text-white" aria-hidden="true">
            <ArrowRight className="h-5 w-5" />
          </span>
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
