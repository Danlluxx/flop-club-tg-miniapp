import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, X } from "lucide-react";
import { api } from "../../lib/api";
import { useToast } from "../../components/Toast";
import type { Registration } from "../../types";

const BREAKS = [1, 2] as const;

function playerName(item: Registration) {
  return item.user?.displayName || [item.user?.firstName, item.user?.lastName].filter(Boolean).join(" ") || item.user?.username || "Игрок";
}

// FLOP CHIP LEADER: who holds the biggest stack after break 1 and break 2.
export function ChipLeaderPanel({ tournamentId, players }: { tournamentId: string; players: Registration[] }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { data: marks = [] } = useQuery({ queryKey: ["admin", "chip-leader", tournamentId], queryFn: () => api.chipLeaderMarks(tournamentId), refetchInterval: 15000 });

  const onSuccess = (next: typeof marks) => queryClient.setQueryData(["admin", "chip-leader", tournamentId], next);
  const onError = (error: Error) => showToast(error.message, "error");
  const set = useMutation({
    mutationFn: ({ breakNumber, registrationId }: { breakNumber: number; registrationId: string }) => api.setChipLeaderMark(tournamentId, breakNumber, registrationId),
    onSuccess: (next) => { onSuccess(next); showToast("Чип-лидер отмечен: +1000 очков"); },
    onError
  });
  const clear = useMutation({
    mutationFn: (breakNumber: number) => api.clearChipLeaderMark(tournamentId, breakNumber),
    onSuccess: (next) => { onSuccess(next); showToast("Отметка снята, 1000 очков списаны"); },
    onError
  });
  const busy = set.isPending || clear.isPending;
  const sorted = [...players].sort((left, right) => playerName(left).localeCompare(playerName(right), "ru"));

  return (
    <section className="app-panel space-y-3 p-3" aria-label="Чип-лидер">
      <div className="flex items-center gap-2">
        <Crown className="h-5 w-5 text-slate-400" />
        <h3 className="text-base font-black text-white">Чип-лидер</h3>
        <span className="ml-auto text-xs font-semibold text-slate-400">+1000 очков за отметку</span>
      </div>
      {BREAKS.map((breakNumber) => {
        const mark = marks.find((item) => item.breakNumber === breakNumber);
        return (
          <div key={breakNumber} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">После {breakNumber}-го перерыва</span>
              {mark && (
                <button type="button" className="tap ml-auto inline-flex h-9 w-9 items-center justify-center rounded-[0.55rem] bg-rose-500/12 text-rose-100" aria-label={`Снять отметку после ${breakNumber}-го перерыва`} disabled={busy} onClick={() => clear.mutate(breakNumber)}>
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {mark && <p className="text-sm font-semibold text-slate-200">👑 {mark.name}</p>}
            <select
              className="rating-month-select w-full"
              aria-label={`Чип-лидер после ${breakNumber}-го перерыва`}
              disabled={busy}
              value=""
              onChange={(event) => event.target.value && set.mutate({ breakNumber, registrationId: event.target.value })}
            >
              <option value="">{mark ? "Выбрать другого игрока" : "Выбрать игрока"}</option>
              {sorted.map((item) => (
                <option key={item.id} value={item.id}>{playerName(item)}</option>
              ))}
            </select>
          </div>
        );
      })}
    </section>
  );
}
