import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Armchair,
  ArrowDownUp,
  ChevronDown,
  Download,
  Copy,
  MinusCircle,
  PlusCircle,
  Save,
  Search,
  Skull,
  Trophy,
  Trash2,
  UserCheck,
  UsersRound,
  X
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useToast } from "../../components/Toast";
import type { Registration } from "../../types";

type ParticipantFilter = "ALL" | "IN_GAME" | "AWAITING_CHECK_IN" | "ELIMINATED";
type ParticipantSort = "REGISTERED" | "NAME" | "SEAT" | "PLACE";

export function ParticipantsPage() {
  const { id = "" } = useParams();
  const [entriesCount, setEntriesCount] = useState("");
  const [publicationText, setPublicationText] = useState("");
  const publicationDialog = useRef<HTMLDialogElement>(null);
  const publicationField = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (publicationText) publicationDialog.current?.showModal(); }, [publicationText]);
  const [chipLeaderRegistrationId, setChipLeaderRegistrationId] = useState("");
  const [chipLeaderBonus, setChipLeaderBonus] = useState("2000");
  const [participantSearch, setParticipantSearch] = useState("");
  const [participantFilter, setParticipantFilter] = useState<ParticipantFilter>("ALL");
  const [participantSort, setParticipantSort] = useState<ParticipantSort>("REGISTERED");
  const [expandedTable, setExpandedTable] = useState<number | null>(null);
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
    if (!data || !ratingInfo) return;
    const registrationByUserId = new Map(data.map((registration) => [registration.userId, registration.id]));
    const savedAward = ratingInfo.chipLeaderAward;
    setChipLeaderRegistrationId(savedAward ? registrationByUserId.get(savedAward.userId) ?? "" : "");
    setChipLeaderBonus(savedAward ? String(savedAward.points) : "2000");
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

  const participantCounts = useMemo(() => ({
    all: participants.length,
    inGame: participants.filter((item) => item.checkedInAt && item.liveStatus === "IN_GAME").length,
    awaitingCheckIn: participants.filter((item) => !item.checkedInAt && item.liveStatus === "IN_GAME").length,
    eliminated: participants.filter((item) => item.liveStatus === "ELIMINATED").length
  }), [participants]);

  const visibleParticipants = useMemo(() => {
    const query = participantSearch.trim().toLocaleLowerCase("ru-RU");
    const matchesSearch = (item: Registration) => {
      if (!query) return true;
      const user = item.user;
      const values = [
        participantName(item),
        user?.username,
        user?.telegramId,
        user?.firstName,
        user?.lastName
      ];
      return values.some((value) => value?.toLocaleLowerCase("ru-RU").includes(query));
    };
    const matchesFilter = (item: Registration) => {
      if (participantFilter === "IN_GAME") return Boolean(item.checkedInAt) && item.liveStatus === "IN_GAME";
      if (participantFilter === "AWAITING_CHECK_IN") return !item.checkedInAt && item.liveStatus === "IN_GAME";
      if (participantFilter === "ELIMINATED") return item.liveStatus === "ELIMINATED";
      return true;
    };
    const byName = (left: Registration, right: Registration) => participantName(left).localeCompare(participantName(right), "ru");
    const bySeat = (left: Registration, right: Registration) => {
      const leftTable = left.tableNumber ?? Number.MAX_SAFE_INTEGER;
      const rightTable = right.tableNumber ?? Number.MAX_SAFE_INTEGER;
      return leftTable - rightTable || (left.seatNumber ?? Number.MAX_SAFE_INTEGER) - (right.seatNumber ?? Number.MAX_SAFE_INTEGER) || byName(left, right);
    };
    const byPlace = (left: Registration, right: Registration) => {
      const leftPlace = left.finishPlace ?? Number.MAX_SAFE_INTEGER;
      const rightPlace = right.finishPlace ?? Number.MAX_SAFE_INTEGER;
      return leftPlace - rightPlace || byName(left, right);
    };

    return participants
      .filter((item) => matchesSearch(item) && matchesFilter(item))
      .sort((left, right) => {
        if (participantSort === "NAME") return byName(left, right);
        if (participantSort === "SEAT") return bySeat(left, right);
        if (participantSort === "PLACE") return byPlace(left, right);
        return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      });
  }, [participantFilter, participantSearch, participantSort, participants]);

  const inGameParticipants = liveState?.inGame ?? [];
  const isKnockoutTournament = liveState?.tournament.profile === "KNOCKOUT";
  const isChipLeaderTournament = liveState?.tournament.title.trim().toLowerCase() === "flop chip leader";
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

  const loadPublication = useMutation({
    mutationFn: () => api.ratingPublication(id),
    onSuccess: ({ text }) => setPublicationText(text),
    onError: (error) => showToast(error.message, "error")
  });

  async function copyPublication() {
    try {
      await navigator.clipboard.writeText(publicationText);
      showToast("Список скопирован");
    } catch {
      publicationField.current?.focus();
      publicationField.current?.select();
      showToast("Текст выделен. Скопируйте его через меню устройства.");
    }
  }

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
          knockouts: liveState?.tournament.mechanics ? 0 : knockoutsByRegistration.get(item.id) ?? 0
        }))
        .sort((a, b) => a.place - b.place);

      if (!results.length) {
        throw new Error("Сначала зафиксируйте вылеты игроков");
      }

      const parsedChipLeaderBonus = Number(chipLeaderBonus);
      if (isChipLeaderTournament && !chipLeaderRegistrationId) {
        throw new Error("Выберите чип-лидера");
      }
      if (isChipLeaderTournament && (!Number.isFinite(parsedChipLeaderBonus) || parsedChipLeaderBonus <= 0)) {
        throw new Error("Укажите положительный бонус чип-лидера");
      }

      return api.saveRatingResults(id, {
        entriesCount: Number(entriesCount || data?.length || 1),
        ...(isChipLeaderTournament ? {
          chipLeaderRegistrationId,
          chipLeaderBonus: parsedChipLeaderBonus
        } : {}),
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
    if (!liveState || liveState.tournament.mechanics || item.status !== "ACTIVE") return false;
    if (liveState.tournament.profile === "FREEZE" || liveState.tournament.reEntry <= 0) return false;
    if (liveState.tournament.profile === "PHOENIX" && item.entryNumber >= 2) return false;
    return true;
  }

  return (
    <section className="space-y-4">
      {liveState?.tournament.mechanics && <Link className="app-button-primary block text-center" to={`/admin/tournaments/${id}/devil`}>DEVIL CONTROL · Halloween-механики</Link>}
      <div className="flex items-center justify-between">
        <h2 className="page-title text-[3rem]">Участники</h2>
        <button
          className="grid h-12 w-12 place-items-center rounded-[0.55rem] bg-rose-400/15 text-rose-200 disabled:opacity-50"
          disabled={downloadParticipants.isPending}
          type="button"
          onClick={() => downloadParticipants.mutate()}
          aria-label="Скачать участников CSV"
          title="Скачать список участников (CSV)"
        >
          <Download className="h-5 w-5" />
        </button>
      </div>

      <section className="app-panel space-y-3 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-base font-black text-white">Список участников</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-400">
              Показано {visibleParticipants.length} из {participantCounts.all}
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-black text-slate-400">
            <ArrowDownUp className="h-4 w-4" />
            <span className="hidden sm:inline">Сортировка</span>
          </div>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            className="w-full border border-white/10 bg-black/20 py-3 pl-10 pr-10 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-rose-400"
            value={participantSearch}
            onChange={(event) => setParticipantSearch(event.target.value)}
            placeholder="Имя, username или Telegram ID"
            type="search"
            aria-label="Поиск участника"
          />
          {participantSearch ? (
            <button
              className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center text-slate-400 transition-colors hover:text-white"
              onClick={() => setParticipantSearch("")}
              type="button"
              aria-label="Очистить поиск"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden border border-white/10 bg-white/10 sm:grid-cols-4">
          {([
            ["ALL", "Все", participantCounts.all],
            ["IN_GAME", "В игре", participantCounts.inGame],
            ["AWAITING_CHECK_IN", "Ждут", participantCounts.awaitingCheckIn],
            ["ELIMINATED", "Выбыли", participantCounts.eliminated]
          ] as const).map(([value, label, count]) => (
            <button
              key={value}
              className={`min-h-11 px-2 text-xs font-black transition-colors ${participantFilter === value ? "bg-rose-500/20 text-rose-100" : "bg-graphite text-slate-400 hover:bg-white/5 hover:text-white"}`}
              type="button"
              onClick={() => setParticipantFilter(value)}
            >
              {label} <span className="ml-1 text-slate-500">{count}</span>
            </button>
          ))}
        </div>

        <label className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 border border-white/10 bg-black/20 px-3 py-2">
          <ArrowDownUp className="h-4 w-4 text-slate-500" />
          <select
            className="min-w-0 bg-transparent text-sm font-bold text-white outline-none"
            value={participantSort}
            onChange={(event) => setParticipantSort(event.target.value as ParticipantSort)}
            aria-label="Сортировка участников"
          >
            <option value="REGISTERED">По времени записи</option>
            <option value="NAME">По имени</option>
            <option value="SEAT">По столу и боксу</option>
            <option value="PLACE">По итоговому месту</option>
          </select>
        </label>
      </section>

      <section className="app-panel space-y-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div className="flex min-w-0 items-center gap-2">
            <Armchair className="h-5 w-5 shrink-0 text-rose-300" />
            <p className="text-base font-black">Live-столы</p>
            <span className="text-xs font-bold text-slate-500">
              {liveState?.inGame.length ?? 0} в игре · {liveState?.eliminated.length ?? 0} выбыло
            </span>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <button
              className="tap inline-flex h-9 items-center gap-1.5 rounded-md border border-white/10 bg-white/8 px-2.5 text-xs font-bold text-white disabled:text-slate-600"
              onClick={() => finalTable.mutate()}
              disabled={finalTable.isPending || !liveState || liveState.inGame.length > 9 || liveState.inGame.length < 2}
              type="button"
            >
              <UsersRound className="h-4 w-4" />
              Финал
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-white/10 bg-black/20">
          {liveState?.tables.map((table, index) => {
            const isExpanded = expandedTable === table.tableNumber;
            const occupiedSeats = table.seats.filter((seat) => seat.registration);
            const emptySeats = table.seats.filter((seat) => !seat.registration);

            return (
              <div key={table.tableNumber} className={index ? "border-t border-white/10" : undefined}>
                <button
                  className="tap flex min-h-12 w-full items-center gap-3 px-3 text-left transition-colors hover:bg-white/[0.04]"
                  type="button"
                  onClick={() => setExpandedTable(isExpanded ? null : table.tableNumber)}
                  aria-expanded={isExpanded}
                  aria-controls={`live-table-${table.tableNumber}`}
                >
                  <span className="min-w-0 flex-1 text-sm font-black text-white">Стол {table.tableNumber}</span>
                  <span className={`text-xs font-bold ${table.occupied ? "text-rose-200" : "text-slate-600"}`}>
                    {table.occupied ? `${table.occupied} игрок${table.occupied === 1 ? "" : table.occupied < 5 ? "а" : "ов"}` : "свободен"}
                  </span>
                  <span className="w-9 text-right text-xs font-black text-slate-400">{table.occupied}/10</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                </button>

                {isExpanded ? (
                  <div id={`live-table-${table.tableNumber}`} className="space-y-2 border-t border-white/8 bg-white/[0.02] p-2">
                    {occupiedSeats.length ? (
                      <div className="grid gap-px overflow-hidden border border-white/10 bg-white/10 sm:grid-cols-2">
                        {occupiedSeats.map((seat) => (
                          <div key={seat.seatNumber} className="flex min-w-0 items-center gap-2 bg-graphite px-2 py-2">
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded text-xs font-black text-rose-100 ring-1 ring-inset ring-rose-400/40">
                              {seat.seatNumber}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-bold text-white">{participantName(seat.registration!)}</p>
                              <p className="truncate text-[0.65rem] font-semibold text-slate-500">@{seat.registration!.user?.username ?? seat.registration!.user?.telegramId ?? "игрок"}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="grid grid-cols-5 gap-1 sm:grid-cols-10">
                      {table.seats.map((seat) => (
                        <span
                          key={seat.seatNumber}
                          className={`grid h-7 place-items-center rounded text-[0.65rem] font-black ${seat.registration ? "bg-rose-500/15 text-rose-200" : "border border-white/8 text-slate-600"}`}
                          title={seat.registration ? participantName(seat.registration) : `Место ${seat.seatNumber} свободно`}
                        >
                          {seat.seatNumber}
                        </span>
                      ))}
                    </div>

                    {!emptySeats.length ? (
                      <p className="text-center text-[0.65rem] font-bold uppercase tracking-[0.12em] text-rose-200">Стол заполнен</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {!liveState?.tournament.mechanics && (<form
          className="space-y-3 rounded-[0.9rem] border border-white/10 bg-white/[0.03] p-3"
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
            className="w-full rounded-[0.75rem] border border-white/10 bg-graphite px-3 py-3 text-sm font-semibold text-white outline-none focus:border-rose-400"
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
            <div className="rounded-[0.75rem] border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm font-bold text-rose-100">
              После фиксации игрок автоматически получит {nextFinishPlace} место.
            </div>
          ) : null}
          {isKnockoutTournament ? (
            <select
              className="w-full rounded-[0.75rem] border border-white/10 bg-graphite px-3 py-3 text-sm font-semibold text-white outline-none focus:border-rose-400"
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
        </form>)}

        {liveState?.knockouts.length ? (
          <div className="space-y-2">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Последние нокауты</p>
            {liveState.knockouts.slice(0, 5).map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-[0.75rem] bg-white/[0.04] px-3 py-2 text-sm">
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
              className="grid h-11 w-11 place-items-center rounded-[0.55rem] bg-white/8 text-white disabled:opacity-50"
              disabled={downloadReport.isPending || !reportDate}
              type="button"
              onClick={() => downloadReport.mutate()}
              aria-label="Скачать XLSX отчет дня"
              title="Скачать отчёт за день (Excel)"
            >
              <Download className="h-5 w-5" />
            </button>
            <button className="grid h-11 w-11 place-items-center rounded-[0.55rem] bg-rose-500/20 text-rose-100" disabled={saveRating.isPending} type="submit" aria-label="Сохранить рейтинг турнира">
              <Save className="h-5 w-5" />
            </button>
          </div>
        </div>

        <button type="button" onClick={() => loadPublication.mutate()} disabled={loadPublication.isPending}
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-white/15 px-3 py-2 text-sm font-semibold disabled:opacity-50">
          <Copy className="h-4 w-4" />{loadPublication.isPending ? "Загрузка…" : "Скопировать для канала"}
        </button>

        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <label className="space-y-1">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Участники для рейтинга</span>
            <input
              className="w-full rounded-[0.75rem] border border-white/10 bg-white/5 px-3 py-3 text-white outline-none focus:border-rose-400"
              type="number"
              min={1}
              value={entriesCount}
              onChange={(event) => setEntriesCount(event.target.value)}
            />
          </label>
          <div className="rounded-[0.75rem] bg-white/8 px-4 py-3 text-right">
            <p className="text-xs font-bold text-slate-400">Пул</p>
            <p className="font-black">{(ratingInfo?.ratingPool ?? 0).toLocaleString("ru-RU")}</p>
          </div>
        </div>

        {ratingInfo?.awards.length ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {ratingInfo.awards.map((award) => (
              <span key={award.place} className="shrink-0 rounded-[0.55rem] border border-white/10 bg-white/5 px-3 py-2 text-xs font-black">
                {award.place} место · {award.percent}% · {award.points.toLocaleString("ru-RU")}
              </span>
            ))}
          </div>
        ) : null}

        {isChipLeaderTournament ? (
          <div className="border-t border-white/10 pt-4">
            <div className="mb-3">
              <p className="text-sm font-black text-white">Чип-лидерство</p>
              <p className="mt-1 text-xs font-semibold text-slate-400">Выберите лидера по фишкам. Итоговое место игрока значения не имеет.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem]">
              <label className="grid gap-1.5">
                <span className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-slate-500">Игрок</span>
                <select
                  className="min-h-11 w-full border border-white/10 bg-graphite px-3 text-sm font-bold text-white outline-none focus:border-rose-400"
                  value={chipLeaderRegistrationId}
                  onChange={(event) => setChipLeaderRegistrationId(event.target.value)}
                >
                  <option value="">Выберите игрока</option>
                  {[...participants]
                    .sort((left, right) => participantName(left).localeCompare(participantName(right), "ru"))
                    .map((item) => (
                      <option key={item.id} value={item.id}>{participantName(item)}</option>
                    ))}
                </select>
              </label>
              <label className="grid gap-1.5">
                <span className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-slate-500">Бонус</span>
                <input
                  className="min-h-11 w-full border border-white/10 bg-graphite px-3 text-right text-sm font-black text-white outline-none focus:border-rose-400"
                  type="number"
                  min={100}
                  step={100}
                  value={chipLeaderBonus}
                  onChange={(event) => setChipLeaderBonus(event.target.value)}
                  aria-label="Бонус чип-лидера"
                />
              </label>
            </div>
          </div>
        ) : null}
      </form>

      <div className="space-y-2">
        {visibleParticipants.map((item) => (
          <div key={item.id} className="app-panel space-y-3 p-3">
            <div className="flex flex-col gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-start gap-2">
                  <p className="min-w-0 flex-1 break-words text-lg font-bold leading-tight">{participantName(item)}</p>
                  <span className={`shrink-0 rounded-[0.55rem] px-2 py-1 text-[0.65rem] font-black uppercase ${participantState(item).className}`}>
                    {participantState(item).label}
                  </span>
                </div>
                <p className="mt-1 break-all text-sm font-semibold leading-snug text-slate-400">
                  @{item.user?.username ?? "no_username"} · {item.user?.telegramId}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-bold">
                  {item.checkedInAt && item.tableNumber && item.seatNumber ? (
                    <span className="inline-flex items-center gap-1.5 rounded-[0.55rem] bg-rose-500/10 px-2.5 py-1 text-electric">
                      <Armchair className="h-3.5 w-3.5" />
                      Стол {item.tableNumber}, бокс {item.seatNumber}
                    </span>
                  ) : null}
                  {item.finishPlace ? (
                    <span className="rounded-[0.55rem] bg-white/8 px-2.5 py-1 text-slate-300">Место {item.finishPlace}</span>
                  ) : null}
                  <span className="rounded-[0.55rem] bg-white/8 px-2.5 py-1 text-slate-400">
                    Входов: {item.entryNumber}
                  </span>
                  <span className="rounded-[0.55rem] bg-rose-500/10 px-2.5 py-1 text-rose-100">
                    Re-entry: {Math.max(0, item.entryNumber - 1)}
                  </span>
                  {liveState?.tournament.addOnEnabled || item.addOnCount > 0 ? (
                    <span className="rounded-[0.55rem] bg-violet/15 px-2.5 py-1 text-violet">Add-on: {item.addOnCount}</span>
                  ) : null}
                  {!liveState?.tournament.mechanics && item.issuedChips > 0 ? (
                    <span className="rounded-[0.55rem] bg-emerald/15 px-2.5 py-1 text-emerald">
                      +{item.issuedChips.toLocaleString("ru-RU")} к стеку
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {item.liveStatus === "IN_GAME" && !item.checkedInAt ? (
                  <button
                    onClick={() => checkInParticipant.mutate(item.checkInToken)}
                    className="tap inline-flex h-10 items-center gap-1.5 rounded-[0.55rem] bg-emerald/15 px-3 text-xs font-black text-emerald disabled:opacity-50"
                    type="button"
                    disabled={checkInParticipant.isPending}
                    aria-label="Отметить участника"
                  >
                    <UserCheck className="h-4 w-4" />
                    Отметить
                  </button>
                ) : null}
                {!liveState?.tournament.mechanics && (canUseReEntry(item) || item.entryNumber > 1) ? (
                  <div className="inline-flex h-10 items-center overflow-hidden rounded-[0.55rem] bg-rose-500/12 text-xs font-black text-rose-100">
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
                  <div className="inline-flex h-10 items-center overflow-hidden rounded-[0.55rem] bg-violet/15 text-xs font-black text-violet">
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
                {!liveState?.tournament.mechanics && <button onClick={() => remove.mutate(item.id)} className="grid h-10 w-10 place-items-center rounded-[0.55rem] bg-rose-400/15 text-rose-200" type="button"><Trash2 className="h-4 w-4" /></button>}
              </div>
            </div>

            {item.liveStatus === "IN_GAME" && item.checkedInAt ? (
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2 rounded-[0.75rem] border border-white/8 bg-white/[0.03] p-2">
                <input
                  className="min-w-0 rounded-[0.75rem] border border-white/10 bg-white/5 px-3 py-3 text-sm font-bold outline-none focus:border-rose-400"
                  type="number"
                  min={1}
                  max={5}
                  placeholder="Стол"
                  value={seatDraft[item.id]?.tableNumber ?? ""}
                  onChange={(event) => setSeatDraft((draft) => ({ ...draft, [item.id]: { tableNumber: event.target.value, seatNumber: draft[item.id]?.seatNumber ?? "" } }))}
                />
                <input
                  className="min-w-0 rounded-[0.75rem] border border-white/10 bg-white/5 px-3 py-3 text-sm font-bold outline-none focus:border-rose-400"
                  type="number"
                  min={1}
                  max={10}
                  placeholder="Бокс"
                  value={seatDraft[item.id]?.seatNumber ?? ""}
                  onChange={(event) => setSeatDraft((draft) => ({ ...draft, [item.id]: { tableNumber: draft[item.id]?.tableNumber ?? "", seatNumber: event.target.value } }))}
                />
                <button
                  className="grid h-12 w-12 place-items-center rounded-[0.75rem] bg-white/8 text-white disabled:opacity-50"
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

            {item.liveStatus === "ELIMINATED" && !liveState?.tournament.mechanics ? (
              <div className="grid grid-cols-[1fr_auto] gap-2 rounded-[0.75rem] border border-white/8 bg-white/[0.03] p-2">
                <input
                  className="min-w-0 rounded-[0.75rem] border border-white/10 bg-white/5 px-3 py-3 text-sm font-bold outline-none focus:border-rose-400"
                  type="number"
                  min={1}
                  max={500}
                  placeholder="Итоговое место"
                  value={finishPlaceDraft[item.id] ?? ""}
                  onChange={(event) => setFinishPlaceDraft((draft) => ({ ...draft, [item.id]: event.target.value }))}
                />
                <button
                  className="grid h-12 w-12 place-items-center rounded-[0.75rem] bg-white/8 text-white disabled:opacity-50"
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
        {!visibleParticipants.length ? (
          <div className="border border-dashed border-white/15 px-4 py-8 text-center text-sm font-semibold text-slate-500">
            По вашему запросу участников не найдено.
          </div>
        ) : null}
      </div>
      <dialog ref={publicationDialog} onClose={() => setPublicationText("")}
        aria-labelledby="publication-title"
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg border border-white/15 bg-graphite p-4 text-white backdrop:bg-black/75">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 id="publication-title" className="text-lg font-bold">Результаты для канала</h3>
          <button type="button" aria-label="Закрыть список" onClick={() => publicationDialog.current?.close()} className="grid h-10 w-10 place-items-center"><X className="h-5 w-5" /></button>
        </div>
        <textarea ref={publicationField} readOnly value={publicationText} aria-label="Текст для канала"
          className="h-[50dvh] w-full resize-none rounded border border-white/15 bg-black/25 p-3 text-sm leading-relaxed" />
        <button type="button" onClick={() => void copyPublication()} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded bg-rose-500 px-4 py-3 text-sm font-bold">
          <Copy className="h-4 w-4" />Скопировать текст
        </button>
      </dialog>
    </section>
  );
}
