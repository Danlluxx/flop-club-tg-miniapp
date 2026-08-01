import { useMemo, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { RatingBoard } from "../components/RatingBoard";
import type { User } from "../types";

type RatingScope = "season" | "global";

const monthNames = [
  "Январская",
  "Февральская",
  "Мартовская",
  "Апрельская",
  "Майская",
  "Июньская",
  "Июльская",
  "Августовская",
  "Сентябрьская",
  "Октябрьская",
  "Ноябрьская",
  "Декабрьская"
];

function monthValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildCurrentMonth() {
  const now = new Date();

  return {
    value: monthValue(now),
    label: `${monthNames[now.getMonth()]} серия`
  };
}

function buildSeriesOptions() {
  const now = new Date();
  const startYear = 2026;
  const startMonth = 5;
  const options: Array<{ value: string; label: string }> = [];

  for (let year = startYear; year <= now.getFullYear(); year += 1) {
    const monthFrom = year === startYear ? startMonth : 0;
    const monthTo = year === now.getFullYear() ? now.getMonth() : 11;

    for (let month = monthFrom; month <= monthTo; month += 1) {
      const date = new Date(year, month, 1);

      options.unshift({
        value: monthValue(date),
        label: `${monthNames[month]} серия`
      });
    }
  }

  return options;
}

export function RatingPage({ user }: { user: User }) {
  const currentMonth = useMemo(buildCurrentMonth, []);
  const seriesOptions = useMemo(buildSeriesOptions, []);
  const [scope, setScope] = useState<RatingScope>("season");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth.value);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");

  function submitSearch() {
    setSearch(searchDraft.trim());
  }

  return (
    <section className="space-y-5 rating-page">
      <Link to="/" className="inline-flex items-center gap-2 text-sm font-bold text-slate-300">
        <ArrowLeft className="h-4 w-4" />
        Назад
      </Link>
      <div>
        <p className="page-kicker">Flop Club / Barnaul</p>
        <h1 className="page-title mt-3">Рейтинг</h1>
      </div>

      <div className="rating-controls">
        <div className="rating-scope-tabs">
          <button
            type="button"
            className={scope === "season" ? "rating-scope-tab rating-scope-tab-active" : "rating-scope-tab"}
            onClick={() => setScope("season")}
          >
            Сезонный
          </button>
          <button
            type="button"
            className={scope === "global" ? "rating-scope-tab rating-scope-tab-active" : "rating-scope-tab"}
            onClick={() => setScope("global")}
          >
            Глобальный
          </button>
        </div>

        {scope === "season" && (
          <div className="rating-month">
            <select className="rating-month-select" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
              {seriesOptions.map((series) => (
                <option key={series.value} value={series.value}>
                  {series.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="rating-search">
          <div className="rating-search-field">
            <Search className="h-5 w-5 text-slate-500" />
            <input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitSearch();
              }}
              placeholder="Поиск по никнейму"
            />
          </div>
          <button type="button" className="rating-search-button tap" onClick={submitSearch}>
            Найти
          </button>
        </div>
      </div>

      <RatingBoard
        user={user}
        compact
        showTitle={false}
        leaderboardParams={{ limit: scope === "global" ? 500 : 50, scope, month: scope === "season" ? selectedMonth : undefined, search }}
      />
    </section>
  );
}
