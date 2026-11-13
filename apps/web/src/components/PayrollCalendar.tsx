import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { barnaulDateKey } from "../lib/barnaulDate";

type CalendarTournament = { id: string; title: string; date: string; shifts: number };

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

function shiftMonth(month: string, delta: number) {
  const date = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

// Month grid: a day with a tournament is tappable and shows how many shifts are already entered for it.
export function PayrollCalendar({ tournaments, selectedId, onSelect }: { tournaments: CalendarTournament[]; selectedId: string; onSelect: (id: string) => void }) {
  const selected = tournaments.find((item) => item.id === selectedId);
  const today = barnaulDateKey();
  const [picked, setPicked] = useState<string | null>(null);
  const month = picked ?? (selected?.date ?? today).slice(0, 7);

  const byDate = new Map<string, CalendarTournament[]>();
  for (const item of tournaments) byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]);

  const first = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = [...Array<null>(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];

  const earliest = tournaments.reduce((min, item) => (item.date < min ? item.date : min), today).slice(0, 7);
  const latest = tournaments.reduce((max, item) => (item.date > max ? item.date : max), today).slice(0, 7);
  const dayTournaments = selected ? byDate.get(selected.date) ?? [] : [];

  return (
    <div className="app-panel space-y-3 p-4">
      <div className="flex items-center justify-between">
        <button type="button" aria-label="Предыдущий месяц" disabled={month <= earliest} onClick={() => setPicked(shiftMonth(month, -1))} className="tap grid h-9 w-9 place-items-center rounded-[0.55rem] bg-white/8 text-white disabled:opacity-30">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-black text-white">{MONTHS[+month.slice(5, 7) - 1]} {month.slice(0, 4)}</p>
        <button type="button" aria-label="Следующий месяц" disabled={month >= latest} onClick={() => setPicked(shiftMonth(month, 1))} className="tap grid h-9 w-9 place-items-center rounded-[0.55rem] bg-white/8 text-white disabled:opacity-30">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((day) => <span key={day} className="pb-1 text-[0.65rem] font-bold uppercase text-slate-500">{day}</span>)}
        {cells.map((day, index) => {
          if (day === null) return <span key={`empty-${index}`} />;
          const key = `${month}-${String(day).padStart(2, "0")}`;
          const items = byDate.get(key) ?? [];
          const isSelected = items.some((item) => item.id === selectedId);
          const shifts = items.reduce((sum, item) => sum + item.shifts, 0);
          return (
            <button
              key={key}
              type="button"
              disabled={!items.length}
              onClick={() => { setPicked(null); onSelect(items.find((item) => item.shifts === 0)?.id ?? items[0].id); }}
              className={`relative grid h-11 place-items-center rounded-[0.55rem] text-sm font-bold ${isSelected ? "bg-white text-graphite" : items.length ? "bg-white/8 text-white" : "text-slate-600"} ${key === today && !isSelected ? "ring-1 ring-white/40" : ""}`}
            >
              {day}
              {items.length > 0 && (
                <span className={`absolute bottom-1 text-[0.6rem] font-black leading-none ${isSelected ? "text-graphite/70" : shifts ? "text-emerald-300" : "text-amber-300"}`}>
                  {shifts ? shifts : "•"}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-[0.7rem] text-slate-500"><span className="text-emerald-300">Число</span> — смен внесено, <span className="text-amber-300">точка</span> — турнир был, смен ещё нет.</p>
      {dayTournaments.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {dayTournaments.map((item) => (
            <button key={item.id} type="button" onClick={() => onSelect(item.id)} className={`tap rounded-[0.55rem] px-3 py-2 text-xs font-bold ${item.id === selectedId ? "bg-white text-graphite" : "bg-white/8 text-white"}`}>
              {item.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
