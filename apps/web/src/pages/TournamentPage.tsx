import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Armchair, ArrowLeft, CalendarDays, MapPin, Users, WalletCards } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { haptic } from "../lib/telegram";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { CheckInQr } from "../components/CheckInQr";
import { tournamentEventImage } from "../lib/tournamentAssets";
import { tournamentLegalNote, tournamentPriceFeatures, tournamentRuleFor } from "../lib/tournamentRules";

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
  const rule = tournamentRuleFor(data.title);
  const priceFeatures = tournamentPriceFeatures(data);
  const reEntryLabel = data.profile === "FREEZE" || data.reEntry === 0 ? "Без re-entry" : `${money.format(data.reEntry)} ₽`;

  return (
    <section className="space-y-5">
      <Link to="/tournaments" className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-slate-300">
        <ArrowLeft className="h-5 w-5" />
      </Link>

      <div className="tournament-detail-hero">
        <img className="tournament-detail-art" src={tournamentEventImage(data.title)} alt="" />
        <div className="relative z-10 p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="page-kicker">Flop Club</p>
            <StatusBadge status={data.status} />
          </div>
          <h1 className="brand-display tournament-detail-title mt-5 text-white">{rule.title}</h1>

          <div className="mt-6 space-y-3 text-sm font-semibold text-slate-300">
            <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-electric" />{format(new Date(data.startsAt), "d MMMM yyyy, HH:mm", { locale: ru })}</div>
            <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-rose-400" />{data.location}</div>
            <div className="flex items-center gap-2"><Users className="h-4 w-4 text-violet" />{data._count.registrations} из {data.maxParticipants} участников</div>
            {data.myRegistration?.tableNumber && data.myRegistration?.seatNumber && (
              <div className="flex items-center gap-2 font-bold text-white">
                <Armchair className="h-4 w-4 text-electric" />
                Ваше место: стол {data.myRegistration.tableNumber}, бокс {data.myRegistration.seatNumber}
              </div>
            )}
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

      <div className="tournament-rule-stack">
        <section className="tournament-rule-section">
          <h2>Где проходит турнир?</h2>
          <p className="rule-location"><MapPin className="h-5 w-5 shrink-0" />Flop Club, Барнаул, ул. Геблера 33Б</p>
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
