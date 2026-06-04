import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Armchair } from "lucide-react";
import { api } from "../lib/api";
import { StatusBadge } from "../components/StatusBadge";

export function MyPage() {
  const { data, isLoading } = useQuery({ queryKey: ["me", "registrations"], queryFn: api.myRegistrations });
  const active = data?.filter((item) => item.status === "ACTIVE") ?? [];
  const history = data?.filter((item) => item.status !== "ACTIVE") ?? [];

  return (
    <section className="space-y-5">
      <div>
        <p className="page-kicker">Flop Club</p>
        <h2 className="page-title mt-3">Мои записи</h2>
        <p className="page-subtitle mt-4">Активные регистрации и история отмен.</p>
      </div>
      {isLoading && <div className="app-panel p-5">Загрузка...</div>}
      {!isLoading && active.length === 0 && <div className="app-panel p-5 text-sm text-slate-300">Активных записей пока нет.</div>}
      <div className="space-y-3">
        {active.map((item) => item.tournament && (
          <Link key={item.id} to={`/tournaments/${item.tournament.id}`} className="app-panel tap block p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-bold">{item.tournament.title}</h3>
              <StatusBadge status={item.tournament.status} />
            </div>
            <p className="mt-2 text-sm text-slate-400">{new Date(item.tournament.startsAt).toLocaleString("ru-RU")}</p>
            {item.tableNumber && item.seatNumber && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-electric/30 bg-electric/10 px-3 py-2 text-sm font-bold text-white">
                <Armchair className="h-4 w-4 text-electric" />
                Стол {item.tableNumber} · бокс {item.seatNumber}
              </div>
            )}
          </Link>
        ))}
      </div>
      <div>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-[0.18em] text-slate-500">История</h3>
        <div className="space-y-2">
          {history.map((item) => item.tournament && (
            <div key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-400">
              {item.tournament.title} · отменена {new Date(item.updatedAt).toLocaleDateString("ru-RU")}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
