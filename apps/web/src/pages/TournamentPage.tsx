import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { ArrowLeft, CalendarDays, MapPin, Users, WalletCards } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { haptic, requestBotWriteAccess } from "../lib/telegram";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { DevilDealPanel } from "../components/DevilDealPanel";
import { formatBarnaulDateTime } from "../lib/barnaulDate";
import { CheckInQr } from "../components/CheckInQr";
import { tournamentEventImage } from "../lib/tournamentAssets";
import { tournamentLegalNote, tournamentPriceFeatures, tournamentRuleFor } from "../lib/tournamentRules";
import type { TournamentPublicParticipant } from "../types";

const money = new Intl.NumberFormat("ru-RU");

function publicParticipantName(participant: TournamentPublicParticipant) {
  const user = participant.user;
  return user.displayName || [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || "Игрок";
}

export function TournamentPage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [view, setView] = useState<"details" | "participants">("details");
  // A finished tournament no longer changes, so polling stops once it is over.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["tournament", id],
    queryFn: () => api.tournament(id),
    enabled: Boolean(id),
    refetchInterval: (query) => (query.state.data?.status === "FINISHED" ? false : 3000)
  });
  const resultsQuery = useQuery({ queryKey: ["tournament", id, "results"], queryFn: () => api.publicResults(id), enabled: data?.status === "FINISHED" });
  const participantsQuery = useQuery({
    queryKey: ["tournament", id, "public-participants"],
    queryFn: () => api.publicParticipants(id),
    enabled: Boolean(id),
    refetchInterval: data?.status === "FINISHED" ? false : 3000
  });

  const register = useMutation({
    mutationFn: async () => {
      await requestBotWriteAccess();
      return api.register(id);
    },
    onSuccess: async () => {
      haptic("success");
      showToast("Вы записаны на турнир");
      await queryClient.invalidateQueries({ queryKey: ["tournament", id] });
      await queryClient.invalidateQueries({ queryKey: ["tournament", id, "public-participants"] });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (error) => {
      haptic("error");
      showToast(error.message, "error");
    }
  });

  const cancel = useMutation({
    mutationFn: () => api.cancel(id),
    onSuccess: async () => {
      haptic("success");
      showToast("Запись отменена");
      await queryClient.invalidateQueries({ queryKey: ["tournament", id] });
      await queryClient.invalidateQueries({ queryKey: ["tournament", id, "public-participants"] });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (error) => showToast(error.message, "error")
  });

  if (isLoading) return <div className="app-panel p-6">Загрузка турнира...</div>;
  if (isError || !data) return <div className="app-panel p-6 text-rose-200">Турнир не найден.</div>;

  const isRegistered = Boolean(data.myRegistration);
  const activeSeats = data.activeSeatsCount ?? data._count.registrations;
  const isFull = activeSeats >= data.maxParticipants;
  const canRegister = (data.registrationOpen ?? data.status === "OPEN") && !isFull;
  const baseRule = tournamentRuleFor(data.title, data.buyIn);
  const m = data.mechanics;
  const rule = m ? { ...baseRule, features: [
    `Стартовый стек ${m.startingStack.toLocaleString("ru-RU")} фишек`, `Уровни по ${m.blindLevelMinutes} минут`,
    "Re-entry доступны до окончания поздней регистрации",
    `Одна попытка воскрешения: ${m.resurrection.probabilities.death * 100}% — без фишек, ${m.resurrection.probabilities.fiveBB * 100}% — 5 BB, ${m.resurrection.probabilities.tenBB * 100}% — 10 BB`,
    `Выигрыш с карманными 66 на вскрытии: +${m.devilsSixes.pocketSixesBonusBB} BB; сет шестёрок: +${m.devilsSixes.setOfSixesBonusBB} BB`,
    `За подтверждённое выбивание: +${m.bounty.ratingPointsPerElimination} рейтинговых очков`
  ] } : baseRule;
  const priceFeatures = tournamentPriceFeatures(data);
  const reEntryLabel = data.profile === "FREEZE" || data.reEntry === 0 ? "Без re-entry" : `${money.format(data.reEntry)} ₽`;
  const participants = [...(participantsQuery.data ?? [])].sort((left, right) => {
    const leftPlace = left.finishPlace ?? Number.MAX_SAFE_INTEGER;
    const rightPlace = right.finishPlace ?? Number.MAX_SAFE_INTEGER;
    if (leftPlace !== rightPlace) return leftPlace - rightPlace;
    return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  });

  if (view === "participants") {
    return (
      <section className="space-y-5">
        <button
          type="button"
          onClick={() => setView("details")}
          className="inline-flex h-10 w-10 items-center justify-center rounded-[0.7rem] bg-white/5 text-slate-300"
          aria-label="Вернуться к турниру"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <section className="participants-section">
          <h2 className="brand-display participants-title">Список участников</h2>
          <div className="participants-table">
            <div className="participants-table-head">
              <span>№</span>
              <span>Имя</span>
              <span>Рейтинг</span>
            </div>
            {participantsQuery.isLoading ? (
              <div className="participants-empty">Загрузка списка...</div>
            ) : participants.length ? (
              participants.map((participant, index) => (
                <div className="participants-table-row" key={participant.id}>
                  <span className="participants-number">{participant.finishPlace ?? index + 1}</span>
                  <span className="participants-user">
                    {participant.user.photoUrl ? <img src={participant.user.photoUrl} alt="" /> : <span>{publicParticipantName(participant).slice(0, 1).toUpperCase()}</span>}
                    <strong>{publicParticipantName(participant)}</strong>
                  </span>
                  <span className="participants-rating">{money.format(participant.user.ratingPoints)}</span>
                </div>
              ))
            ) : (
              <div className="participants-empty">Пока нет записей.</div>
            )}
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <Link to="/tournaments" className="inline-flex h-10 w-10 items-center justify-center rounded-[0.7rem] bg-white/5 text-slate-300">
        <ArrowLeft className="h-5 w-5" />
      </Link>

      <div className={`tournament-detail-hero ${data.mechanics ? "devil-hero" : ""}`}>
        <img className="tournament-detail-art" src={tournamentEventImage(data.title)} alt="" />
        <div className="relative z-10 p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="page-kicker">Flop Club</p>
            <StatusBadge status={data.status} />
          </div>
          <h1 className="brand-display tournament-detail-title mt-5 text-white">{rule.title}</h1>

          <div className="mt-6 space-y-3 text-sm font-semibold text-slate-300">
            <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-electric" />{data.mechanics ? `${formatBarnaulDateTime(data.startsAt)} · Геблера 33б` : format(new Date(data.startsAt), "d MMMM yyyy, HH:mm", { locale: ru })}</div>
            <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-rose-400" />{data.location}</div>
            <div className="flex items-center gap-2"><Users className="h-4 w-4 text-violet" />{data._count.registrations} из {data.maxParticipants} участников</div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="detail-price-card">
              <p>Вход</p>
              <strong>{money.format(data.buyIn)} ₽</strong>
            </div>
            <div className="detail-price-card">
              <p>Re-entry</p>
              <strong>{reEntryLabel}</strong>
            </div>
          </div>
        </div>
      </div>

      {data.mechanics && <DevilDealPanel id={id} />}
      {data.status === "FINISHED" && <section className="app-panel p-5"><h2 className="text-xl font-bold mb-4">Результаты турнира</h2>{resultsQuery.isError ? <p>Не удалось загрузить результаты.</p> : resultsQuery.data?.map(result => <div className="flex justify-between gap-3 border-b border-white/10 py-3 text-sm" key={result.userId}><span>{result.place ?? "—"}. {result.name}</span><strong>{result.points.toLocaleString("ru-RU")} очков</strong></div>)}</section>}

      <button type="button" onClick={() => setView("participants")} className="participants-open-button tap">
        <span className="brand-display">Список участников</span>
        <strong>{participants.length || activeSeats}</strong>
      </button>

      <div className="tournament-rule-stack">
        {data.description ? (
          <section className="tournament-rule-section">
            <h2>О турнире</h2>
            <p>{data.description}</p>
          </section>
        ) : null}

        <section className="tournament-rule-section">
          <h2>Где проходит турнир?</h2>
          <p className="rule-location"><MapPin className="h-5 w-5 shrink-0" />{data.location === "Flop Club, Барнаул" ? "Flop Club, Барнаул, ул. Геблера 33Б" : data.location}</p>
        </section>

        <section className="tournament-rule-section">
          <h2>Общие правила</h2>
          <p>{rule.rule}</p>
        </section>

        <section className="tournament-rule-section">
          <h2>Особенности</h2>
          <ul className="rule-list">
            {[...rule.features, ...priceFeatures].map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </section>

        <div className="rule-note">
          <WalletCards className="h-4 w-4 shrink-0 text-rose-400" />
          <p>{tournamentLegalNote}</p>
        </div>
      </div>

      {data.myRegistration ? <CheckInQr registration={data.myRegistration} /> : null}

      {isRegistered && !data.myRegistration?.checkedInAt ? (
        <button onClick={() => cancel.mutate()} disabled={cancel.isPending} className="tap w-full rounded-[0.85rem] border border-rose-400/40 bg-rose-400/15 px-5 py-4 font-black text-rose-100">
          Отменить запись
        </button>
      ) : !isRegistered ? (
        <button
          onClick={() => register.mutate()}
          disabled={!canRegister || register.isPending}
          className="app-button-primary tap w-full disabled:cursor-not-allowed disabled:opacity-45"
        >
          {isFull ? "Турнир заполнен" : canRegister ? "Записаться" : "Регистрация закрыта"}
        </button>
      ) : null}
    </section>
  );
}
