import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Plus, RotateCcw, Skull } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { GameHistory } from "../../components/DevilDealPanel";
import { useToast } from "../../components/Toast";
import { formatBarnaulDateTime } from "../../lib/barnaulDate";
import { api } from "../../lib/api";
import type { Registration } from "../../types";

function playerName(registration: Registration) {
  return registration.user?.displayName || registration.user?.firstName || registration.user?.username || "Игрок";
}

export function DevilControlPage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { data, isError } = useQuery({ queryKey: ["admin", "devil", id], queryFn: () => api.devilControl(id), refetchInterval: 3000 });
  const [eliminatedRegistrationId, setEliminatedRegistrationId] = useState("");
  const [player, setPlayer] = useState("");
  const [kind, setKind] = useState("POCKET_SIXES");
  const [handId, setHandId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [reversal, setReversal] = useState("");
  const [reason, setReason] = useState("");
  const [correctedKind, setCorrectedKind] = useState("");
  const [filterUser, setFilterUser] = useState("");

  const action = useMutation({
    mutationFn: ({ name, payload }: { name: string; payload: unknown }) => api.devilAction(id, name, payload),
    onSuccess: async (_result, variables) => {
      showToast(variables.name === "re-entry" ? "Платный re-entry отмечен — игрок снова в игре" : variables.name === "bounty" ? "Bounty добавлен игроку" : "Действие сохранено");
      if (variables.name === "eliminate") setEliminatedRegistrationId("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "devil", id] }),
        queryClient.invalidateQueries({ queryKey: ["devil", id] }),
        queryClient.invalidateQueries({ queryKey: ["tournament", id] }),
        queryClient.invalidateQueries({ queryKey: ["participants", id] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "live", id] }),
        queryClient.invalidateQueries({ queryKey: ["rating"] })
      ]);
    },
    onError: (error) => showToast(error.message, "error")
  });

  if (isError) return <div role="alert">Не удалось загрузить DEVIL CONTROL.</div>;
  if (!data) return <div>Загрузка DEVIL CONTROL…</div>;

  const registrations = data.registrations ?? [];
  const players = registrations.filter((registration, index) => registrations.findIndex(item => item.userId === registration.userId) === index);
  const active = players.filter(registration => registration.liveStatus === "IN_GAME" && registration.checkedInAt);
  const eliminated = players.filter(registration => registration.liveStatus === "ELIMINATED");
  const reversed = new Set(data.events.map(event => event.reversesId).filter(Boolean));
  const reversible = data.events.filter(event => ["BOUNTY_ELIMINATION", "DEVILS_SIXES_6BB", "DEVILS_SIXES_13BB"].includes(event.type) && !reversed.has(event.id));
  const selectedEliminated = active.find(registration => registration.id === eliminatedRegistrationId);
  const stats = [
    [data.stats.registered, "Игроков"],
    [data.stats.active, "В игре"],
    [data.stats.eliminations, "Выбываний"],
    [data.stats.bounties, "Bounty"]
  ] as const;

  function run(name: string, payload: unknown) {
    if (!action.isPending) action.mutate({ name, payload });
  }

  return <section className="devil-control">
    <Link className="page-kicker" to={`/admin/tournaments/${id}/participants`}>← Участники и результаты</Link>
    <header>
      <p className="devil-kicker">FLOP DEVIL DEAL</p>
      <h1 className="page-title mt-3">DEVIL CONTROL</h1>
      <p className="devil-muted mt-3">Время сервера: {formatBarnaulDateTime(data.serverNow)} · Барнаул<br />Воскрешение до {formatBarnaulDateTime(data.rules.registrationClosesAt)} · Платный re-entry доступен до завершения турнира</p>
    </header>

    <div className="devil-admin-stats">{stats.map(([value, label]) => <div key={label}><b>{value}</b><span>{label}</span></div>)}</div>

    <form className="devil-panel devil-primary-action" onSubmit={event => {
      event.preventDefault();
      if (selectedEliminated) run("eliminate", { registrationId: selectedEliminated.id, lifeNumber: selectedEliminated.lifeNumber });
    }}>
      <div className="devil-section-heading"><Skull /><div><h2>Игрок выбыл</h2><p className="devil-muted">После отметки игрок сможет выбрать воскрешение. Платный re-entry отмечается ниже отдельно.</p></div></div>
      <select aria-label="Кто выбыл" value={eliminatedRegistrationId} onChange={event => setEliminatedRegistrationId(event.target.value)} required>
        <option value="">Кто выбыл</option>
        {active.map(registration => <option key={registration.id} value={registration.id}>{playerName(registration)}</option>)}
      </select>
      {selectedEliminated && <p className="devil-place-hint">После фиксации игрок получит {data.stats.active} место.</p>}
      <button className="app-button-primary" disabled={action.isPending || !selectedEliminated || !data.running}>Игрок выбыл</button>
    </form>

    <section className="devil-panel">
      <div><h2>Игроки и bounty</h2><p className="devil-muted mt-2">Нажимайте «+ Bounty» за каждое выбивание. Указывать, кого именно выбил игрок, не нужно.</p></div>
      <div className="devil-player-list">
        {players.map(registration => {
          const events = data.events.filter(event => event.userId === registration.userId);
          const bounties = events.filter(event => event.type === "BOUNTY_ELIMINATION" && !reversed.has(event.id)).length;
          const status = registration.liveStatus === "ELIMINATED" ? "Выбыл" : registration.checkedInAt ? "В игре" : "Ожидает отметки";
          return <article className="devil-player" key={registration.id}>
            <div className="devil-player-summary">
              <div><strong>{playerName(registration)}</strong><span className={`devil-status devil-status-${registration.liveStatus.toLowerCase()}`}>{status}</span></div>
              <div className="devil-bounty-count"><b>{bounties}</b><span>Bounty</span></div>
            </div>
            <div className="devil-player-actions">
              <button className="devil-bounty-button" type="button" disabled={action.isPending || !registration.checkedInAt} onClick={() => run("bounty", { registrationId: registration.id, eventKey: crypto.randomUUID() })}><Plus />Bounty</button>
              {registration.liveStatus === "ELIMINATED" && <button className="devil-reentry-button" type="button" disabled={action.isPending || !data.paidReEntryOpen} onClick={() => run("re-entry", { userId: registration.userId })}><RotateCcw />Платный re-entry · {data.reEntryPrice.toLocaleString("ru-RU")} ₽</button>}
              {registration.liveStatus === "IN_GAME" && !registration.checkedInAt && <button type="button" disabled={action.isPending} onClick={() => api.adminCheckIn(registration.checkInToken).then(() => queryClient.invalidateQueries({ queryKey: ["admin", "devil", id] })).catch(error => showToast(error.message, "error"))}>Отметить участника</button>}
            </div>
          </article>;
        })}
      </div>
      {!players.length && <p className="devil-muted">Участники пока не зарегистрированы.</p>}
      {!eliminated.length && players.length > 0 && <p className="devil-muted">После выбытия у игрока здесь появится кнопка платного re-entry.</p>}
    </section>

    <details className="devil-advanced">
      <summary><span>Дополнительные механики</span><ChevronDown /></summary>
      <div className="devil-advanced-content">
        <form className="devil-panel" onSubmit={event => { event.preventDefault(); run("sixes", { registrationId: player, handId: handId.trim(), kind, levelIndex: data.blindLevelIndex, showdownConfirmed: confirmed, wonHand: confirmed, pocketSixesConfirmed: confirmed }); }}>
          <h2>Бонус за шестёрки</h2>
          <label>Игрок<select required aria-label="Игрок для бонуса" value={player} onChange={event => setPlayer(event.target.value)}><option value="">Выберите игрока</option>{active.map(registration => <option key={registration.id} value={registration.id}>{playerName(registration)}</option>)}</select></label>
          <label>Комбинация<select aria-label="Комбинация" value={kind} onChange={event => setKind(event.target.value)}><option value="POCKET_SIXES">Карманные 66 · +{data.rules.devilsSixes.pocketSixesBonusBB} BB</option><option value="DEVILS_666">Сет шестёрок · +{data.rules.devilsSixes.setOfSixesBonusBB} BB</option></select></label>
          <label>Номер раздачи<input required maxLength={100} aria-label="Номер раздачи" placeholder="Например: стол-2-раздача-17" value={handId} onChange={event => setHandId(event.target.value)} /></label>
          <label className="devil-checkbox"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Подтверждаю выигрыш и комбинацию</label>
          <button className="app-button-primary" disabled={action.isPending || !data.mechanicsOpen || !confirmed}>Начислить бонус</button>
        </form>

        <form className="devil-panel" onSubmit={event => { event.preventDefault(); run("reverse", { eventId: reversal, reason, ...(correctedKind ? { correctedKind } : {}) }); }}>
          <h2>Исправить начисление</h2>
          <label>Операция<select required aria-label="Операция для исправления" value={reversal} onChange={event => setReversal(event.target.value)}><option value="">Выберите начисление</option>{reversible.map(event => <option key={event.id} value={event.id}>{players.find(registration => registration.userId === event.userId) ? playerName(players.find(registration => registration.userId === event.userId)!) : event.userId} · {event.chips ? `${event.chips} фишек` : `${event.ratingPoints} очков`} · {formatBarnaulDateTime(event.createdAt)}</option>)}</select></label>
          <label>Корректный результат<select aria-label="Корректный результат" value={correctedKind} onChange={event => setCorrectedKind(event.target.value)}><option value="">Полностью отменить</option><option value="POCKET_SIXES">Заменить на карманные 66</option><option value="DEVILS_666">Заменить на сет шестёрок</option></select></label>
          <label>Причина<textarea required minLength={5} maxLength={500} aria-label="Причина исправления" value={reason} onChange={event => setReason(event.target.value)} /></label>
          <button className="app-button-primary" disabled={action.isPending || !reversal}>Записать исправление</button>
        </form>

        <section className="devil-panel">
          <h2>Журнал событий</h2>
          <label>Фильтр по игроку<select value={filterUser} onChange={event => setFilterUser(event.target.value)}><option value="">Все события</option>{players.map(registration => <option key={registration.id} value={registration.userId}>{playerName(registration)}</option>)}</select></label>
          <GameHistory events={data.events.filter(event => !filterUser || event.userId === filterUser)} />
        </section>
      </div>
    </details>
  </section>;
}
