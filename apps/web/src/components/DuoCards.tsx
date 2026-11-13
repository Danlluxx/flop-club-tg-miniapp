import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Hourglass, MessageCircleQuestion } from "lucide-react";
import { api } from "../lib/api";
import { haptic } from "../lib/telegram";
import { useToast } from "./Toast";
import type { DuoCardType } from "../types";

const CARDS: { type: DuoCardType; title: string; hint: string; left: "timeoutLeft" | "hintLeft"; Icon: typeof Hourglass }[] = [
  { type: "timeout", title: "Тайм-аут", hint: "+1 минута на решение", left: "timeoutLeft", Icon: Hourglass },
  { type: "hint", title: "Подсказка партнёра", hint: "30 секунд на совет", left: "hintLeft", Icon: MessageCircleQuestion }
];

function secondsUntil(iso: string, now: number) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 1000));
}

// FLOP DUO: the two cards of each kind a team has, played from the phone instead of cardboard.
export function DuoCards({ tournamentId }: { tournamentId: string }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [now, setNow] = useState(() => Date.now());
  const [armed, setArmed] = useState<DuoCardType | null>(null);
  const { data } = useQuery({ queryKey: ["tournament", tournamentId, "duo"], queryFn: () => api.duoPlayerState(tournamentId), refetchInterval: 4000 });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(null), 4000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  const play = useMutation({
    mutationFn: (card: DuoCardType) => api.duoPlayCard(tournamentId, card),
    onSuccess: (state) => {
      haptic("success");
      setArmed(null);
      queryClient.setQueryData(["tournament", tournamentId, "duo"], state);
    },
    onError: (error) => {
      haptic("error");
      setArmed(null);
      showToast(error.message, "error");
    }
  });

  if (!data) return null;
  const team = data.team;
  const running = team?.active && secondsUntil(team.active.endsAt, now) > 0 ? team.active : null;

  return (
    <section className="app-panel space-y-3 p-4" aria-label="Карточки команды">
      <h2 className="text-lg font-black text-white">Команда 2×2</h2>
      {!team ? (
        <p className="text-sm text-slate-300">Пары назначаются на перерыве после 10 уровня. Пока вы играете сами.</p>
      ) : !data.merged ? (
        <p className="text-sm text-slate-300">{team.partnerName ? <>Ваш партнёр: <strong className="text-white">{team.partnerName}</strong>. </> : "Вы играете один. "}Карточки появятся, когда команды объединят.</p>
      ) : (
        <>
          <p className="text-sm text-slate-300">{team.partnerName ? <>Ваш партнёр: <strong className="text-white">{team.partnerName}</strong>. Карточки общие на двоих.</> : "Вы играете один, карточки у вас те же."}</p>
          {running && (
            <div className="rounded-[0.75rem] bg-emerald/15 p-3 text-center" role="status">
              <p className="text-xs font-bold text-emerald">{running.card === "timeout" ? "Тайм-аут идёт" : "Подсказка партнёра идёт"}</p>
              <p className="brand-display text-3xl text-white">{secondsUntil(running.endsAt, now)} с</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {CARDS.map(({ type, title, hint, left, Icon }) => {
              const remaining = team[left];
              const disabled = play.isPending || !team.inGame || remaining === 0 || Boolean(running);
              return (
                <button
                  key={type}
                  type="button"
                  disabled={disabled}
                  onClick={() => (armed === type ? play.mutate(type) : setArmed(type))}
                  className={`tap flex flex-col items-start gap-1 rounded-[0.85rem] p-3 text-left disabled:opacity-45 ${armed === type ? "bg-rose-500/25 text-rose-50" : "bg-white/5 text-white"}`}
                >
                  <Icon className="h-5 w-5" />
                  <strong className="text-sm">{title}</strong>
                  <span className="text-xs text-slate-300">{armed === type ? "Нажмите ещё раз, чтобы использовать" : hint}</span>
                  <span className="text-xs font-bold">Осталось: {remaining} из 2</span>
                </button>
              );
            })}
          </div>
          {!team.inGame && <p className="text-xs text-slate-400">Команда выбыла, карточки больше недоступны.</p>}
        </>
      )}
    </section>
  );
}
