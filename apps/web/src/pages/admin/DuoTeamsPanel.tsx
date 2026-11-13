import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shuffle, Trash2, UsersRound } from "lucide-react";
import { api } from "../../lib/api";
import { useToast } from "../../components/Toast";
import { formatBarnaulShortDateTime } from "../../lib/barnaulDate";

// FLOP DUO 2x2: pairs before the merge, one button to merge at the break after level 10.
export function DuoTeamsPanel({ tournamentId }: { tournamentId: string }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [picked, setPicked] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const { data } = useQuery({ queryKey: ["admin", "duo", tournamentId], queryFn: () => api.duoState(tournamentId), refetchInterval: 5000 });

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", "duo", tournamentId] }),
      queryClient.invalidateQueries({ queryKey: ["participants", tournamentId] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "live", tournamentId] })
    ]);
  }
  const onError = (error: Error) => showToast(error.message, "error");

  const pair = useMutation({
    mutationFn: (userIds: [string, string]) => api.duoPair(tournamentId, userIds),
    onSuccess: async () => { setPicked([]); showToast("Команда собрана"); await refresh(); },
    onError
  });
  const unpair = useMutation({
    mutationFn: (pairId: string) => api.duoUnpair(tournamentId, pairId),
    onSuccess: async () => { showToast("Команда распущена"); await refresh(); },
    onError
  });
  const draw = useMutation({
    mutationFn: () => api.duoDraw(tournamentId),
    onSuccess: async (result) => {
      showToast(result.paired ? `Жеребьёвка: ${result.paired} команд${result.left ? ", один игрок без пары" : ""}` : "Некого объединять");
      await refresh();
    },
    onError
  });
  const merge = useMutation({
    mutationFn: () => api.duoMerge(tournamentId),
    onSuccess: async (result) => {
      showToast(`Объединено команд: ${result.teams}`);
      await refresh();
    },
    onError
  });

  if (!data) return null;

  function toggle(userId: string) {
    setPicked((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : current.length >= 2 ? [current[1], userId] : [...current, userId]));
  }

  const busy = pair.isPending || unpair.isPending || draw.isPending || merge.isPending;
  const tooEarly = new Date(data.mergeOpensAt).getTime() > Date.now();

  return (
    <section className="app-panel space-y-3 p-3" aria-label="Команды FLOP DUO">
      <div className="flex items-center gap-2">
        <UsersRound className="h-5 w-5 text-slate-400" />
        <h3 className="text-base font-black text-white">Команды 2×2</h3>
        <span className="ml-auto text-xs font-semibold text-slate-400">
          {data.merged ? "Объединены" : `Объединение после 10 уровня, с ${formatBarnaulShortDateTime(data.mergeOpensAt)}`}
        </span>
      </div>

      {data.teams.length > 0 && (
        <ul className="space-y-1.5">
          {data.teams.map((team) => (
            <li key={team.id} className="flex items-center gap-2 text-sm font-semibold text-white">
              <span className="min-w-0 flex-1 truncate">{team.players.map((player) => player.name).join(" + ")}</span>
              {data.merged && (
                <span className="shrink-0 text-xs font-bold text-slate-300">
                  {team.cards.active ? `${team.cards.active.card === "timeout" ? "Тайм-аут" : "Подсказка"} · ${Math.max(0, Math.ceil((new Date(team.cards.active.endsAt).getTime() - now) / 1000))} с` : `Т ${team.cards.timeoutLeft}/2 · П ${team.cards.hintLeft}/2`}
                </span>
              )}
              {!data.merged && (
                <button type="button" className="tap inline-flex h-9 w-9 items-center justify-center rounded-[0.55rem] bg-rose-500/12 text-rose-100" aria-label="Распустить команду" disabled={busy} onClick={() => unpair.mutate(team.id)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!data.merged && data.solo.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-400">Без пары: отметьте двоих и соберите команду</p>
          <div className="flex flex-wrap gap-1.5">
            {data.solo.map((player) => (
              <button
                key={player.userId}
                type="button"
                aria-pressed={picked.includes(player.userId)}
                className={`tap rounded-[0.55rem] px-3 py-2 text-xs font-bold ${picked.includes(player.userId) ? "bg-emerald/20 text-emerald" : "bg-white/5 text-slate-200"}`}
                onClick={() => toggle(player.userId)}
              >
                {player.name}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" className="app-button-primary flex-1" disabled={busy || picked.length !== 2} onClick={() => pair.mutate(picked as [string, string])}>
              Собрать команду
            </button>
            <button type="button" className="tap inline-flex h-11 items-center gap-1.5 rounded-[0.75rem] bg-white/5 px-3 text-sm font-bold text-slate-100" disabled={busy || data.solo.length < 2} onClick={() => draw.mutate()}>
              <Shuffle className="h-4 w-4" />
              Жеребьёвка
            </button>
          </div>
        </div>
      )}

      {!data.merged && (
        <button type="button" className="app-button-primary w-full" disabled={busy || tooEarly || data.teams.length === 0} onClick={() => merge.mutate()}>
          {tooEarly ? "Объединить (после 10 уровня)" : "Объединить команды"}
        </button>
      )}
      <p className="text-xs leading-snug text-slate-500">
        Т — тайм-ауты, П — подсказки партнёра, осталось из двух: игроки используют их в приложении. Пары назначаются на перерыве после 10 уровня. Если партнёр уже вылетел, второй играет за команду один. После объединения вылет игрока на месте команды закрывает место обоим.
      </p>
    </section>
  );
}
