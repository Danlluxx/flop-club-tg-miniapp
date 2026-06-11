import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Edit3, Trash2, Users } from "lucide-react";
import { api } from "../../lib/api";
import { StatusBadge } from "../../components/StatusBadge";
import { useToast } from "../../components/Toast";
import { formatBarnaulDateTime } from "../../lib/barnaulDate";

export function AdminTournaments() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [tab, setTab] = useState<"active" | "finished">("active");
  const { data, isLoading } = useQuery({ queryKey: ["admin", "tournaments"], queryFn: () => api.tournaments() });
  const activeTournaments = useMemo(
    () => (data ?? []).filter((item) => item.status !== "FINISHED").sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [data]
  );
  const finishedTournaments = useMemo(
    () => (data ?? []).filter((item) => item.status === "FINISHED").sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()),
    [data]
  );
  const visibleTournaments = tab === "active" ? activeTournaments : finishedTournaments;
  const remove = useMutation({
    mutationFn: api.deleteTournament,
    onSuccess: async () => {
      showToast("Турнир удалён");
      await queryClient.invalidateQueries({ queryKey: ["admin", "tournaments"] });
      await queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      await queryClient.invalidateQueries({ queryKey: ["home", "nextTournament"] });
    },
    onError: (error) => showToast(error.message, "error")
  });

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="page-title text-[3rem]">Турниры</h2>
        <Link to="/admin/tournaments/new" className="rounded-full bg-white px-4 py-2 text-sm font-black text-graphite">Новый</Link>
      </div>
      <div className="grid grid-cols-2 rounded-full bg-white/[0.04] p-1">
        <button
          type="button"
          onClick={() => setTab("active")}
          className={`tap rounded-full px-4 py-3 text-sm font-black transition ${tab === "active" ? "bg-white text-graphite" : "text-slate-400"}`}
        >
          Активные · {activeTournaments.length}
        </button>
        <button
          type="button"
          onClick={() => setTab("finished")}
          className={`tap rounded-full px-4 py-3 text-sm font-black transition ${tab === "finished" ? "bg-white text-graphite" : "text-slate-400"}`}
        >
          Завершённые · {finishedTournaments.length}
        </button>
      </div>
      {isLoading && <div className="app-panel p-5">Загрузка...</div>}
      <div className="space-y-3">
        {!isLoading && visibleTournaments.length === 0 && (
          <div className="app-panel p-5 text-sm font-semibold text-slate-400">
            {tab === "active" ? "Активных турниров пока нет." : "Завершённых турниров пока нет."}
          </div>
        )}
        {visibleTournaments.map((item) => (
          <div key={item.id} className="app-panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold">{item.title}</h3>
                <p className="mt-1 text-sm text-slate-400">{formatBarnaulDateTime(item.startsAt)}</p>
              </div>
              <StatusBadge status={item.status} />
            </div>
            <div className="mt-4 flex gap-2">
              <Link to={`/admin/tournaments/${item.id}/edit`} className="tap grid h-10 w-10 place-items-center rounded-full bg-white/8"><Edit3 className="h-4 w-4" /></Link>
              <Link to={`/admin/tournaments/${item.id}/participants`} className="tap grid h-10 w-10 place-items-center rounded-full bg-white/8"><Users className="h-4 w-4" /></Link>
              <button onClick={() => remove.mutate(item.id)} className="tap grid h-10 w-10 place-items-center rounded-full bg-rose-400/15 text-rose-200"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
