import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useToast } from "../../components/Toast";
import type { TournamentStatus } from "../../types";

type FormState = {
  title: string;
  description: string;
  startsAt: string;
  location: string;
  buyIn: string;
  reEntry: string;
  prizePool: string;
  ratingPool: string;
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
  reEntry: "1000",
  prizePool: "200000",
  ratingPool: "10000",
  maxParticipants: "50",
  status: "OPEN",
  allowCancellation: true
};

export function TournamentForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [form, setForm] = useState(initial);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { data } = useQuery({ queryKey: ["tournament", id], queryFn: () => api.tournament(id!), enabled: isEdit });

  useEffect(() => {
    if (!data) return;
    setForm({
      title: data.title,
      description: data.description,
      startsAt: data.startsAt.slice(0, 16),
      location: data.location,
      buyIn: String(data.buyIn),
      reEntry: String(data.reEntry),
      prizePool: String(data.prizePool),
      ratingPool: String(data.ratingPool),
      maxParticipants: String(data.maxParticipants),
      status: data.status,
      allowCancellation: data.allowCancellation
    });
  }, [data]);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        startsAt: new Date(form.startsAt).toISOString(),
        buyIn: Number(form.buyIn),
        reEntry: Number(form.reEntry),
        prizePool: Number(form.prizePool),
        ratingPool: Number(form.ratingPool),
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

  const fieldClass = "w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-white outline-none focus:border-electric";

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <p className="page-kicker">Flop Club</p>
        <h2 className="page-title mt-3">{isEdit ? "Редактировать" : "Новый"}</h2>
        <p className="page-subtitle mt-4">Настройки турнира и регистрации.</p>
      </div>
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
        Разрешить отмену записи
        <input type="checkbox" checked={form.allowCancellation} onChange={(e) => setForm({ ...form, allowCancellation: e.target.checked })} />
      </label>
      <button className="app-button-primary tap w-full" disabled={save.isPending}>
        Сохранить
      </button>
    </form>
  );
}
