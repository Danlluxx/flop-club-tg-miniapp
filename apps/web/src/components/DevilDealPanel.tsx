import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Flame, Skull, Spade } from "lucide-react";
import { api } from "../lib/api";
import { formatBarnaulDateTime } from "../lib/barnaulDate";
import type { GameEvent } from "../types";
import "./devilDeal.css";

export const eventLabels: Record<string, string> = {
  REGISTRATION_CANCELLED: "Регистрация отменена",
  INITIAL_STACK: "Стартовый стек", RE_ENTRY: "Повторный вход", ELIMINATION: "Выбивание подтверждено",
  RESURRECTION_DEATH: "Сделка: без воскрешения", RESURRECTION_5BB: "Воскрешение · 5 BB", RESURRECTION_10BB: "Воскрешение · 10 BB",
  DEVILS_SIXES_6BB: "Карманные 66", DEVILS_SIXES_13BB: "Сет шестёрок", BOUNTY_ELIMINATION: "Bounty за выбивание",
  ADD_ON: "Add-on", ADMIN_CORRECTION: "Коррекция начисления", BLIND_LEVEL: "Уровень блайндов", RETURN_CONFIRMED: "Возвращение подтверждено", CHECK_IN: "Участник отмечен"
};
export function GameHistory({ events }: { events: GameEvent[] }) {
  return <ol className="devil-history">{events.map(e => <li key={e.id}><div><strong>{eventLabels[e.type] ?? e.type}</strong><time>{formatBarnaulDateTime(e.createdAt)}</time>{e.handId && <small>Раздача: {e.handId}</small>}{e.reason && <small>{e.reason}</small>}</div><span>{e.chips !== 0 && `${e.chips > 0 ? "+" : ""}${e.chips.toLocaleString("ru-RU")} фишек`}{e.ratingPoints !== 0 && `${e.ratingPoints > 0 ? "+" : ""}${e.ratingPoints} очков`}{!e.chips && !e.ratingPoints && e.bigBlind > 0 && `BB ${e.bigBlind}`}</span></li>)}</ol>;
}
export function DevilDealPanel({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const { data, isError } = useQuery({ queryKey: ["devil", id], queryFn: () => api.devilState(id), refetchInterval: 3000 });
  const [phase, setPhase] = useState<"offer" | "choose" | "reveal" | "result">("offer");
  const [result, setResult] = useState<GameEvent | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState(false);
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (data?.attempt && data.status !== "ТЫ ВОСКРЕС" && !busy.current) {
      setResult(data.attempt);
      setPhase("result");
    }
  }, [data?.attempt, data?.status]);
  useEffect(() => {
    if (phase !== "result" || !result?.chips) return;
    const timeout = window.setTimeout(() => {
      if (alive.current) setCompleted(true);
    }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1200 : 4000);
    return () => window.clearTimeout(timeout);
  }, [phase, result]);
  async function choose(index: number) {
    if (busy.current) return;
    busy.current = true; setSelected(index); setPhase("reveal"); setError("");
    try {
      const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 2400;
      const [event] = await Promise.all([api.resurrect(id), new Promise(resolve => setTimeout(resolve, delay))]);
      if (alive.current) { setResult(event); setPhase("result"); }
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["devil", id] }),
        queryClient.refetchQueries({ queryKey: ["tournament", id] }),
        queryClient.refetchQueries({ queryKey: ["tournament", id, "public-participants"] }),
        queryClient.invalidateQueries({ queryKey: ["participants", id] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "live", id] }),
        queryClient.invalidateQueries({ queryKey: ["me"] }),
        queryClient.invalidateQueries({ queryKey: ["rating"] })
      ]);
    } catch (e) { if (alive.current) { setError((e as Error).message); setPhase("choose"); } }
    finally { busy.current = false; }
  }
  if (isError || !data) return null;
  const isEliminated = data.status === "ТЫ ВЫБЫЛ" || data.status === "ТЫ УЖЕ ИСПОЛЬЗОВАЛ СДЕЛКУ";
  if (completed || (phase === "offer" && !data.dealAvailable && !isEliminated)) return null;
  const p = data.rules.resurrection.probabilities;
  const r = data.rules;
  return <section className="devil-panel" aria-label="Deal with the Devil">
    <p className="devil-kicker">HALLOWEEN SPECIAL</p>
    <div className="devil-badges"><span>DEAL WITH THE DEVIL</span><span>DEVIL’S SIXES</span><span>BOUNTY</span></div>
    <h2>{data.status ?? "ОДНА НОЧЬ. ОДНА СДЕЛКА."}</h2>
    <div className="devil-metrics"><span><b>{r.startingStack.toLocaleString("ru-RU")}</b>стартовых фишек</span><span><b>{r.blindLevelMinutes} мин</b>уровень</span><span><b>{data.bigBlind.toLocaleString("ru-RU")}</b>текущий BB</span></div>
    <p className="devil-muted">Поздняя регистрация, сделка и шестёрки — до {formatBarnaulDateTime(r.registrationClosesAt)} по Барнаулу. Платный re-entry выбывшего доступен до завершения турнира. {data.mechanicsOpen ? "Специальные механики доступны." : "Сейчас специальные механики недоступны."}</p>
    {(data.dealAvailable || phase !== "offer") && <div className={`devil-deal devil-outcome-${result?.outcome ?? "pending"}`}>
      {phase === "offer" && <><Skull size={32}/><h3>ТВОЯ ИГРА ОКОНЧЕНА</h3><p>Но дьявол предлагает тебе сделку…</p><button className="app-button-primary" type="button" onClick={() => setPhase("choose")}>ЗАКЛЮЧИТЬ СДЕЛКУ</button></>}
      {(phase === "choose" || phase === "reveal") && <><h3>{phase === "reveal" ? "СДЕЛКА ЗАКЛЮЧЕНА…" : "ВЫБЕРИ СВОЙ БИЛЕТ"}</h3><div className={`devil-coffin ${phase === "reveal" ? "is-revealing" : ""}`}><div className="devil-coffin-lid"><Spade size={36}/></div><div className="devil-tickets">{[0,1,2].map(i => <button key={i} type="button" disabled={phase === "reveal"} aria-label={`Билет ${i + 1}`} className={selected === i ? "is-selected" : ""} onClick={() => choose(i)}><Spade/><span>FLOP</span><small>DEVIL DEAL</small></button>)}</div></div><p aria-live="polite">{phase === "reveal" ? "Раскрываем результат…" : "Одна попытка на весь турнир. Выбор билета запускает сделку."}</p></>}
      {phase === "result" && result && <div aria-live="polite">{result.outcome === "DEATH" ? <Skull size={40}/> : <Flame size={40}/>}<h3>{result.outcome === "DEATH" ? "ТЫ МЁРТВ" : result.outcome === "RESURRECT_5" ? "ТЫ ВОСКРЕС!" : "ДЬЯВОЛ НА ТВОЕЙ СТОРОНЕ"}</h3><p>{result.outcome === "DEATH" ? "Дьявол забрал твою последнюю надежду. Бесплатное воскрешение не удалось." : "Дьявол возвращает тебя в игру. Ты получаешь второй шанс."}</p>{result.chips > 0 && <strong className="devil-result">{result.outcome === "RESURRECT_5" ? "5" : "10"} BB · {result.chips.toLocaleString("ru-RU")} фишек</strong>}<p className="devil-muted">Результат сохранён. Повторный вход не восстанавливает попытку.{result.outcome === "DEATH" && data.paidReEntryOpen ? " Для платного Re-entry обратись к флору." : ""}</p></div>}
      {error && <p role="alert" className="text-rose-300">{error} Повторный запрос вернёт сохранённый результат, если сделка уже состоялась.</p>}
    </div>}
    <div className="devil-rules"><div><Spade/><h3>DEAL WITH THE DEVIL</h3><p>{p.death * 100}% — без воскрешения · {p.fiveBB * 100}% — 5 BB · {p.tenBB * 100}% — 10 BB. Одна попытка после подтверждённого выбивания.</p></div><div><Flame/><h3>DEVIL’S SIXES</h3><p>Карманные 66: +{r.devilsSixes.pocketSixesBonusBB} BB. Сет шестёрок: +{r.devilsSixes.setOfSixesBonusBB} BB. Нужны выигрыш, вскрытие и подтверждение флора.</p></div><div><Skull/><h3>BOUNTY</h3><p>+{r.bounty.ratingPointsPerElimination} рейтинговых очков за выбивание. До конца турнира, включая повторные выбивания после возвращения.</p></div></div>
    <h3>ТВОЯ ИСТОРИЯ</h3>{data.events.length ? <GameHistory events={data.events}/> : <p className="devil-muted">После регистрации здесь появятся игровые события.</p>}
  </section>;
}
