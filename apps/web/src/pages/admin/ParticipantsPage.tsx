import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Armchair,
  Download,
  MinusCircle,
  PlusCircle,
  Save,
  Shuffle,
  Skull,
  Trophy,
  Trash2,
  UserCheck,
  UsersRound
} from "lucide-react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useToast } from "../../components/Toast";
import type { Registration } from "../../types";

export function ParticipantsPage() {
  const { id = "" } = useParams();
  const [entriesCount, setEntriesCount] = useState("");
  const [seatDraft, setSeatDraft] = useState<Record<string, { tableNumber: string; seatNumber: string }>>({});
  const [finishPlaceDraft, setFinishPlaceDraft] = useState<Record<string, string>>({});
  const [eliminatedRegistrationId, setEliminatedRegistrationId] = useState("");
  const [killerRegistrationId, setKillerRegistrationId] = useState("");
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const parsedEntriesCount = Number(entriesCount);
  const ratingEntriesCount = Number.isFinite(parsedEntriesCount) && parsedEntriesCount > 0 ? parsedEntriesCount : undefined;
  const { data } = useQuery({ queryKey: ["participants", id], queryFn: () => api.participants(id) });
  const { data: liveState } = useQuery({ queryKey: ["admin", "live", id], queryFn: () => api.liveState(id), enabled: Boolean(id) });
  const { data: ratingInfo } = useQuery({
    queryKey: ["admin", "rating-results", id, ratingEntriesCount],
    queryFn: () => api.ratingResults(id, ratingEntriesCount),
    enabled: Boolean(id)
  });

  useEffect(() => {
    if (!data || !ratingInfo) return;
    setEntriesCount(String(ratingInfo.entriesCount ?? data.length));
  }, [data, ratingInfo]);

  useEffect(() => {
    if (!data) return;
    setFinishPlaceDraft((draft) => {
      const nextDraft = { ...draft };
      for (const registration of data) {
        if (nextDraft[registration.id] === undefined) {
          nextDraft[registration.id] = registration.finishPlace ? String(registration.finishPlace) : "";
        }
      }
      return nextDraft;
    });
  }, [data]);

  useEffect(() => {
    if (!liveState) return;
    const nextDraft: Record<string, { tableNumber: string; seatNumber: string }> = {};
    for (const registration of liveState.inGame) {
      nextDraft[registration.id] = {
        tableNumber: String(registration.tableNumber ?? ""),
        seatNumber: String(registration.seatNumber ?? "")
      };
    }
    setSeatDraft(nextDraft);
  }, [liveState]);

  const participants = useMemo(() => data ?? [], [data]);

  const inGameParticipants = liveState?.inGame ?? [];
  const isKnockoutTournament = liveState?.tournament.profile === "KNOCKOUT";
  const reportDate = liveState?.tournament.startsAt ? new Date(liveState.tournament.startsAt).toISOString().slice(0, 10) : "";
  const nextFinishPlace = eliminatedRegistrationId ? inGameParticipants.length : null;

  async function invalidateTournamentLive() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["participants", id] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "live", id] }),
      queryClient.invalidateQueries({ queryKey: ["tournament", id] })
    ]);
  }

  const remove = useMutation({
    mutationFn: api.removeRegistration,
    onSuccess: async () => {
      showToast("Участник удалён");
      await invalidateTournamentLive();
    },
    onError: (error) => showToast(error.message, "error")
  });

  const moveSeat = useMutation({
    mutationFn: ({ registrationId, tableNumber, seatNumber }: { registrationId: string; tableNumber: number; seatNumber: number }) =>
      api.moveLiveSeat(id, registrationId, { tableNumber, seatNumber }),
    onSuccess: async () => {
      showToast("Место обновлено");
      await invalidateTournamentLive();
    },
    onError: (error) => showToast(error.message, "error")
  });

  const autoReseat = useMutation({
    mutationFn: () => api.autoReseat(id),
    onSuccess: async () => {
      showToast("Столы пересажены");
      await invalidateTournamentLive();
    },
    onError: (error) => showToast(error.message, "error")
  });

  const finalTable = useMutation({
    mutationFn: () => api.finalTable(id),
    onSuccess: async () => {
      showToast("Финальный стол сформирован");
      await invalidateTournamentLive();
    },
    onError: (error) => showToast(error.message, "error")
  });

  const elimination = useMutation({
    mutationFn: () => api.recordElimination(id, {
      eliminatedRegistrationId,
      killerRegistrationId: isKnockoutTournament ? killerRegistrationId || null : null
    }),
    onSuccess: async () => {
      setEliminatedRegistrationId("");
      setKillerRegistrationId("");
      showToast("Вылет зафиксирован");
      await invalidateTournamentLive();
    },
    onError: (error) => showToast(error.message, "error")
  });

  const addOn = useMutation({
    mutationFn: api.addOn,
    onSuccess: async () => {
      showToast("Add-on отмечен");
      await invalidateTournamentLive();
    },
    onError: (error) => showToast(error.message, "error")
  });

  const removeAddOn = useMutation({
    mutationFn: api.removeAddOn,
    onSuccess: async () => {
      showToast("Add-on убран");
      await invalidateTournamentLive();
    },
    onError: (error) => showToast(error.message, "error")
  });

  const addReEntry = useMutation({
    mutationFn: api.addReEntry,
    onSuccess: async () => {
      showToast("Re-entry отмечен");
      await invalidateTournamentLive();
    },
    onError: (error) => showToast(error.message, "error")
  });

  const removeReEntry = useMutation({
    mutationFn: api.removeReEntry,
    onSuccess: async () => {
      showToast("Re-entry убран");
      await invalidateTournamentLive();
    },
    onError: (error) => showToast(error.message, "error")
  });

  const updateFinishPlace = useMutation({
    mutationFn: ({ registrationId, finishPlace }: { registrationId: string; finishPlace: number | null }) =>
      api.updateFinishPlace(registrationId, finishPlace),
    onSuccess: async () => {
      showToast("Место обновлено");
      await Promise.all([
        invalidateTournamentLive(),
        queryClient.invalidateQueries({ queryKey: ["admin", "rating-results", id] })
      ]);
    },
    onError: (error) => showToast(error.message, "error")
  });

  const checkInParticipant = useMutation({
    mutationFn: api.adminCheckIn,
    onSuccess: async (registration) => {
      const seat = registration.tableNumber && registration.seatNumber
        ? `Стол ${registration.tableNumber}, бокс ${registration.seatNumber}`
        : "Место назначено";
      showToast(`Участник отмечен: ${seat}`);
      await invalidateTournamentLive();
    },
    onError: (error) => showToast(error.message, "error")
  });

  const downloadReport = useMutation({
    mutationFn: () => api.downloadDayReport(reportDate),
    onError: (error) => showToast(error.message, "error")
  });

  const downloadParticipants = useMutation({
    mutationFn: () => api.downloadParticipants(id),
    onError: (error) => showToast(error.message, "error")
  });

  const saveRating = useMutation({
    mutationFn: () => {
      const maxRatingPlace = ratingInfo?.awards.length ?? 0;
      const knockoutsByRegistration = new Map<string, number>();
      for (const knockout of liveState?.knockouts ?? []) {
        const killerId = knockout.killerRegistrationId;
        if (killerId) {
          knockoutsByRegistration.set(killerId, (knockoutsByRegistration.get(killerId) ?? 0) + 1);
        }
      }

      const results = participants
        .filter((item) => item.finishPlace && item.finishPlace <= maxRatingPlace)
        .map((item) => ({
          registrationId: item.id,
          place: item.finishPlace!,
          knockouts: knockoutsByRegistration.get(item.id) ?? 0
        }))
        .sort((a, b) => a.place - b.place);

      if (!results.length) {
        throw new Error("Сначала зафиксируйте вылеты игроков");
      }

      return api.saveRatingResults(id, {
        entriesCount: Number(entriesCount || data?.length || 1),
        results
      });
    },
    onSuccess: async () => {
      showToast("Рейтинг начислен");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "rating-results", id] }),
        queryClient.invalidateQueries({ queryKey: ["rating"] }),
        queryClient.invalidateQueries({ queryKey: ["tournament", id] })
      ]);
    },
    onError: (error) => showToast(error.message, "error")
  });

  function participantName(item: Registration) {
    return item.user?.displayName || [item.user?.firstName, item.user?.lastName].filter(Boolean).join(" ") || item.user?.username || item.user?.telegramId || "Игрок";
  }

  function participantState(item: Registration) {
    if (item.liveStatus === "ELIMINATED") return { label: "выбыл", className: "bg-slate-500/15 text-slate-400" };
    if (item.checkedInAt) return { label: "в игре", className: "bg-emerald/15 text-emerald" };
    return { label: "записан", className: "bg-amber-300/15 text-amber-200" };
  }

  function canUseReEntry(item: Registration) {
    if (!liveState || item.status !== "ACTIVE") return false;
    if (liveState.tournament.profile === "FREEZE" || liveState.tournament.reEntry <= 0) return false;
    if (liveState.tournament.profile === "PHOENIX" && item.entryNumber >= 2) return false;
    return true;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="page-title text-[3rem]">Участники</h2>
        <button
          className="grid h-12 w-12 place-items-center rounded-full bg-rose-400/15 text-rose-200 disabled:opacity-50"
          disabled={downloadParticipants.isPending}
          type="button"
          onClick={() => downloadParticipants.mutate()}
          aria-label="Скачать участников CSV"
        >
          <Download className="h-5 w-5" />
        </button>
      </div>

      <section className="app-panel space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-lg font-black">
              <Armchair className="h-5 w-5 text-rose-300" />
              Live-столы
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-400">
              В игре {liveState?.inGame.length ?? 0}, выбыло {liveState?.eliminated.length ?? 0}.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              className="tap inline-flex items-center gap-2 rounded-full border border-rose-400/40 bg-rose-500/15 px-3 py-2 text-xs font-bold text-rose-100"
              onClick={() => autoReseat.mutate()}
              disabled={autoReseat.isPending || !liveState?.inGame.length}
              type="button"
            >
              <Shuffle className="h-4 w-4" />
              Баланс
            </button>
            <button
              className="tap inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
              onClick={() => finalTable.mutate()}
              disabled={finalTable.isPending || !liveState || liveState.inGame.length > 9 || liveState.inGame.length < 2}
              type="button"
            >
              <UsersRound className="h-4 w-4" />
              Финал
            </button>
          </div>
        </div>

        <div className="grid gap-3">
          {liveState?.tables.map((table) => (
            <div key={table.tableNumber} className="rounded-3xl border border-white/10 bg-black/20 p-3">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-bold">Стол {table.tableNumber}</p>
                <span className="rounded-full bg-white/8 px-3 py-1 text-xs font-bold text-slate-300">{table.occupied}/10</span>
              </div>
              <div className="space-y-2">
                {table.seats.filter((seat) => seat.registration).map((seat) => (
                  <div key={seat.seatNumber} className="flex min-w-0 items-center gap-3 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-3 py-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-sm font-black text-black">
                      {seat.seatNumber}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-white">{participantName(seat.registration!)}</p>
                      <p className="truncate text-xs font-semibold text-slate-500">@{seat.registration!.user?.username ?? seat.registration!.user?.telegramId ?? "игрок"}</p>
                    </div>
                  </div>
                ))}
                {!table.occupied && (
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3 text-sm font-semibold text-slate-500">
                    Стол свободен
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {table.seats.filter((seat) => !seat.registration).map((seat) => (
                  <span key={seat.seatNumber} className="grid h-7 min-w-7 place-items-center rounded-full border border-white/10 px-2 text-[0.7rem] font-bold text-slate-600">
                    {seat.seatNumber}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <form
          className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.03] p-3"
          onSubmit={(event) => {
            event.preventDefault();
            elimination.mutate();
          }}
        >
          <p className="flex items-center gap-2 text-base font-black">
            <Skull className="h-5 w-5 text-rose-300" />
            Игрок выбыл
          </p>
          <select
            className="w-full rounded-2xl border border-white/10 bg-graphite px-3 py-3 text-sm font-semibold text-white outline-none focus:border-rose-400"
            value={eliminatedRegistrationId}
            onChange={(event) => setEliminatedRegistrationId(event.target.value)}
            required
          >
            <option value="">Кто выбыл</option>
            {inGameParticipants.map((item) => (
              <option key={item.id} value={item.id}>{participantName(item)}</option>
            ))}
          </select>
          {nextFinishPlace ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm font-bold text-rose-100">
              После фиксации игрок автоматически получит {nextFinishPlace} место.
            </div>
          ) : null}
          {isKnockoutTournament ? (
            <select
              className="w-full rounded-2xl border border-white/10 bg-graphite px-3 py-3 text-sm font-semibold text-white outline-none focus:border-rose-400"
              value={killerRegistrationId}
              onChange={(event) => setKillerRegistrationId(event.target.value)}
            >
              <option value="">Кто выбил, если есть</option>
              {inGameParticipants.filter((item) => item.id !== eliminatedRegistrationId).map((item) => (
                <option key={item.id} value={item.id}>{participantName(item)}</option>
              ))}
            </select>
          ) : null}
          <button className="app-button-primary w-full" disabled={elimination.isPending || !eliminatedRegistrationId}>
            Игрок выбыл
          </button>
        </form>

        {liveState?.knockouts.length ? (
          <div className="space-y-2">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Последние нокауты</p>
            {liveState.knockouts.slice(0, 5).map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.04] px-3 py-2 text-sm">
                <span className="truncate text-slate-400">{participantName(item.eliminatedRegistration!)}</span>
                <span className="shrink-0 text-rose-200">выбит</span>
                <span className="truncate text-right font-bold">{item.killerRegistration ? participantName(item.killerRegistration) : "без нокаута"}</span>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          saveRating.mutate();
        }}
        className="app-panel space-y-4 p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-lg font-black">
              <Trophy className="h-5 w-5 text-rose-300" />
              Рейтинг турнира
            </p>
            <p className="mt-1 text-sm font-bold text-slate-400">
              Очки получает верхние 30% участников. Места берутся автоматически из вылетов.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              className="grid h-11 w-11 place-items-center rounded-full bg-white/8 text-white disabled:opacity-50"
              disabled={downloadReport.isPending || !reportDate}
              type="button"
              onClick={() => downloadReport.mutate()}
              aria-label="Скачать XLSX отчет дня"
            >
              <Download className="h-5 w-5" />
            </button>
            <button className="grid h-11 w-11 place-items-center rounded-full bg-rose-500/20 text-rose-100" disabled={saveRating.isPending} type="submit">
              <Save className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <label className="space-y-1">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Участники для рейтинга</span>
            <input
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-white outline-none focus:border-rose-400"
              type="number"
              min={1}
              value={entriesCount}
              onChange={(event) => setEntriesCount(event.target.value)}
            />
          </label>
          <div className="rounded-2xl bg-white/8 px-4 py-3 text-right">
            <p className="text-xs font-bold text-slate-400">Пул</p>
            <p className="font-black">{(ratingInfo?.ratingPool ?? 0).toLocaleString("ru-RU")}</p>
          </div>
        </div>

        {ratingInfo?.awards.length ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {ratingInfo.awards.map((award) => (
              <span key={award.place} className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-black">
                {award.place} место · {award.percent}% · {award.points.toLocaleString("ru-RU")}
              </span>
            ))}
          </div>
        ) : null}
      </form>

      <div className="space-y-2">
        {participants.map((item) => (
          <div key={item.id} className="app-panel space-y-3 p-3">
            <div className="flex flex-col gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-start gap-2">
                  <p className="min-w-0 flex-1 break-words text-lg font-bold leading-tight">{participantName(item)}</p>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[0.65rem] font-black uppercase ${participantState(item).className}`}>
                    {participantState(item).label}
                  </span>
                </div>
                <p className="mt-1 break-all text-sm font-semibold leading-snug text-slate-400">
                  @{item.user?.username ?? "no_username"} · {item.user?.telegramId}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-bold">
                  {item.checkedInAt && item.tableNumber && item.seatNumber ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-1 text-electric">
                      <Armchair className="h-3.5 w-3.5" />
                      Стол {item.tableNumber}, бокс {item.seatNumber}
                    </span>
                  ) : null}
                  {item.finishPlace ? (
                    <span className="rounded-full bg-white/8 px-2.5 py-1 text-slate-300">Место {item.finishPlace}</span>
                  ) : null}
                  <span className="rounded-full bg-white/8 px-2.5 py-1 text-slate-400">
                    Входов: {item.entryNumber}
                  </span>
                  <span className="rounded-full bg-rose-500/10 px-2.5 py-1 text-rose-100">
                    Re-entry: {Math.max(0, item.entryNumber - 1)}
                  </span>
                  {liveState?.tournament.addOnEnabled || item.addOnCount > 0 ? (
                    <span className="rounded-full bg-violet/15 px-2.5 py-1 text-violet">Add-on: {item.addOnCount}</span>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {item.liveStatus === "IN_GAME" && !item.checkedInAt ? (
                  <button
                    onClick={() => checkInParticipant.mutate(item.checkInToken)}
                    className="tap inline-flex h-10 items-center gap-1.5 rounded-full bg-emerald/15 px-3 text-xs font-black text-emerald disabled:opacity-50"
                    type="button"
                    disabled={checkInParticipant.isPending}
                    aria-label="Отметить участника"
                  >
                    <UserCheck className="h-4 w-4" />
                    Отметить
                  </button>
                ) : null}
                {canUseReEntry(item) || item.entryNumber > 1 ? (
                  <div className="inline-flex h-10 items-center overflow-hidden rounded-full bg-rose-500/12 text-xs font-black text-rose-100">
                    <button
                      onClick={() => addReEntry.mutate(item.id)}
                      className="tap inline-flex h-full items-center gap-1.5 px-3 disabled:opacity-40"
                      type="button"
                      disabled={!canUseReEntry(item) || addReEntry.isPending}
                      aria-label="Добавить re-entry"
                    >
                      <PlusCircle className="h-4 w-4" />
                      Re-entry
                    </button>
                    {item.entryNumber > 1 ? (
                      <button
                        onClick={() => removeReEntry.mutate(item.id)}
                        className="tap grid h-full w-10 place-items-center border-l border-white/10 disabled:opacity-40"
                        type="button"
                        disabled={removeReEntry.isPending}
                        aria-label="Убрать re-entry"
                      >
                        <MinusCircle className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {liveState?.tournament.addOnEnabled && item.liveStatus === "IN_GAME" ? (
                  <div className="inline-flex h-10 items-center overflow-hidden rounded-full bg-violet/15 text-xs font-black text-violet">
                    <button
                      onClick={() => addOn.mutate(item.id)}
                      className="tap inline-flex h-full items-center gap-1.5 px-3 disabled:opacity-40"
                      type="button"
                      disabled={item.addOnCount >= 1 || addOn.isPending}
                      aria-label="Отметить add-on"
                    >
                      <PlusCircle className="h-4 w-4" />
                      Add-on
                    </button>
                    {item.addOnCount > 0 ? (
                      <button
                        onClick={() => removeAddOn.mutate(item.id)}
                        className="tap grid h-full w-10 place-items-center border-l border-white/10 disabled:opacity-40"
                        type="button"
                        disabled={removeAddOn.isPending}
                        aria-label="Убрать add-on"
                      >
                        <MinusCircle className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                ) : null}
                <button onClick={() => remove.mutate(item.id)} className="grid h-10 w-10 place-items-center rounded-full bg-rose-400/15 text-rose-200" type="button"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>

            {item.liveStatus === "IN_GAME" && item.checkedInAt ? (
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2 rounded-2xl border border-white/8 bg-white/[0.03] p-2">
                <input
                  className="min-w-0 rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-bold outline-none focus:border-rose-400"
                  type="number"
                  min={1}
                  max={5}
                  placeholder="Стол"
                  value={seatDraft[item.id]?.tableNumber ?? ""}
                  onChange={(event) => setSeatDraft((draft) => ({ ...draft, [item.id]: { tableNumber: event.target.value, seatNumber: draft[item.id]?.seatNumber ?? "" } }))}
                />
                <input
                  className="min-w-0 rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-bold outline-none focus:border-rose-400"
                  type="number"
                  min={1}
                  max={10}
                  placeholder="Бокс"
                  value={seatDraft[item.id]?.seatNumber ?? ""}
                  onChange={(event) => setSeatDraft((draft) => ({ ...draft, [item.id]: { tableNumber: draft[item.id]?.tableNumber ?? "", seatNumber: event.target.value } }))}
                />
                <button
                  className="grid h-12 w-12 place-items-center rounded-2xl bg-white/8 text-white disabled:opacity-50"
                  type="button"
                  disabled={moveSeat.isPending}
                  onClick={() => moveSeat.mutate({
                    registrationId: item.id,
                    tableNumber: Number(seatDraft[item.id]?.tableNumber),
                    seatNumber: Number(seatDraft[item.id]?.seatNumber)
                  })}
                >
                  <Save className="h-4 w-4" />
                </button>
              </div>
            ) : null}

            {item.liveStatus === "ELIMINATED" ? (
              <div className="grid grid-cols-[1fr_auto] gap-2 rounded-2xl border border-white/8 bg-white/[0.03] p-2">
                <input
                  className="min-w-0 rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-bold outline-none focus:border-rose-400"
                  type="number"
                  min={1}
                  max={500}
                  placeholder="Итоговое место"
                  value={finishPlaceDraft[item.id] ?? ""}
                  onChange={(event) => setFinishPlaceDraft((draft) => ({ ...draft, [item.id]: event.target.value }))}
                />
                <button
                  className="grid h-12 w-12 place-items-center rounded-2xl bg-white/8 text-white disabled:opacity-50"
                  type="button"
                  disabled={updateFinishPlace.isPending || !finishPlaceDraft[item.id]}
                  onClick={() => updateFinishPlace.mutate({
                    registrationId: item.id,
                    finishPlace: Number(finishPlaceDraft[item.id])
                  })}
                  aria-label="Сохранить итоговое место"
                >
                  <Save className="h-4 w-4" />
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
