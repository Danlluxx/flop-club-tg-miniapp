import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { ru } from "date-fns/locale";
import { ArrowRight, CalendarClock, ChevronRight, HelpCircle, MapPin, Spade } from "lucide-react";
import { Link } from "react-router-dom";
import { RatingBoard } from "../components/RatingBoard";
import { api } from "../lib/api";
import { startOfBarnaulDayIso } from "../lib/barnaulDate";
import { getPlayerStatus, getStatusProgress } from "../lib/playerStatuses";
import { tournamentEventImage } from "../lib/tournamentAssets";
import type { Tournament, User } from "../types";

const clubAddress = "г. Барнаул, ул. Геблера 33 б";
const yandexMapsUrl = "https://yandex.ru/maps/?text=%D0%B3.%20%D0%91%D0%B0%D1%80%D0%BD%D0%B0%D1%83%D0%BB%2C%20%D1%83%D0%BB.%20%D0%93%D0%B5%D0%B1%D0%BB%D0%B5%D1%80%D0%B0%2033%20%D0%B1";

function displayName(user: User) {
  return user.displayName || user.username || [user.firstName, user.lastName].filter(Boolean).join(" ") || "Игрок Flop Club";
}

function initials(user: User) {
  return displayName(user).slice(0, 1).toUpperCase();
}

function nextTournamentQuery() {
  const now = new Date();
  const from = startOfBarnaulDayIso(now);
  const params = new URLSearchParams();
  params.set("from", from);
  params.set("to", addDays(new Date(from), 7).toISOString());
  params.set("status", "OPEN");
  return `?${params.toString()}`;
}

function UpcomingTournament({ tournament }: { tournament?: Tournament }) {
  if (!tournament) {
    return (
      <div className="home-event-card grid min-h-[13.5rem] place-items-center rounded-[1.8rem] p-6 text-center">
        <div>
          <p className="text-xl font-black">Ближайший турнир скоро появится</p>
          <Link to="/tournaments" className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-black text-black">
            Открыть афишу <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <Link to={`/tournaments/${tournament.id}`} className="home-event-card tap block rounded-[1.5rem] p-4">
      <img className="home-event-art" src={tournamentEventImage(tournament.title)} alt="" />
      <div className="relative z-10 flex min-h-[13.5rem] max-w-[72%] flex-col">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.34em] text-electric">Next tournament</p>
          <h2 className="brand-display mt-2 text-[2rem] text-white">{tournament.title}</h2>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <span className="home-pill">
            <CalendarClock className="h-4 w-4" />
            {format(new Date(tournament.startsAt), "d MMMM", { locale: ru })}
          </span>
          <span className="home-pill">{format(new Date(tournament.startsAt), "HH:mm", { locale: ru })}</span>
        </div>
        <div className="mt-5 inline-flex w-fit items-center gap-2 rounded-full bg-white px-5 py-2.5 text-base font-black text-black">
          Записаться <ArrowRight className="h-4 w-4 rounded-full bg-black p-1 text-white" />
        </div>
      </div>
    </Link>
  );
}

export function HomePage({ user }: { user: User }) {
  const query = useMemo(nextTournamentQuery, []);
  const { data } = useQuery({ queryKey: ["home", "nextTournament", query], queryFn: () => api.tournaments(query) });
  const nextTournament = data?.[0];
  const name = displayName(user);
  const ratingPoints = user.ratingPoints ?? 0;
  const currentStatus = getPlayerStatus(ratingPoints);
  const statusProgress = getStatusProgress(ratingPoints);

  return (
    <section className="space-y-6">
      <Link to="/statuses" className="home-profile tap">
        <div className="home-avatar-wrap">
          {user.photoUrl ? (
            <img className="home-avatar" src={user.photoUrl} alt="" />
          ) : (
            <div className="home-avatar bg-gradient-to-br from-electric to-violet">{initials(user)}</div>
          )}
          <img className="home-status-badge" src={currentStatus.icon} alt="" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-black text-white">{name}</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-rose-500 to-amber-300" style={{ width: `${statusProgress}%` }} />
          </div>
          <div className="mt-2 inline-flex rounded-r-full bg-gradient-to-r from-rose-500 to-amber-300 px-6 py-1 text-xs font-black uppercase text-black">
            {currentStatus.title}
          </div>
        </div>
      </Link>

      <UpcomingTournament tournament={nextTournament} />

      <RatingBoard user={user} />

      <div className="grid grid-cols-2 gap-3">
        <Link to="/support" className="home-action tap">
          <HelpCircle className="home-action-icon h-9 w-9" />
          <span className="home-action-label">
            <span>Поддержка</span>
            <ChevronRight className="h-6 w-6" />
          </span>
        </Link>
        <Link to="/club" className="home-action tap">
          <Spade className="home-action-icon h-9 w-9 fill-white" />
          <span className="home-action-label">
            <span>О клубе</span>
            <ChevronRight className="h-6 w-6" />
          </span>
        </Link>
      </div>

      <a href={yandexMapsUrl} target="_blank" rel="noreferrer" className="home-address tap">
        <div className="flex items-center gap-3 text-2xl font-black">
          <MapPin className="h-9 w-9" />
          Адрес
        </div>
        <p className="mt-5 text-lg font-bold leading-snug text-slate-400">{clubAddress}</p>
      </a>
    </section>
  );
}
