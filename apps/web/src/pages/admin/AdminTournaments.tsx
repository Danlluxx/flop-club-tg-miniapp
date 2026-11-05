import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Edit3, Trash2 } from "lucide-react";
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
  const [pendingRemoval, setPendingRemoval] = useState<{ id: string; title: string } | null>(null);
  const removeDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (pendingRemoval) removeDialog.current?.showModal(); }, [pendingRemoval]);
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
        <Link to="/admin/tournaments/new" className="rounded-[0.55rem] bg-white px-4 py-2 text-sm font-black text-graphite">Новый</Link>
      </div>
      <div className="grid grid-cols-2 rounded-[0.55rem] bg-white/[0.04] p-1">
        <button
          type="button"
          onClick={() => setTab("active")}
          className={`tap rounded-[0.55rem] px-4 py-3 text-sm font-black transition ${tab === "active" ? "bg-white text-graphite" : "text-slate-400"}`}
        >
          Активные · {activeTournaments.length}
        </button>
        <button
          type="button"
          onClick={() => setTab("finished")}
          className={`tap rounded-[0.55rem] px-4 py-3 text-sm font-black transition ${tab === "finished" ? "bg-white text-graphite" : "text-slate-400"}`}
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
          <div key={item.id} className="app-panel tap relative p-4">
            <Link to={`/admin/tournaments/${item.id}/participants`} aria-label={`Участники: ${item.title}`} className="absolute inset-0 z-0 rounded-[inherit]" />
            <div className="pointer-events-none relative flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold">{item.title.toUpperCase()}</h3>
                <p className="mt-1 text-sm text-slate-400">{formatBarnaulDateTime(item.startsAt)}</p>
              </div>
              <StatusBadge status={item.status} />
            </div>
            <div className="pointer-events-none relative z-10 mt-4 flex gap-2">
              <Link to={`/admin/tournaments/${item.id}/edit`} className="tap pointer-events-auto grid h-10 w-10 place-items-center rounded-[0.55rem] bg-white/8"><Edit3 className="h-4 w-4" /></Link>
              <button type="button" aria-label="Удалить турнир" onClick={() => setPendingRemoval({ id: item.id, title: item.title })} className="tap pointer-events-auto ml-auto grid h-10 w-10 place-items-center rounded-[0.55rem] bg-rose-400/15 text-rose-200"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
      <dialog ref={removeDialog} onClose={() => setPendingRemoval(null)}
        aria-labelledby="remove-tournament-title"
        className="!m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-white/15 bg-graphite p-4 text-white backdrop:bg-black/75">
        {pendingRemoval && (
          <div className="space-y-4">
            <h3 id="remove-tournament-title" className="text-lg font-bold">Удалить {pendingRemoval.title.toUpperCase()}?</h3>
            <p className="text-sm font-semibold text-slate-400">Турнир исчезнет из расписания вместе с записями игроков. Вернуть его будет нельзя.</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => removeDialog.current?.close()} className="tap min-h-12 rounded-md bg-white/8 text-sm font-bold">Отмена</button>
              <button
                type="button"
                onClick={() => {
                  remove.mutate(pendingRemoval.id);
                  removeDialog.current?.close();
                }}
                className="tap min-h-12 rounded-md bg-rose-500 text-sm font-bold text-white"
              >
                Удалить
              </button>
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}
