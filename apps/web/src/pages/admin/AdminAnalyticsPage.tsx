import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { api, type AdminAnalytics, type AnalyticsPeriod } from "../../lib/api";
import { formatBarnaulDateTime } from "../../lib/barnaulDate";

const weekdayNames = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
const previousLabels: Record<AnalyticsPeriod, string> = { day: "Неделю назад", week: "Прошлая неделя", month: "Прошлый месяц" };
const trendLabels: Record<AnalyticsPeriod, string> = { day: "12 дней", week: "12 недель", month: "12 месяцев" };
const countFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

export function formatRubles(value: number) {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function day(key: string, pattern: string) {
  return format(parseISO(key), pattern, { locale: ru });
}

function rangeLabel(period: AnalyticsPeriod, from: string, to: string) {
  if (period === "day") return day(from, "EEEEEE, d MMMM");
  if (period === "month") return day(from, "LLLL yyyy");
  return from.slice(0, 7) === to.slice(0, 7) ? `${day(from, "d")}–${day(to, "d MMMM")}` : `${day(from, "d MMM")} – ${day(to, "d MMM")}`;
}

function percentChange(current: number, previous: number) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="app-panel p-4">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="analytics-value mt-1.5">{value}</p>
      {note && <p className="mt-1 text-xs font-semibold text-slate-500">{note}</p>}
    </div>
  );
}

function RevenueHero({ data }: { data: AdminAnalytics }) {
  const { summary, previous, period, isComplete } = data;
  const change = isComplete ? percentChange(summary.revenue, previous.revenue) : null;
  const parts = [
    { key: "buy-in", label: "Входы", count: summary.visits - summary.staffVisits, value: summary.buyInRevenue },
    { key: "add-on", label: "Add-on", count: summary.addOns, value: summary.addOnRevenue },
    { key: "re-entry", label: "Re-entry", count: summary.reEntries, value: summary.reEntryRevenue }
  ];
  return (
    <div className="app-panel space-y-4 p-4">
      <div>
        <p className="text-sm font-semibold text-slate-400">Выручка{isComplete ? "" : period === "day" ? ", день ещё идёт" : ", период ещё идёт"}</p>
        <p className="analytics-hero mt-1">{formatRubles(summary.revenue)}</p>
        <p className="mt-1.5 text-sm font-semibold text-slate-400">
          {previousLabels[period]}: {formatRubles(previous.revenue)}
          {change !== null ? ` · ${change > 0 ? "+" : ""}${change}%` : ""}
        </p>
      </div>
      {summary.revenue > 0 && (
        <div className="analytics-stack" role="img" aria-label="Состав выручки">
          {parts.filter((part) => part.value > 0).map((part) => (
            <span key={part.key} className={`analytics-part-${part.key}`} style={{ flexGrow: part.value }} title={`${part.label}: ${formatRubles(part.value)}`} />
          ))}
        </div>
      )}
      <div className="grid gap-2">
        {parts.map((part) => (
          <div key={part.key} className="flex items-center gap-2 text-sm">
            <span className={`analytics-dot analytics-part-${part.key}`} aria-hidden="true" />
            <span className="min-w-0 flex-1 font-semibold text-slate-300">{part.label} · {part.count}</span>
            <span className="font-bold text-white">{formatRubles(part.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RevenueTrend({ data, onSelect }: { data: AdminAnalytics; onSelect: (anchor: string) => void }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(...data.trend.map((item) => item.revenue), 1);
  const selectedIndex = data.trend.length - 1;
  const shown = data.trend[hovered ?? selectedIndex];
  return (
    <div className="app-panel space-y-3 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-black text-white">{trendLabels[data.period]}</p>
        <p className="min-w-0 truncate text-right text-xs font-semibold text-slate-400">
          {rangeLabel(data.period, shown.from, shown.to)}: <b className="text-white">{formatRubles(shown.revenue)}</b>
        </p>
      </div>
      <div className="analytics-bars" onMouseLeave={() => setHovered(null)}>
        {data.trend.map((item, index) => (
          <button
            key={item.from}
            type="button"
            className={`analytics-bar tap ${index === selectedIndex ? "analytics-bar-active" : ""}`}
            onClick={() => onSelect(item.from)}
            onMouseEnter={() => setHovered(index)}
            onFocus={() => setHovered(index)}
            onBlur={() => setHovered(null)}
            aria-label={`${rangeLabel(data.period, item.from, item.to)}: ${formatRubles(item.revenue)}, турниров ${item.tournaments}`}
          >
            <span style={{ height: `${item.revenue ? Math.max((item.revenue / max) * 100, 3) : 0}%` }} />
          </button>
        ))}
      </div>
      <div className="flex justify-between text-xs font-semibold text-slate-500">
        <span>{day(data.trend[0].from, data.period === "month" ? "LLL yyyy" : "d MMM")}</span>
        <span>{day(data.trend[selectedIndex].from, data.period === "month" ? "LLL yyyy" : "d MMM")}</span>
      </div>
    </div>
  );
}

function BarRow({ title, value, note, share }: { title: string; value: string; note: string; share: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-bold text-white">{title}</p>
        <p className="shrink-0 text-sm font-bold text-white">{value}</p>
      </div>
      <div className="analytics-meter mt-1.5"><span style={{ width: `${Math.max(share * 100, 2)}%` }} /></div>
      <p className="mt-1 text-xs font-semibold text-slate-500">{note}</p>
    </div>
  );
}

function RosterRow({ player }: { player: AdminAnalytics["tournaments"][number]["roster"][number] }) {
  const reEntries = player.entries - 1;
  const extras = [reEntries > 0 && `re-entry ${reEntries}`, player.addOns > 0 && `add-on ${player.addOns}`].filter(Boolean).join(" · ");
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="min-w-0 truncate font-bold text-white">{player.name}</span>
          {player.isStaff && <span className="shrink-0 rounded-[0.4rem] bg-white/10 px-1.5 py-0.5 text-[0.65rem] font-bold text-slate-300">сотрудник</span>}
          {player.isNew && <span className="shrink-0 rounded-[0.4rem] bg-emerald/15 px-1.5 py-0.5 text-[0.65rem] font-bold text-emerald">новый</span>}
        </span>
        {extras && <span className="mt-0.5 block text-xs font-semibold text-slate-500">{extras}</span>}
      </span>
      <span className="shrink-0 font-bold text-white">{formatRubles(player.spent)}</span>
    </div>
  );
}

function TournamentRow({ item, defaultOpen = false }: { item: AdminAnalytics["tournaments"][number]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const fill = item.capacity ? Math.round((item.players / item.capacity) * 100) : 0;
  return (
    <article className="app-panel admin-player">
      <button type="button" className="tap flex min-h-14 w-full items-center gap-2 p-3 text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-white">{item.title.toUpperCase()}</span>
          <span className="mt-0.5 block truncate text-xs font-semibold text-slate-400">{formatBarnaulDateTime(item.startsAt)} · {item.players} игр. · {fill}%</span>
        </span>
        <span className="shrink-0 text-sm font-bold text-white">{formatRubles(item.revenue)}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-white/10 p-3 text-sm font-semibold text-slate-400">
          <p className="flex justify-between gap-3"><span>Входы: {item.players - item.staffPlayers} × {formatRubles(item.buyIn)}</span><b className="text-white">{formatRubles(item.buyInRevenue)}</b></p>
          {item.staffPlayers > 0 && <p className="flex justify-between gap-3"><span>Сотрудники, первый вход: {item.staffPlayers}</span><b className="text-white">{formatRubles(0)}</b></p>}
          <p className="flex justify-between gap-3"><span>Re-entry: {item.reEntries} × {formatRubles(item.reEntry)}</span><b className="text-white">{formatRubles(item.reEntryRevenue)}</b></p>
          <p className="flex justify-between gap-3"><span>Add-on: {item.addOns} × {formatRubles(item.addOnPrice)}</span><b className="text-white">{formatRubles(item.addOnRevenue)}</b></p>
          <p className="flex justify-between gap-3"><span>Записались, но не пришли</span><b className="text-white">{item.registered - item.players}</b></p>
          <Link to={`/admin/tournaments/${item.id}/participants`} className="tap mt-2 flex min-h-10 items-center justify-between rounded-[0.75rem] bg-white/8 px-3 text-xs font-black text-white">
            Участники <ArrowRight className="h-4 w-4" />
          </Link>
          {item.roster.length > 0 && (
            <div className="space-y-2.5 pt-3">
              <p className="text-sm font-black text-white">Кто сколько принёс</p>
              {item.roster.map((player, index) => <RosterRow key={`${player.name}-${index}`} player={player} />)}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export function AdminAnalyticsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPeriod = searchParams.get("period");
  const period: AnalyticsPeriod = requestedPeriod === "day" || requestedPeriod === "week" ? requestedPeriod : "month";
  const anchor = searchParams.get("anchor") ?? undefined;
  const access = useQuery({ queryKey: ["admin", "analytics-access"], queryFn: api.analyticsAccess });
  const { data, isError } = useQuery({
    queryKey: ["admin", "analytics", period, anchor],
    queryFn: () => api.analytics(period, anchor),
    enabled: Boolean(access.data?.allowed),
    placeholderData: keepPreviousData
  });

  function select(nextPeriod: AnalyticsPeriod, nextAnchor?: string) {
    setSearchParams((params) => {
      params.set("period", nextPeriod);
      if (nextAnchor) params.set("anchor", nextAnchor);
      else params.delete("anchor");
      return params;
    }, { replace: true });
  }

  if (access.data && !access.data.allowed) return <Navigate to="/admin" replace />;

  const summary = data?.summary;
  const isDay = data?.period === "day";
  const windowLabel = period === "week" ? "за 12 недель" : "за 12 месяцев";
  const maxFormatRevenue = Math.max(...(data?.formats ?? []).map((item) => item.revenue), 1);
  const maxWeekdayPlayers = Math.max(...(data?.weekdays ?? []).map((item) => item.averagePlayers), 1);

  return (
    <section className="space-y-4">
      <Link to="/admin" className="screen-back tap" aria-label="Назад">
        <ArrowRight className="h-5 w-5 rotate-180" />
      </Link>

      <div>
        <p className="page-kicker">Flop Club</p>
        <h1 className="page-title mt-3">Аналитика</h1>
        <p className="page-subtitle mt-4">Расчётная выручка по отметкам: только пришедшие игроки, по ценам турнира. Призы не вычитаются.</p>
      </div>

      <div className="rating-scope-tabs analytics-period-tabs" role="tablist" aria-label="Период">
        {([["day", "День"], ["week", "Неделя"], ["month", "Месяц"]] as const).map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={period === value} className={`rating-scope-tab tap ${period === value ? "rating-scope-tab-active" : ""}`} onClick={() => select(value)}>
            {label}
          </button>
        ))}
      </div>

      {(isError || access.isError) && <div className="app-panel p-5 text-sm font-semibold text-slate-400">Не удалось загрузить аналитику.</div>}
      {!data && !isError && !access.isError && <div className="app-panel p-5 text-sm font-semibold text-slate-400">Загрузка…</div>}

      {data && summary && (
        <>
          <div className="flex items-center gap-2">
            <button type="button" className="tap grid h-10 w-10 shrink-0 place-items-center rounded-[0.55rem] bg-white/8 text-white" onClick={() => select(period, data.previousFrom)} aria-label="Предыдущий период">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <p className={`min-w-0 flex-1 truncate text-center text-sm font-bold text-white ${period === "month" ? "capitalize" : ""}`}>{rangeLabel(period, data.from, data.to)}</p>
            <button type="button" className="tap grid h-10 w-10 shrink-0 place-items-center rounded-[0.55rem] bg-white/8 text-white disabled:opacity-30" disabled={!data.hasNext} onClick={() => select(period, data.nextAnchor)} aria-label="Следующий период">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <RevenueHero data={data} />
          <RevenueTrend data={data} onSelect={(next) => select(period, next)} />

          {isDay ? summary.tournaments > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <Tile label="Игроков" value={String(summary.visits)} note={`заполнение ${Math.round(summary.fillRate * 100)}%`} />
              <Tile label="Средний чек" value={formatRubles(summary.revenue / summary.visits)} note="на игрока" />
              <Tile label="Новые игроки" value={String(summary.newPlayers)} note={`постоянных ${summary.returningPlayers}`} />
              <Tile label="Не пришли" value={summary.registered ? `${Math.round((summary.noShows / summary.registered) * 100)}%` : "—"} note={`${summary.noShows} из ${summary.registered} записей`} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Tile label="Турниров" value={String(summary.tournaments)} note={`в среднем ${formatRubles(summary.averageRevenue)}`} />
              <Tile label="Игроков на турнир" value={countFormatter.format(summary.averagePlayers)} note={`заполнение ${Math.round(summary.fillRate * 100)}%`} />
              <Tile label="Разных игроков" value={String(summary.uniquePlayers)} note={`новых ${summary.newPlayers}, постоянных ${summary.returningPlayers}`} />
              <Tile label="Не пришли" value={summary.registered ? `${Math.round((summary.noShows / summary.registered) * 100)}%` : "—"} note={`${summary.noShows} из ${summary.registered} записей`} />
            </div>
          )}

          {!isDay && data.topPlayers.length > 0 && (
            <div className="app-panel space-y-3 p-4">
              <p className="text-sm font-black text-white">Самые активные игроки</p>
              {data.topPlayers.map((player, index) => (
                <div key={`${player.name}-${index}`} className="flex items-center gap-3 text-sm">
                  <span className="w-4 shrink-0 text-center font-bold text-slate-500">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-bold text-white">{player.name}</span>
                  <span className="shrink-0 text-xs font-semibold text-slate-400">{player.visits} визит. · {formatRubles(player.spent)}</span>
                </div>
              ))}
            </div>
          )}

          {!isDay && data.formats.length > 0 && (
            <div className="app-panel space-y-3 p-4">
              <p className="text-sm font-black text-white">Форматы {windowLabel}</p>
              {data.formats.slice(0, 6).map((item) => (
                <BarRow
                  key={item.title}
                  title={item.title.toUpperCase()}
                  value={formatRubles(item.revenue)}
                  share={item.revenue / maxFormatRevenue}
                  note={`${item.tournaments} турн. · в среднем ${countFormatter.format(item.averagePlayers)} игр. и ${formatRubles(item.averageRevenue)}`}
                />
              ))}
            </div>
          )}

          {!isDay && data.weekdays.length > 0 && (
            <div className="app-panel space-y-3 p-4">
              <p className="text-sm font-black text-white">Дни недели {windowLabel}</p>
              {data.weekdays.map((item) => (
                <BarRow
                  key={item.weekday}
                  title={weekdayNames[item.weekday]}
                  value={`${countFormatter.format(item.averagePlayers)} игр.`}
                  share={item.averagePlayers / maxWeekdayPlayers}
                  note={`${item.tournaments} турн. · в среднем ${formatRubles(item.averageRevenue)}`}
                />
              ))}
            </div>
          )}

          <div className="space-y-2">
            <p className="px-1 text-sm font-black text-white">{isDay ? "Турниры дня" : "Турниры периода"}</p>
            {data.tournaments.map((item) => <TournamentRow key={`${data.period}-${item.id}`} item={item} defaultOpen={isDay} />)}
            {!data.tournaments.length && (
              <div className="border border-dashed border-white/15 px-4 py-8 text-center text-sm font-semibold text-slate-500">
                {isDay ? "В этот день нет турниров с отмеченными игроками." : "В этом периоде нет турниров с отмеченными игроками."}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
