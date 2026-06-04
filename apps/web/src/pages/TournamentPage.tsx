import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Armchair, ArrowLeft, CalendarDays, MapPin, Users } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { haptic } from "../lib/telegram";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";

const money = new Intl.NumberFormat("ru-RU");

export function TournamentPage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { data, isLoading, isError } = useQuery({ queryKey: ["tournament", id], queryFn: () => api.tournament(id), enabled: Boolean(id) });

  const register = useMutation({
    mutationFn: () => api.register(id),
    onSuccess: async () => {
      haptic("success");
      showToast("Вы записаны на турнир");
      await queryClient.invalidateQueries({ queryKey: ["tournament", id] });
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
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (error) => showToast(error.message, "error")
  });

  if (isLoading) return <div className="app-panel p-6">Загрузка турнира...</div>;
  if (isError || !data) return <div className="app-panel p-6 text-rose-200">Турнир не найден.</div>;

  const isRegistered = Boolean(data.myRegistration);
  const isFull = data._count.registrations >= data.maxParticipants;
  const canRegister = data.status === "OPEN" && !isFull;

  return (
    <section className="space-y-5">
      <Link to="/tournaments" className="inline-flex items-center gap-2 text-sm font-bold text-slate-300"><ArrowLeft className="h-4 w-4" />Назад</Link>
      <div className="app-panel p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="page-kicker">Flop Club</p>
            <h2 className="brand-display mt-3 text-[3.25rem] text-white">{data.title}</h2>
          </div>
          <StatusBadge status={data.status} />
        </div>
        <p className="mt-4 text-lg font-bold leading-relaxed text-slate-300">{data.description}</p>

        <div className="mt-5 space-y-3 text-sm text-slate-300">
          <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-electric" />{format(new Date(data.startsAt), "d MMMM yyyy, HH:mm", { locale: ru })}</div>
          <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-emerald" />{data.location}</div>
          <div className="flex items-center gap-2"><Users className="h-4 w-4 text-violet" />{data._count.registrations} из {data.maxParticipants} участников</div>
          {data.myRegistration?.tableNumber && data.myRegistration?.seatNumber && (
            <div className="flex items-center gap-2 font-bold text-white">
              <Armchair className="h-4 w-4 text-electric" />
              Ваше место: стол {data.myRegistration.tableNumber}, бокс {data.myRegistration.seatNumber}
            </div>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/5 p-3">
            <p className="text-xs text-slate-400">Вход</p>
            <p className="mt-1 font-black">{money.format(data.buyIn)} ₽</p>
          </div>
          <div className="rounded-2xl bg-white/5 p-3">
            <p className="text-xs text-slate-400">Re-entry</p>
            <p className="mt-1 font-black">{money.format(data.reEntry)} ₽</p>
          </div>
        </div>
      </div>

      {isRegistered ? (
        <button onClick={() => cancel.mutate()} disabled={cancel.isPending} className="tap w-full rounded-full border border-rose-400/40 bg-rose-400/15 px-5 py-4 font-black text-rose-100">
          Отменить запись
        </button>
      ) : (
        <button
          onClick={() => register.mutate()}
          disabled={!canRegister || register.isPending}
          className="app-button-primary tap w-full disabled:cursor-not-allowed disabled:opacity-45"
        >
          {isFull ? "Турнир заполнен" : data.status === "OPEN" ? "Записаться" : "Регистрация закрыта"}
        </button>
      )}
    </section>
  );
}
