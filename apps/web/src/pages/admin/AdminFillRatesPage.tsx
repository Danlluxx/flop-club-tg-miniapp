import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";

const numberFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 1
});

function monthLabel(month: string) {
  return format(parseISO(`${month}-01`), "LLLL yyyy", { locale: ru });
}

type TournamentSort = "newest" | "oldest" | "fill-desc" | "fill-asc";

const tournamentSortOptions: Array<{ value: TournamentSort; label: string }> = [
  { value: "newest", label: "Сначала новые" },
  { value: "oldest", label: "Сначала старые" },
  { value: "fill-desc", label: "Макс. заполн." },
  { value: "fill-asc", label: "Мин. заполн." }
];

export function AdminFillRatesPage() {
  const navigate = useNavigate();
  const [sort, setSort] = useState<TournamentSort>("newest");
  const [isSortOpen, setIsSortOpen] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["admin", "stats"], queryFn: api.stats });
  const tournaments = data?.tournamentFillRates ?? [];
  const monthlyParticipantAverages = data?.monthlyParticipantAverages ?? [];
  const averageFillPercent = data ? Math.round(data.averageFillRate * 100) : 0;
  const selectedSort = tournamentSortOptions.find((option) => option.value === sort) ?? tournamentSortOptions[0];
  const sortedTournaments = useMemo(() => {
    return [...tournaments].sort((left, right) => {
      if (sort === "newest") return new Date(right.startsAt).getTime() - new Date(left.startsAt).getTime();
      if (sort === "oldest") return new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime();
      if (sort === "fill-desc") return right.fillRate - left.fillRate || new Date(right.startsAt).getTime() - new Date(left.startsAt).getTime();
      return left.fillRate - right.fillRate || new Date(right.startsAt).getTime() - new Date(left.startsAt).getTime();
    });
  }, [sort, tournaments]);

  return (
    <section className="space-y-4">
      <button type="button" onClick={() => navigate("/admin")} className="screen-back tap" aria-label="Назад">
        <ArrowRight className="h-5 w-5 rotate-180" />
      </button>

      <div>
        <p className="page-kicker">Flop Club</p>
        <h1 className="page-title mt-3 text-[3rem]">Статистика</h1>
        <p className="page-subtitle mt-4">Заполнение турниров и среднее количество участников.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="app-panel admin-stat-panel p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Заполнение</p>
          <p className="mt-2 text-3xl font-black text-white">{isLoading ? "…" : `${averageFillPercent}%`}</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-electric to-rose-400" style={{ width: `${Math.min(averageFillPercent, 100)}%` }} />
          </div>
        </div>
        <div className="app-panel admin-stat-panel p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Среднее участников</p>
          <p className="mt-2 text-3xl font-black text-white">
            {isLoading || !data ? "…" : numberFormatter.format(data.averageParticipantsPerTournament)}
          </p>
          <p className="mt-3 text-xs font-semibold text-slate-500">на турнир</p>
        </div>
      </div>

      <div className="app-panel admin-stat-panel p-5">
        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">По месяцам</p>
        <div className="mt-4 space-y-3">
          {isLoading && <p className="text-sm font-semibold text-slate-500">Загрузка…</p>}
          {!isLoading && monthlyParticipantAverages.length === 0 && (
            <p className="text-sm font-semibold text-slate-500">Данных по турнирам пока нет.</p>
          )}
          {monthlyParticipantAverages.map((item) => (
            <div key={item.month} className="rounded-[0.65rem] border border-white/8 bg-white/[0.035] p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black uppercase text-white">{monthLabel(item.month)}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {item.tournaments} турн. · {item.participants} участн.
                  </p>
                </div>
                <p className="shrink-0 text-2xl font-black text-white">{numberFormatter.format(item.averageParticipants)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="space-y-3">
          <p className="px-1 text-xs font-black uppercase tracking-[0.16em] text-slate-500">По турнирам</p>
          <div className="admin-sort">
            <button
              type="button"
              className="admin-sort-trigger tap"
              onClick={() => setIsSortOpen((value) => !value)}
              aria-expanded={isSortOpen}
            >
              <span>
                Сортировка
                <strong>{selectedSort.label}</strong>
              </span>
              <ChevronDown className={`h-5 w-5 transition-transform ${isSortOpen ? "rotate-180" : ""}`} />
            </button>
            {isSortOpen && (
              <div className="admin-sort-menu">
                {tournamentSortOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`admin-sort-option tap ${sort === option.value ? "admin-sort-option-active" : ""}`}
                    onClick={() => {
                      setSort(option.value);
                      setIsSortOpen(false);
                    }}
                  >
                    {option.label}
                    {sort === option.value && <Check className="h-4 w-4" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {isLoading && <div className="app-panel admin-stat-panel p-5 text-sm text-slate-400">Загрузка…</div>}
        {!isLoading && tournaments.length === 0 && <div className="app-panel admin-stat-panel p-5 text-sm text-slate-400">Турниров пока нет.</div>}
        {sortedTournaments.map((item) => {
          const percent = Math.round(item.fillRate * 100);
          return (
            <Link key={item.id} to={`/admin/tournaments/${item.id}/participants`} className="app-panel admin-stat-panel tap block p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-lg font-black text-white">{item.title}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-500">{format(parseISO(item.startsAt), "d MMMM, HH:mm", { locale: ru })}</p>
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
