import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, Settings } from "lucide-react";
import { api } from "../../lib/api";

export function AdminDashboard() {
  const { data, isLoading } = useQuery({ queryKey: ["admin", "stats"], queryFn: api.stats });

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
          ["Заполнение", data ? `${Math.round(data.averageFillRate * 100)}%` : "…"]
        ].map(([label, value]) => (
          <div key={label} className="app-panel p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-black">{isLoading ? "…" : value}</p>
          </div>
        ))}
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
