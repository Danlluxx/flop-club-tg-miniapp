import { CalendarClock, MapPin, UserRound, WalletCards } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Link } from "react-router-dom";
import type { Tournament } from "../types";
import { StatusBadge } from "./StatusBadge";
import { tournamentEventImage } from "../lib/tournamentAssets";

const money = new Intl.NumberFormat("ru-RU");

export function TournamentCard({ tournament }: { tournament: Tournament }) {
  const registered = tournament._count.registrations;
  const activeSeats = tournament.activeSeatsCount ?? registered;
  const fill = Math.min(100, Math.round((registered / tournament.maxParticipants) * 100));
  const isFull = activeSeats >= tournament.maxParticipants;
  const reEntryLabel = tournament.profile === "FREEZE" ? "Без re-entry" : `Re-entry ${money.format(tournament.reEntry)} ₽`;

  return (
    <Link to={`/tournaments/${tournament.id}`} className="tournament-poster tap block rounded-[2.1rem]">
      <img className="tournament-art" src={tournamentEventImage(tournament.title)} alt="" />
      <div className="relative z-10 flex min-h-[310px] flex-col justify-between p-6">
        <div className="max-w-[78%]">
          <div className="mb-4 flex items-center gap-2">
            <StatusBadge status={tournament.status} />
          </div>
          <h3 className="brand-display tournament-title text-white">{tournament.title}</h3>
        </div>

        <div className="tournament-meta-block">
          <div className="flex flex-wrap gap-2">
            <span className="tournament-pill">
              <UserRound className="h-4 w-4" />
              {isFull ? "Sold out" : `${registered}/${tournament.maxParticipants} мест`}
            </span>
            <span className="tournament-pill">
              <CalendarClock className="h-4 w-4" />
              {format(new Date(tournament.startsAt), "dd.MM / HH:mm", { locale: ru })}
            </span>
          </div>

          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-electric via-rose-400 to-violet" style={{ width: `${fill}%` }} />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-white/10 pt-4 text-sm font-bold text-slate-300">
            <span className="flex items-center gap-1.5"><WalletCards className="h-3.5 w-3.5 text-electric" />Вход {money.format(tournament.buyIn)} ₽</span>
            <span className="flex items-center gap-1.5"><WalletCards className="h-3.5 w-3.5 text-violet" />{reEntryLabel}</span>
            <span className="col-span-2 flex items-center gap-1.5 truncate"><MapPin className="h-3.5 w-3.5 shrink-0 text-violet" />{tournament.location}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
