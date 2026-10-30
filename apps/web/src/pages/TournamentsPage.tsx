import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays } from "date-fns";
import { Check, ChevronDown } from "lucide-react";
import { api } from "../lib/api";
import { endOfBarnaulDayIso, startOfBarnaulDayIso } from "../lib/barnaulDate";
import { SkeletonCard } from "../components/Skeleton";
import { TournamentCard } from "../components/TournamentCard";

const filters = ["today", "open", "all"] as const;
const labels = { today: "Сегодня", open: "Открытые", all: "Неделя" };

export function TournamentsPage() {
  const [filter, setFilter] = useState<(typeof filters)[number]>("today");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const query = useMemo(() => {
    const now = new Date();
    const from = startOfBarnaulDayIso(now);
    const params = new URLSearchParams();
    params.set("from", from);
    params.set("to", addDays(new Date(from), 7).toISOString());

    if (filter === "open") params.set("status", "OPEN");
    if (filter === "today") {
      params.set("to", endOfBarnaulDayIso(now));
    }

    return `?${params.toString()}`;
  }, [filter]);

  const { data, isLoading, isError } = useQuery({ queryKey: ["tournaments", query], queryFn: () => api.tournaments(query) });
  const selectedLabel = labels[filter];

  return (
    <section className="space-y-6">
      <div className="px-1">
        <p className="page-kicker">Flop Club / Barnaul</p>
        <h2 className="page-title mt-3">Турниры</h2>
        <p className="page-subtitle mt-4">Ближайшие турниры</p>
      </div>

      <div className="app-select">
        <button
          type="button"
          className="app-select-trigger tap"
          onClick={() => setIsFilterOpen((value) => !value)}
          aria-expanded={isFilterOpen}
        >
          <span>
            Показывать
            <strong>{selectedLabel}</strong>
          </span>
          <ChevronDown className={`h-5 w-5 transition-transform ${isFilterOpen ? "rotate-180" : ""}`} />
        </button>
        {isFilterOpen && (
          <div className="app-select-menu">
            {filters.map((item) => (
              <button
                key={item}
                type="button"
                className={`app-select-option tap ${filter === item ? "app-select-option-active" : ""}`}
                onClick={() => {
                  setFilter(item);
                  setIsFilterOpen(false);
                }}
              >
                {labels[item]}
                {filter === item && <Check className="h-4 w-4" />}
              </button>
            ))}
          </div>
        )}
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
