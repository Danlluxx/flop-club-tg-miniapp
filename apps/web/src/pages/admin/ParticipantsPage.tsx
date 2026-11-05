import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownUp,
  ArrowRight,
  ChevronDown,
  Download,
  Copy,
  MinusCircle,
  Move,
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
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { formatBarnaulDateTime } from "../../lib/barnaulDate";
import { useToast } from "../../components/Toast";
import type { Registration } from "../../types";

type ParticipantFilter = "ALL" | "IN_GAME" | "AWAITING_CHECK_IN" | "ELIMINATED";
type ParticipantSort = "REGISTERED" | "NAME" | "SEAT" | "PLACE";
type ParticipantsTab = "players" | "tables" | "results";
type PendingConfirm =
  | { kind: "eliminate"; item: Registration }
  | { kind: "remove"; item: Registration }
  | { kind: "restore"; item: Registration }
  | { kind: "final" }
  | { kind: "rating" };

// Seat centres on the rail, in % of the table box. As at a real table, boxes run clockwise from the dealer's left.
const seatPositions: Record<number, { left: string; top: string }> = {
  1: { left: "62%", top: "11%" },
  2: { left: "83%", top: "17%" },
  3: { left: "90%", top: "47%" },
  4: { left: "83%", top: "75%" },
  5: { left: "62%", top: "81%" },
  6: { left: "38%", top: "81%" },
  7: { left: "17%", top: "75%" },
  8: { left: "10%", top: "47%" },
  9: { left: "17%", top: "17%" },
  10: { left: "38%", top: "11%" }
};

const tabs: Array<[ParticipantsTab, string]> = [["players", "Игроки"], ["tables", "Столы"], ["results", "Итоги"]];

function participantName(item: Registration) {
  return item.user?.displayName || [item.user?.firstName, item.user?.lastName].filter(Boolean).join(" ") || item.user?.username || item.user?.telegramId || "Игрок";
}

function participantState(item: Registration) {
  if (item.liveStatus === "ELIMINATED") return { label: "выбыл", className: "bg-slate-500/15 text-slate-400" };
  if (item.checkedInAt) return { label: "в игре", className: "bg-emerald/15 text-emerald" };
  return { label: "записан", className: "bg-amber-300/15 text-amber-200" };
}

function participantSummary(item: Registration) {
  const parts: string[] = [];
  if (item.finishPlace) parts.push(`${item.finishPlace} место`);
  if (item.checkedInAt && item.tableNumber && item.seatNumber) parts.push(`стол ${item.tableNumber}, бокс ${item.seatNumber}`);
  if (item.entryNumber > 1) parts.push(`re-entry ${item.entryNumber - 1}`);
  if (item.addOnCount > 0) parts.push("add-on");
  return parts.join(" · ");
}

export function ParticipantsPage() {
  const { id = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [entriesCount, setEntriesCount] = useState("");
  const entriesEdited = useRef(false);
  const [publicationText, setPublicationText] = useState("");
  const publicationDialog = useRef<HTMLDialogElement>(null);
  const publicationField = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (publicationText) publicationDialog.current?.showModal(); }, [publicationText]);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const confirmDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (pendingConfirm) confirmDialog.current?.showModal(); }, [pendingConfirm]);
  const [chipLeaderRegistrationId, setChipLeaderRegistrationId] = useState("");
  const [chipLeaderBonus, setChipLeaderBonus] = useState("2000");
  const [participantSearch, setParticipantSearch] = useState("");
  const [participantFilter, setParticipantFilter] = useState<ParticipantFilter>("ALL");
  const [participantSort, setParticipantSort] = useState<ParticipantSort>("REGISTERED");
  const [expandedParticipantId, setExpandedParticipantId] = useState<string | null>(null);
  const [tableOpen, setTableOpen] = useState<Record<number, boolean>>({});
  const [moveSourceId, setMoveSourceId] = useState<string | null>(null);
  const [finishPlaceDraft, setFinishPlaceDraft] = useState<Record<string, string>>({});
  const [killerRegistrationId, setKillerRegistrationId] = useState("");
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const parsedEntriesCount = Number(entriesCount);
  const ratingEntriesCount = Number.isFinite(parsedEntriesCount) && parsedEntriesCount > 0 ? parsedEntriesCount : undefined;
  // Check-ins also arrive from the QR scanner on another phone, so keep the screen fresh.
  const { data } = useQuery({ queryKey: ["participants", id], queryFn: () => api.participants(id), refetchInterval: 15000 });
  const { data: liveState } = useQuery({ queryKey: ["admin", "live", id], queryFn: () => api.liveState(id), enabled: Boolean(id), refetchInterval: 15000 });
  const { data: ratingInfo } = useQuery({
    queryKey: ["admin", "rating-results", id, ratingEntriesCount],
    queryFn: () => api.ratingResults(id, ratingEntriesCount),
    enabled: Boolean(id)
  });
  const savedChipLeaderUserId = ratingInfo?.chipLeaderAward?.userId;
  const savedChipLeaderPoints = ratingInfo?.chipLeaderAward?.points;
  const participantsLoaded = Boolean(data);

  useEffect(() => {
    if (entriesEdited.current || !ratingInfo?.entriesCount) return;
    setEntriesCount(String(ratingInfo.entriesCount));
  }, [ratingInfo?.entriesCount]);

  useEffect(() => {
    if (!data) return;
    const owner = data.find((registration) => registration.userId === savedChipLeaderUserId);
    setChipLeaderRegistrationId(owner?.id ?? "");
    setChipLeaderBonus(savedChipLeaderPoints ? String(savedChipLeaderPoints) : "2000");
    // Only the saved award may reset the form: live refreshes must not wipe an unsaved choice.
  }, [participantsLoaded, savedChipLeaderUserId, savedChipLeaderPoints]);

  const tab: ParticipantsTab = searchParams.get("tab") === "tables" || searchParams.get("tab") === "results" || searchParams.get("tab") === "players"
    ? searchParams.get("tab") as ParticipantsTab
    : liveState?.tournament.status === "FINISHED" ? "results" : "players";

  function selectTab(next: ParticipantsTab) {
    setSearchParams((params) => {
      params.set("tab", next);
      return params;
    }, { replace: true });
  }

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
  const hasMechanics = Boolean(liveState?.tournament.mechanics);
  const isKnockoutTournament = liveState?.tournament.profile === "KNOCKOUT";
  const isChipLeaderTournament = liveState?.tournament.title.trim().toLowerCase() === "flop chip leader";
  const reportDate = liveState?.tournament.startsAt ? new Date(liveState.tournament.startsAt).toISOString().slice(0, 10) : "";
  const moveSource = inGameParticipants.find((item) => item.id === moveSourceId) ?? null;
  const canFormFinal = inGameParticipants.length >= 2 && inGameParticipants.length <= 9;
  const actualEntries = participants.filter((item) => item.checkedInAt).reduce((sum, item) => sum + item.entryNumber, 0);
  const awards = ratingInfo?.awards ?? [];
  const pointsByPlace = new Map(awards.map((award) => [award.place, award.points]));
  const placedParticipants = participants
    .filter((item) => item.finishPlace || item.liveStatus === "ELIMINATED")
    .sort((left, right) => (left.finishPlace ?? Number.MAX_SAFE_INTEGER) - (right.finishPlace ?? Number.MAX_SAFE_INTEGER));
  const missingPlaces = awards.map((award) => award.place).filter((place) => !participants.some((item) => item.finishPlace === place));
  const ratedPlayersCount = participants.filter((item) => item.finishPlace && item.finishPlace <= awards.length).length;

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
      setMoveSourceId(null);
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
    mutationFn: ({ registrationId, killerId }: { registrationId: string; killerId: string }) => api.recordElimination(id, {
      eliminatedRegistrationId: registrationId,
      killerRegistrationId: isKnockoutTournament ? killerId || null : null
    }),
    onSuccess: async () => {
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

  const restoreParticipant = useMutation({
    mutationFn: api.addReEntry,
    onSuccess: async (registration) => {
      showToast(`Игрок снова в игре: стол ${registration.tableNumber}, бокс ${registration.seatNumber}`);
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
    onSuccess: async (_registration, { registrationId }) => {
      showToast("Место обновлено");
      setFinishPlaceDraft(({ [registrationId]: _saved, ...draft }) => draft);
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
      entriesEdited.current = false;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "rating-results", id] }),
        queryClient.invalidateQueries({ queryKey: ["rating"] }),
        queryClient.invalidateQueries({ queryKey: ["tournament", id] })
      ]);
    },
    onError: (error) => showToast(error.message, "error")
  });

  function canUseReEntry(item: Registration) {
    if (!liveState || liveState.tournament.mechanics || item.status !== "ACTIVE") return false;
    if (liveState.tournament.profile === "FREEZE" || liveState.tournament.reEntry <= 0) return false;
    if (liveState.tournament.profile === "PHOENIX" && item.entryNumber >= 2) return false;
    return true;
  }

  function renderReEntryControl(item: Registration) {
    if (hasMechanics || (!canUseReEntry(item) && item.entryNumber <= 1)) return null;
    return (
      <div className="inline-flex h-10 items-center overflow-hidden rounded-[0.55rem] bg-rose-500/12 text-xs font-black text-rose-100">
        <button
          onClick={() => item.liveStatus === "ELIMINATED" ? setPendingConfirm({ kind: "restore", item }) : addReEntry.mutate(item.id)}
          className="tap inline-flex h-full items-center gap-1.5 px-3 disabled:opacity-40"
          type="button"
          disabled={!canUseReEntry(item) || addReEntry.isPending}
          aria-label="Добавить re-entry"
        >
          <PlusCircle className="h-4 w-4" />
          Re-entry{item.entryNumber > 1 ? ` ${item.entryNumber - 1}` : ""}
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
    );
  }

  function renderAddOnControl(item: Registration) {
    if (!liveState?.tournament.addOnEnabled || item.liveStatus !== "IN_GAME") return null;
    return (
      <div className="inline-flex h-10 items-center overflow-hidden rounded-[0.55rem] bg-violet/15 text-xs font-black text-violet">
        <button
          onClick={() => addOn.mutate(item.id)}
          className="tap inline-flex h-full items-center gap-1.5 px-3 disabled:opacity-40"
          type="button"
          disabled={item.addOnCount >= 1 || addOn.isPending}
          aria-label="Отметить add-on"
        >
          <PlusCircle className="h-4 w-4" />
          Add-on{item.addOnCount > 0 ? ` ${item.addOnCount}` : ""}
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
    );
  }

  function startMove(item: Registration) {
    setMoveSourceId(item.id);
    selectTab("tables");
  }

  function askElimination(item: Registration) {
    setKillerRegistrationId("");
    setPendingConfirm({ kind: "eliminate", item });
  }

  function confirmPending() {
    if (!pendingConfirm) return;
    if (pendingConfirm.kind === "eliminate") {
      setMoveSourceId(null);
      setExpandedParticipantId(null);
      elimination.mutate({ registrationId: pendingConfirm.item.id, killerId: killerRegistrationId });
    }
    if (pendingConfirm.kind === "remove") {
      setExpandedParticipantId(null);
      remove.mutate(pendingConfirm.item.id);
    }
    if (pendingConfirm.kind === "restore") restoreParticipant.mutate(pendingConfirm.item.id);
    if (pendingConfirm.kind === "final") finalTable.mutate();
    if (pendingConfirm.kind === "rating") saveRating.mutate();
    confirmDialog.current?.close();
  }

  const confirmCopy = pendingConfirm && {
    eliminate: pendingConfirm.kind === "eliminate" ? {
      title: `${participantName(pendingConfirm.item)} выбыл?`,
      body: `Игрок получит ${inGameParticipants.length} место и освободит бокс. ${canUseReEntry(pendingConfirm.item) ? "Вернуть его в игру можно будет через Re-entry." : "В этом турнире нет re-entry, вернуть его в игру будет нельзя."}`,
      action: "Игрок выбыл"
    } : null,
    remove: pendingConfirm.kind === "remove" ? {
      title: `Удалить ${participantName(pendingConfirm.item)}?`,
      body: "Запись на турнир будет отменена, игрок исчезнет из списка участников.",
      action: "Удалить"
    } : null,
    restore: pendingConfirm.kind === "restore" ? {
      title: `Вернуть ${participantName(pendingConfirm.item)} в игру?`,
      body: `Добавится ещё один вход, игрок сядет в первый свободный бокс.${pendingConfirm.item.finishPlace ? ` Его ${pendingConfirm.item.finishPlace} место освободится, и места вылетевших после него сдвинутся.` : ""} Если это исправление ошибки, потом уберите лишний вход кнопкой «−».`,
      action: "Вернуть в игру"
    } : null,
    final: {
      title: "Собрать финальный стол?",
      body: `Все ${inGameParticipants.length} игроков будут пересажены за один стол. Текущая рассадка не сохранится.`,
      action: "Собрать финал"
    },
    rating: {
      title: "Начислить рейтинг?",
      body: `Заполнено призовых мест: ${ratedPlayersCount} из ${awards.length}, расчёт на ${entriesCount || data?.length || 1} участников. Итоги уйдут в канал, если ещё не публиковались.`,
      action: "Начислить"
    }
  }[pendingConfirm.kind];

  return (
    <section className="space-y-4">
      <Link to="/admin/tournaments" className="screen-back tap" aria-label="Назад к турнирам">
        <ArrowRight className="h-5 w-5 rotate-180" />
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="page-title text-[3rem]">Участники</h2>
          {liveState && (
            <p className="mt-2 text-sm font-semibold text-slate-400">
              {liveState.tournament.title.toUpperCase()} · {formatBarnaulDateTime(liveState.tournament.startsAt)}
            </p>
          )}
        </div>
        <button
          className="grid h-12 w-12 shrink-0 place-items-center rounded-[0.55rem] bg-rose-400/15 text-rose-200 disabled:opacity-50"
          disabled={downloadParticipants.isPending}
          type="button"
          onClick={() => downloadParticipants.mutate()}
          aria-label="Скачать участников CSV"
          title="Скачать список участников (CSV)"
        >
          <Download className="h-5 w-5" />
        </button>
      </div>

      {hasMechanics && <Link className="app-button-primary flex items-center justify-center" to={`/admin/tournaments/${id}/devil`}>DEVIL CONTROL · Halloween-механики</Link>}

      <div className="rating-scope-tabs admin-tabs" role="tablist" aria-label="Разделы страницы участников">
        {tabs.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={`rating-scope-tab tap ${tab === value ? "rating-scope-tab-active" : ""}`}
            onClick={() => selectTab(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "players" && (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-1.5">
            {([
              ["ALL", "Все", participantCounts.all],
              ["IN_GAME", "В игре", participantCounts.inGame],
              ["AWAITING_CHECK_IN", "Ждут", participantCounts.awaitingCheckIn],
              ["ELIMINATED", "Выбыли", participantCounts.eliminated]
            ] as const).map(([value, label, count]) => (
              <button
                key={value}
                className={`admin-filter tap ${participantFilter === value ? "admin-filter-active" : ""}`}
                type="button"
                aria-pressed={participantFilter === value}
                onClick={() => setParticipantFilter(value)}
              >
                <strong>{count}</strong>
                {label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
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

          <div className="flex items-center justify-between gap-3 px-1">
            <p className="shrink-0 text-sm font-semibold text-slate-400">
              {visibleParticipants.length} из {participantCounts.all}
            </p>
            <label className="flex min-w-0 items-center gap-2 text-slate-400">
              <ArrowDownUp className="h-4 w-4 shrink-0" />
              <select
                className="min-w-0 bg-transparent text-right text-sm font-bold text-white outline-none"
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
          </div>

          <div className="space-y-2">
            {visibleParticipants.map((item) => {
              const state = participantState(item);
              const isExpanded = expandedParticipantId === item.id;
              const isSeated = item.liveStatus === "IN_GAME" && Boolean(item.checkedInAt);
              const summary = participantSummary(item);
              return (
                <article key={item.id} className="app-panel admin-player">
                  <div className="flex items-center gap-2 p-2">
                    <button
                      type="button"
                      className="tap flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-[0.75rem] px-2 text-left"
                      aria-expanded={isExpanded}
                      onClick={() => setExpandedParticipantId(isExpanded ? null : item.id)}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.95rem] font-bold text-white">{participantName(item)}</span>
                        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-400">
                          <span className={`shrink-0 rounded-[0.55rem] px-1.5 py-0.5 text-[0.68rem] font-bold ${state.className}`}>{state.label}</span>
                          {summary && <span className="truncate">{summary}</span>}
                        </span>
                      </span>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </button>
                    {item.liveStatus === "IN_GAME" && !item.checkedInAt ? (
                      <button
                        onClick={() => checkInParticipant.mutate(item.checkInToken)}
                        className="tap inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[0.55rem] bg-emerald/15 px-3 text-xs font-black text-emerald disabled:opacity-50"
                        type="button"
                        disabled={checkInParticipant.isPending}
                        aria-label={`Отметить: ${participantName(item)}`}
                      >
                        <UserCheck className="h-4 w-4" />
                        Отметить
                      </button>
                    ) : null}
                    {item.liveStatus === "ELIMINATED" && canUseReEntry(item) ? (
                      <button
                        onClick={() => setPendingConfirm({ kind: "restore", item })}
                        className="tap inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[0.55rem] bg-rose-500/12 px-3 text-xs font-black text-rose-100 disabled:opacity-50"
                        type="button"
                        disabled={restoreParticipant.isPending}
                        aria-label={`Вернуть в игру через re-entry: ${participantName(item)}`}
                      >
                        <PlusCircle className="h-4 w-4" />
                        Re-entry
                      </button>
                    ) : null}
                  </div>

                  {isExpanded ? (
                    <div className="space-y-3 border-t border-white/10 p-3">
                      <p className="break-all text-sm font-semibold leading-snug text-slate-400">
                        @{item.user?.username ?? "no_username"} · {item.user?.telegramId}
                      </p>
                      <div className="flex flex-wrap gap-1.5 text-xs font-bold">
                        <span className="rounded-[0.55rem] bg-white/8 px-2.5 py-1 text-slate-400">Входов: {item.entryNumber}</span>
                        <span className="rounded-[0.55rem] bg-rose-500/10 px-2.5 py-1 text-rose-100">Re-entry: {Math.max(0, item.entryNumber - 1)}</span>
                        {liveState?.tournament.addOnEnabled || item.addOnCount > 0 ? (
                          <span className="rounded-[0.55rem] bg-violet/15 px-2.5 py-1 text-violet">Add-on: {item.addOnCount}</span>
                        ) : null}
                        {!hasMechanics && item.issuedChips > 0 ? (
                          <span className="rounded-[0.55rem] bg-emerald/15 px-2.5 py-1 text-emerald">+{item.issuedChips.toLocaleString("ru-RU")} к стеку</span>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {renderReEntryControl(item)}
                        {renderAddOnControl(item)}
                        {isSeated ? (
                          <button
                            type="button"
                            onClick={() => startMove(item)}
                            className="tap inline-flex h-10 items-center gap-1.5 rounded-[0.55rem] bg-white/8 px-3 text-xs font-black text-white"
                          >
                            <Move className="h-4 w-4" />
                            Пересадить
                          </button>
                        ) : null}
                        {isSeated && !hasMechanics ? (
                          <button
                            type="button"
                            onClick={() => askElimination(item)}
                            className="tap inline-flex h-10 items-center gap-1.5 rounded-[0.55rem] bg-rose-500/20 px-3 text-xs font-black text-rose-100"
                          >
                            <Skull className="h-4 w-4" />
                            Выбыл
                          </button>
                        ) : null}
                        {!hasMechanics && (
                          <button
                            type="button"
                            onClick={() => setPendingConfirm({ kind: "remove", item })}
                            className="tap grid h-10 w-10 place-items-center rounded-[0.55rem] bg-white/8 text-slate-400"
                            aria-label="Удалить участника"
                            title="Удалить участника"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
            {!visibleParticipants.length ? (
              <div className="border border-dashed border-white/15 px-4 py-8 text-center text-sm font-semibold text-slate-500">
                {participantCounts.all ? "По вашему запросу участников не найдено." : "На турнир пока никто не записался."}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {tab === "tables" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 px-1">
            <p className="text-sm font-semibold text-slate-400">
              {liveState?.inGame.length ?? 0} в игре · {liveState?.eliminated.length ?? 0} выбыло
            </p>
            <button
              className="tap inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-white/10 bg-white/8 px-3 text-xs font-bold text-white disabled:text-slate-600"
              onClick={() => setPendingConfirm({ kind: "final" })}
              disabled={finalTable.isPending || !canFormFinal}
              title={canFormFinal ? "Пересадить всех за финальный стол" : "Доступно, когда в игре от 2 до 9 игроков"}
              type="button"
            >
              <UsersRound className="h-4 w-4" />
              Финал
            </button>
          </div>

          {!moveSource && inGameParticipants.length > 0 && (
            <p className="px-1 text-xs font-semibold text-slate-500">Нажмите на игрока, чтобы пересадить его или отметить вылет.</p>
          )}

          {liveState?.tables.map((table) => {
            const isOpen = moveSource ? true : tableOpen[table.tableNumber] ?? table.occupied > 0;
            return (
              <div key={table.tableNumber} className="app-panel overflow-hidden">
                <button
                  className="tap flex min-h-12 w-full items-center gap-3 px-4 text-left"
                  type="button"
                  onClick={() => setTableOpen((open) => ({ ...open, [table.tableNumber]: !isOpen }))}
                  aria-expanded={isOpen}
                  aria-controls={`live-table-${table.tableNumber}`}
                >
                  <span className="min-w-0 flex-1 text-sm font-black text-white">Стол {table.tableNumber}</span>
                  <span className="text-xs font-black text-slate-400">{table.occupied ? `${table.occupied}/10` : "свободен"}</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>

                {isOpen ? (
                  <div id={`live-table-${table.tableNumber}`} className="admin-table">
                    <div className="admin-table-felt" aria-hidden="true">
                      <span className="admin-table-dealer">D</span>
                      <span className="admin-table-brand">FLOP CLUB</span>
                    </div>
                    {table.seats.map((seat) => {
                      const registration = seat.registration;
                      const isSource = registration?.id === moveSourceId;
                      const disabled = moveSeat.isPending || (!registration && !moveSource);
                      return (
                        <button
                          key={seat.seatNumber}
                          type="button"
                          disabled={disabled}
                          style={seatPositions[seat.seatNumber]}
                          className={`admin-seat tap ${registration ? "" : "admin-seat-free"} ${isSource ? "admin-seat-source" : ""} ${!registration && moveSource ? "admin-seat-target" : ""}`}
                          onClick={() => {
                            if (registration) setMoveSourceId(isSource ? null : registration.id);
                            else if (moveSource) moveSeat.mutate({ registrationId: moveSource.id, tableNumber: table.tableNumber, seatNumber: seat.seatNumber });
                          }}
                          aria-label={registration ? `Бокс ${seat.seatNumber}: ${participantName(registration)}` : `Бокс ${seat.seatNumber}, свободен`}
                        >
                          <b>{seat.seatNumber}</b>
                          {registration && <span>{participantName(registration)}</span>}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}

          {moveSource && (
            <div className="admin-move-bar">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white">{participantName(moveSource)}</p>
                  <p className="text-xs font-semibold text-slate-400">Выберите свободный бокс, чтобы пересадить</p>
                </div>
                <button type="button" onClick={() => setMoveSourceId(null)} className="tap grid h-10 w-10 shrink-0 place-items-center rounded-[0.55rem] bg-white/8 text-white" aria-label="Отменить выбор игрока">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {renderReEntryControl(moveSource)}
                {renderAddOnControl(moveSource)}
                {!hasMechanics && (
                  <button type="button" onClick={() => askElimination(moveSource)} className="tap inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[0.55rem] bg-rose-500/20 px-3 text-xs font-black text-rose-100">
                    <Skull className="h-4 w-4" />
                    Выбыл
                  </button>
                )}
              </div>
            </div>
          )}

          {liveState?.knockouts.length ? (
            <div className="space-y-2 pt-1">
              <p className="px-1 text-xs font-black uppercase tracking-[0.18em] text-slate-500">Последние нокауты</p>
              {liveState.knockouts.slice(0, 5).map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-[0.75rem] bg-white/[0.04] px-3 py-2 text-sm">
                  <span className="truncate text-slate-400">{participantName(item.eliminatedRegistration!)}</span>
                  <span className="shrink-0 text-rose-200">выбит</span>
                  <span className="truncate text-right font-bold">{item.killerRegistration ? participantName(item.killerRegistration) : "без нокаута"}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {tab === "results" && (
        <div className="space-y-3">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setPendingConfirm({ kind: "rating" });
            }}
            className="app-panel space-y-4 p-4"
          >
            <div>
              <p className="flex items-center gap-2 text-lg font-black">
                <Trophy className="h-5 w-5 text-rose-300" />
                Рейтинг турнира
              </p>
              <p className="mt-1 text-sm font-bold text-slate-400">
                Очки получает верхние 30% участников. Места берутся автоматически из вылетов.
              </p>
            </div>

            <div className="grid grid-cols-[1fr_auto] items-end gap-3">
              <label className="space-y-1">
                <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Участники для рейтинга</span>
                <input
                  className="w-full rounded-[0.75rem] border border-white/10 bg-white/5 px-3 py-3 text-white outline-none focus:border-rose-400"
                  type="number"
                  min={1}
                  value={entriesCount}
                  onChange={(event) => {
                    entriesEdited.current = true;
                    setEntriesCount(event.target.value);
                  }}
                />
              </label>
              <div className="rounded-[0.75rem] bg-white/8 px-4 py-3 text-right">
                <p className="text-xs font-bold text-slate-400">Пул</p>
                <p className="font-black">{(ratingInfo?.ratingPool ?? 0).toLocaleString("ru-RU")}</p>
              </div>
            </div>

            {actualEntries > 0 && String(actualEntries) !== entriesCount ? (
              <button
                type="button"
                className="tap w-full rounded-[0.75rem] bg-amber-300/15 px-3 py-2 text-left text-sm font-bold text-amber-200"
                onClick={() => {
                  entriesEdited.current = true;
                  setEntriesCount(String(actualEntries));
                }}
              >
                Входов по факту: {actualEntries}. Подставить
              </button>
            ) : null}

            {awards.length ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {awards.map((award) => (
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

            {missingPlaces.length ? (
              <p className="text-sm font-semibold text-amber-200">Пока без игрока: {missingPlaces.join(", ")} место</p>
            ) : null}
            {ratingInfo?.results.length ? (
              <p className="text-sm font-semibold text-emerald">Рейтинг уже начислен: {ratingInfo.results.length} мест. Новое сохранение заменит его.</p>
            ) : null}

            <button className="app-button-primary w-full" disabled={saveRating.isPending || !ratedPlayersCount} type="submit">
              {ratingInfo?.results.length ? "Пересчитать рейтинг" : "Начислить рейтинг"}
            </button>
          </form>

          <div className="grid gap-2">
            <button type="button" onClick={() => loadPublication.mutate()} disabled={loadPublication.isPending}
              className="app-panel tap flex min-h-12 items-center gap-3 px-4 text-sm font-bold disabled:opacity-50">
              <Copy className="h-4 w-4 text-electric" />{loadPublication.isPending ? "Загрузка…" : "Текст итогов для канала"}
            </button>
            <button type="button" onClick={() => downloadReport.mutate()} disabled={downloadReport.isPending || !reportDate}
              className="app-panel tap flex min-h-12 items-center gap-3 px-4 text-sm font-bold disabled:opacity-50">
              <Download className="h-4 w-4 text-electric" />Отчёт за день (Excel)
            </button>
          </div>

          <div className="space-y-2">
            <p className="px-1 pt-1 text-sm font-black text-white">Места</p>
            {placedParticipants.map((item) => {
              const draft = finishPlaceDraft[item.id];
              const saved = item.finishPlace ? String(item.finishPlace) : "";
              const editable = item.liveStatus === "ELIMINATED" && !hasMechanics;
              const points = item.finishPlace ? pointsByPlace.get(item.finishPlace) : undefined;
              return (
                <div key={item.id} className="app-panel flex items-center gap-2 p-2">
                  {editable ? (
                    <input
                      className="w-16 shrink-0 rounded-[0.75rem] border border-white/10 bg-white/5 px-2 py-2 text-center text-sm font-bold outline-none focus:border-rose-400"
                      type="number"
                      min={1}
                      max={500}
                      placeholder="—"
                      value={draft ?? saved}
                      onChange={(event) => setFinishPlaceDraft((current) => ({ ...current, [item.id]: event.target.value }))}
                      aria-label={`Итоговое место: ${participantName(item)}`}
                    />
                  ) : (
                    <span className="grid h-12 w-16 shrink-0 place-items-center text-sm font-black">{saved || "—"}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">{participantName(item)}</p>
                    <p className="text-xs font-semibold text-slate-400">
                      {points ? `${points.toLocaleString("ru-RU")} очков` : "без очков"}
                      {item.liveStatus === "IN_GAME" ? " · ещё в игре" : ""}
                    </p>
                  </div>
                  {draft !== undefined && draft !== saved ? (
                    <button
                      className="tap grid h-10 w-10 shrink-0 place-items-center rounded-[0.75rem] bg-white/8 text-white disabled:opacity-50"
                      type="button"
                      disabled={updateFinishPlace.isPending || !draft}
                      onClick={() => updateFinishPlace.mutate({ registrationId: item.id, finishPlace: Number(draft) })}
                      aria-label="Сохранить итоговое место"
                    >
                      <Save className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              );
            })}
            {!placedParticipants.length ? (
              <div className="border border-dashed border-white/15 px-4 py-8 text-center text-sm font-semibold text-slate-500">
                Места появятся, когда игроки начнут вылетать.
              </div>
            ) : null}
          </div>
        </div>
      )}

      <dialog ref={confirmDialog} onClose={() => setPendingConfirm(null)}
        aria-labelledby="confirm-title"
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-white/15 bg-graphite p-4 text-white backdrop:bg-black/75">
        {confirmCopy && (
          <div className="space-y-4">
            <h3 id="confirm-title" className="text-lg font-bold">{confirmCopy.title}</h3>
            <p className="text-sm font-semibold text-slate-400">{confirmCopy.body}</p>
            {pendingConfirm?.kind === "eliminate" && isKnockoutTournament ? (
              <select
                className="w-full rounded-[0.75rem] border border-white/10 bg-graphite px-3 py-3 text-sm font-semibold text-white outline-none focus:border-rose-400"
                value={killerRegistrationId}
                onChange={(event) => setKillerRegistrationId(event.target.value)}
                aria-label="Кто выбил"
              >
                <option value="">Кто выбил, если есть</option>
                {inGameParticipants.filter((item) => item.id !== pendingConfirm.item.id).map((item) => (
                  <option key={item.id} value={item.id}>{participantName(item)}</option>
                ))}
              </select>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => confirmDialog.current?.close()} className="tap min-h-12 rounded-md bg-white/8 text-sm font-bold">Отмена</button>
              <button type="button" onClick={confirmPending} className="tap min-h-12 rounded-md bg-rose-500 text-sm font-bold text-white">{confirmCopy.action}</button>
            </div>
          </div>
        )}
      </dialog>

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
