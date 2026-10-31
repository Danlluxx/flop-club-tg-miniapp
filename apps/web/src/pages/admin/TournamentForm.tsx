import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useToast } from "../../components/Toast";
import type { TournamentStatus } from "../../types";
import { barnaulDateTimeInputToIso, toBarnaulDateTimeInput } from "../../lib/barnaulDate";

type FormState = {
  title: string;
  description: string;
  startsAt: string;
  location: string;
  buyIn: string;
  reEntry: string;
  prizePool: string;
  ratingPool: string;
  addOnEnabled: boolean;
  addOnPrice: string;
  addOnChips: string;
  maxParticipants: string;
  status: TournamentStatus;
  allowCancellation: boolean;
};

const initial: FormState = {
  title: "",
  description: "",
  startsAt: "",
  location: "Flop Club, Барнаул",
  buyIn: "500",
  reEntry: "500",
  prizePool: "200000",
  ratingPool: "10000",
  addOnEnabled: false,
  addOnPrice: "0",
  addOnChips: "0",
  maxParticipants: "50",
  status: "OPEN",
  allowCancellation: true
};

export function TournamentForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [form, setForm] = useState(initial);
  const [mechanicsText, setMechanicsText] = useState("");
  const template = useQuery({ queryKey: ["mechanics-template"], queryFn: api.mechanicsTemplate });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { data } = useQuery({ queryKey: ["tournament", id], queryFn: () => api.tournament(id!), enabled: isEdit });

  useEffect(() => {
    if (!data) return;
    setMechanicsText(data.mechanics ? JSON.stringify(data.mechanics, null, 2) : "");
    setForm({
      title: data.title,
      description: data.description,
      startsAt: toBarnaulDateTimeInput(data.startsAt),
      location: data.location,
      buyIn: String(data.buyIn),
      reEntry: String(data.reEntry),
      prizePool: String(data.prizePool),
      ratingPool: String(data.ratingPool),
      addOnEnabled: data.addOnEnabled,
      addOnPrice: String(data.addOnPrice),
      addOnChips: String(data.addOnChips),
      maxParticipants: String(data.maxParticipants),
      status: data.status,
      allowCancellation: data.allowCancellation
    });
  }, [data]);

  const save = useMutation({
    mutationFn: () => {
      const mechanics = mechanicsText.trim() ? JSON.parse(mechanicsText) : undefined;
      if (data?.mechanics && !mechanics) throw new Error("Механики активного формата нельзя удалить");
      const changed = JSON.stringify(mechanics) !== JSON.stringify(data?.mechanics);
      const payload = {
        ...form,
        ...((!isEdit || changed) && mechanics ? { mechanics } : {}),
        startsAt: barnaulDateTimeInputToIso(form.startsAt),
        buyIn: Number(form.buyIn),
        reEntry: Number(form.reEntry),
        prizePool: Number(form.prizePool),
        ratingPool: Number(form.ratingPool),
        addOnPrice: Number(form.addOnPrice),
        addOnChips: Number(form.addOnChips),
        maxParticipants: Number(form.maxParticipants)
      };
      return isEdit ? api.updateTournament(id!, payload) : api.createTournament(payload);
    },
    onSuccess: async () => {
      showToast(isEdit ? "Турнир обновлён" : "Турнир создан");
      await queryClient.invalidateQueries({ queryKey: ["admin", "tournaments"] });
      navigate("/admin/tournaments");
    },
    onError: (error) => showToast(error.message, "error")
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  const fieldClass = "w-full rounded-[0.75rem] border border-white/10 bg-white/5 px-3 py-3 text-white outline-none focus:border-electric";

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <p className="page-kicker">Flop Club</p>
        <h2 className="page-title mt-3">{isEdit ? "Редактировать" : "Новый"}</h2>
        <p className="page-subtitle mt-4">Настройки турнира и регистрации.</p>
      </div>
      <label className="app-panel grid gap-3 p-4 text-sm">Специальный формат
        <select className={fieldClass} aria-label="Специальный формат" value={mechanicsText ? "devil" : "regular"} onChange={e => {
          if (e.target.value === "regular") { if (!data?.mechanics) setMechanicsText(""); return; }
          if (template.data) {
            setMechanicsText(JSON.stringify(template.data, null, 2));
            setForm({ ...form, title: "FLOP DEVIL DEAL", description: "HALLOWEEN SPECIAL · Сделка с дьяволом, шестёрки и Bounty", startsAt: "2026-10-31T18:00", buyIn: "500", reEntry: "500", prizePool: "0", ratingPool: "15000", addOnEnabled: true, addOnPrice: "1000", addOnChips: "100000" });
          }
        }}><option value="regular">Обычный турнир</option><option value="devil" disabled={!template.data}>FLOP DEVIL DEAL</option></select>
      </label>
      {mechanicsText && <label className="app-panel grid gap-3 p-4 text-sm">Правила специальных механик (JSON)
        <textarea className={fieldClass} aria-label="Правила специальных механик" rows={12} value={mechanicsText} onChange={e => setMechanicsText(e.target.value)}/>
        <span className="text-xs text-slate-400">Для другого события измените дату старта и registrationClosesAt. После регистрации участников правила и время фиксируются. Сервер проверяет конфигурацию.</span>
      </label>}
      <input className={fieldClass} placeholder="Название" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <textarea className={fieldClass} placeholder="Описание" rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <input className={fieldClass} type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
      <input className={fieldClass} placeholder="Место" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
      <div className="grid grid-cols-2 gap-3">
        <input className={fieldClass} type="number" placeholder="Вход" value={form.buyIn} onChange={(e) => setForm({ ...form, buyIn: e.target.value })} />
        <input className={fieldClass} type="number" placeholder="Re-entry" value={form.reEntry} onChange={(e) => setForm({ ...form, reEntry: e.target.value })} />
        <input className={fieldClass} type="number" placeholder="Гарантия" value={form.prizePool} onChange={(e) => setForm({ ...form, prizePool: e.target.value })} />
        <input className={fieldClass} type="number" placeholder="Рейтинг-пул" value={form.ratingPool} onChange={(e) => setForm({ ...form, ratingPool: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input className={fieldClass} type="number" min={1} max={50} placeholder="Лимит до 50" value={form.maxParticipants} onChange={(e) => setForm({ ...form, maxParticipants: e.target.value })} />
        <select className={fieldClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as TournamentStatus })}>
          <option value="OPEN">Открыт</option>
          <option value="CLOSED">Закрыт</option>
          <option value="CANCELLED">Отменён</option>
          <option value="FINISHED">Завершён</option>
        </select>
      </div>
      <label className="app-panel flex items-center justify-between p-4 text-sm">
        Add-on после поздней регистрации
        <input
          type="checkbox"
          checked={form.addOnEnabled}
          onChange={(e) => setForm({
            ...form,
            addOnEnabled: e.target.checked,
            addOnPrice: e.target.checked && form.addOnPrice === "0" ? "1000" : form.addOnPrice
          })}
        />
      </label>
      {form.addOnEnabled ? (
        <div className="grid grid-cols-2 gap-3">
          <input className={fieldClass} type="number" min={0} placeholder="Цена Add-on" value={form.addOnPrice} onChange={(e) => setForm({ ...form, addOnPrice: e.target.value })} />
          <input className={fieldClass} type="number" min={0} placeholder="Фишки Add-on" value={form.addOnChips} onChange={(e) => setForm({ ...form, addOnChips: e.target.value })} />
        </div>
      ) : null}
      <label className="app-panel flex items-center justify-between p-4 text-sm">
        Разрешить отмену записи
        <input type="checkbox" checked={form.allowCancellation} onChange={(e) => setForm({ ...form, allowCancellation: e.target.checked })} />
      </label>
      <button className="app-button-primary tap w-full" disabled={save.isPending}>
        Сохранить
      </button>
    </form>
  );
}
