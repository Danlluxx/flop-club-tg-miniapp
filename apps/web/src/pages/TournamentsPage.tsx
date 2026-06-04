import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, endOfDay } from "date-fns";
import { api } from "../lib/api";
import { SkeletonCard } from "../components/Skeleton";
import { TournamentCard } from "../components/TournamentCard";

const filters = ["today", "open", "all"] as const;
const labels = { today: "Сегодня", open: "Открытые", all: "Неделя" };

export function TournamentsPage() {
  const [filter, setFilter] = useState<(typeof filters)[number]>("all");
  const query = useMemo(() => {
    const now = new Date();
    const params = new URLSearchParams();
    params.set("from", now.toISOString());
    params.set("to", addDays(now, 7).toISOString());

    if (filter === "open") params.set("status", "OPEN");
    if (filter === "today") {
      params.set("to", endOfDay(now).toISOString());
    }

    return `?${params.toString()}`;
  }, [filter]);

  const { data, isLoading, isError } = useQuery({ queryKey: ["tournaments", query], queryFn: () => api.tournaments(query) });

  return (
    <section className="space-y-6">
      <div className="px-1">
        <p className="page-kicker">Flop Club / Barnaul</p>
        <h2 className="page-title mt-3">Турниры</h2>
        <p className="page-subtitle mt-4">Ближайшие турниры</p>
      </div>

      <div className="filter-row">
        {filters.map((item) => (
          <button
            key={item}
            onClick={() => setFilter(item)}
            className={`filter-chip tap ${filter === item ? "filter-chip-active" : ""}`}
          >
            {labels[item]}
          </button>
        ))}
      </div>

      {isLoading && <div className="space-y-3"><SkeletonCard /><SkeletonCard /></div>}
      {isError && <div className="app-panel p-5 text-sm text-rose-200">Не удалось загрузить турниры. Проверьте подключение и API.</div>}
      {!isLoading && data?.length === 0 && (
        <div className="app-panel p-5 text-sm text-slate-300">
          {filter === "today" ? "Сегодня турниров нет" : "На ближайшую неделю турниров пока нет."}
        </div>
      )}
      <div className="space-y-4">{data?.map((tournament) => <TournamentCard key={tournament.id} tournament={tournament} />)}</div>
    </section>
  );
}
