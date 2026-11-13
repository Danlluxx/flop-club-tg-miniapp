import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { api, type PayrollPeriod } from "../../lib/api";

const PERIODS: Array<{ id: PayrollPeriod; label: string }> = [
  { id: "day", label: "День" },
  { id: "week", label: "Неделя" },
  { id: "month", label: "Месяц" }
];
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const MONTHS_NOMINATIVE = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

const money = (value: number) => `${Math.round(value).toLocaleString("ru-RU")} ₽`;
const hoursText = (value: number) => `${String(Math.round(value * 100) / 100).replace(".", ",")} ч`;
const dayText = (key: string) => `${+key.slice(8, 10)} ${MONTHS[+key.slice(5, 7) - 1]}`;

function shiftDate(key: string, period: PayrollPeriod, direction: 1 | -1) {
  const date = new Date(`${key}T00:00:00.000Z`);
  if (period === "month") date.setUTCMonth(date.getUTCMonth() + direction, 1);
  else date.setUTCDate(date.getUTCDate() + direction * (period === "week" ? 7 : 1));
  return date.toISOString().slice(0, 10);
}

function periodTitle(period: PayrollPeriod, from: string, to: string) {
  if (period === "day") return `${dayText(from)} ${from.slice(0, 4)}`;
  if (period === "month") return `${MONTHS_NOMINATIVE[+from.slice(5, 7) - 1]} ${from.slice(0, 4)}`;
  return `${dayText(from)} — ${dayText(to)}`;
}

export function PayrollAnalyticsPage() {
  const access = useQuery({ queryKey: ["admin", "analytics-access"], queryFn: api.analyticsAccess });
  const [period, setPeriod] = useState<PayrollPeriod>("week");
  const [date, setDate] = useState<string | undefined>();
  const analytics = useQuery({
    queryKey: ["admin", "payroll", "analytics", period, date ?? "today"],
    queryFn: () => api.payrollAnalytics(period, date),
    enabled: access.data?.allowed === true,
    placeholderData: (previous) => previous
  });
  const data = analytics.data;
  const top = Math.max(1, ...(data?.employees.map((row) => row.earned) ?? [0]));

  return (
    <section className="space-y-4">
      <Link to="/admin/payroll" className="tap inline-flex items-center gap-2 text-sm font-bold text-slate-400">
        <ArrowLeft className="h-4 w-4" /> Смены
      </Link>
      <h2 className="page-title text-[2.4rem]">Аналитика смен</h2>

      {access.data && !access.data.allowed && <div className="app-panel p-5 text-sm font-semibold text-slate-400">Раздел доступен только владельцу.</div>}

      {access.data?.allowed && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {PERIODS.map((item) => (
              <button key={item.id} type="button" onClick={() => { setPeriod(item.id); setDate(undefined); }}
                className={`tap rounded-[0.55rem] px-3 py-3 text-sm font-black ${period === item.id ? "bg-white text-graphite" : "bg-white/8 text-white"}`}>
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <button type="button" aria-label="Назад" disabled={!data || data.from <= data.importFrom} onClick={() => data && setDate(shiftDate(data.from, period, -1))}
              className="tap grid h-10 w-10 place-items-center rounded-[0.55rem] bg-white/8 text-white disabled:opacity-30">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-sm font-black text-white">{data ? periodTitle(period, data.from, data.to) : "..."}</p>
            <button type="button" aria-label="Вперёд" disabled={!data || data.to >= data.today} onClick={() => data && setDate(shiftDate(data.from, period, 1))}
              className="tap grid h-10 w-10 place-items-center rounded-[0.55rem] bg-white/8 text-white disabled:opacity-30">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {data && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Заработано", value: money(data.totals.earned) },
                  { label: "Часов", value: hoursText(data.totals.hours) },
                  { label: "Смен", value: String(data.totals.shifts) }
                ].map((item) => (
                  <div key={item.label} className="app-panel p-3">
                    <p className="text-[0.65rem] font-bold uppercase text-slate-500">{item.label}</p>
                    <p className="mt-1 text-lg font-black text-white">{item.value}</p>
                  </div>
                ))}
              </div>

              {data.employees.length === 0 && <div className="app-panel p-5 text-sm font-semibold text-slate-400">За этот период отработанных смен нет.</div>}
              <div className="space-y-2">
                {data.employees.map((row) => (
                  <div key={row.name} className="app-panel p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate font-black text-white">{row.name}</p>
                      <p className="shrink-0 font-black text-white">{money(row.earned)}</p>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-400">
                      смен: {row.shifts} · {hoursText(row.hours)}{row.days !== row.shifts ? ` · дней: ${row.days}` : ""}
                    </p>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-white/70" style={{ width: `${Math.max(3, (row.earned / top) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500">Считается по ставкам из листа «Сотрудники», без премий и штрафов. Неявки и запланированные смены не учитываются. Данные с {dayText(data.importFrom)}.</p>
            </>
          )}
        </>
      )}
    </section>
  );
}
