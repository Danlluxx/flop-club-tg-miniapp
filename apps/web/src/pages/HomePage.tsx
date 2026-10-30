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
import { isHalloweenSeason } from "../lib/seasonalTheme";
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
      <div className="home-event-card grid min-h-[13.5rem] place-items-center rounded-[1rem] p-6 text-center">
        <div>
          <p className="text-xl font-black">Ближайший турнир скоро появится</p>
          <Link to="/tournaments" className="mt-5 inline-flex items-center gap-2 rounded-[0.75rem] bg-white px-6 py-3 font-black text-black">
            Открыть афишу <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <Link to={`/tournaments/${tournament.id}`} className="home-event-card tap block rounded-[1rem] p-4">
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
        <div className="mt-5 inline-flex w-fit items-center gap-2 rounded-[0.7rem] bg-white px-5 py-2.5 text-base font-black text-black">
          Записаться <ArrowRight className="h-4 w-4 rounded-[0.35rem] bg-black p-1 text-white" />
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
        {isHalloweenSeason() ? (
          <svg className="home-halloween-bats" viewBox="0 0 180 70" aria-hidden="true" focusable="false">
            <defs>
              <path id="seasonal-bat" d="M0 5 Q12 12 19 20 L21 12 L25 17 L29 12 L31 20 Q38 12 50 5 Q43 17 47 28 Q38 21 34 31 Q29 25 25 36 Q21 25 16 31 Q12 21 3 28 Q7 17 0 5Z" />
            </defs>
            <use href="#seasonal-bat" transform="translate(14 25) rotate(-18 25 20) scale(.7)" opacity=".45" />
            <use href="#seasonal-bat" transform="translate(73 2) rotate(12 25 20)" />
            <use href="#seasonal-bat" transform="translate(137 30) rotate(-10 25 20) scale(.5)" opacity=".6" />
          </svg>
        ) : null}
        <div className="home-avatar-wrap">
          {isHalloweenSeason() ? (
            <svg className="home-halloween-pumpkin" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
              <g id="seasonal-pumpkin">
              <path d="M24 12q-2-7 5-9" fill="none" stroke="#ad8551" strokeWidth="3" strokeLinecap="round" />
              <path d="M24 13C4 4 0 36 15 41q9 5 18 0C48 36 44 4 24 13Z" fill="#b54d1d" />
              <ellipse cx="24" cy="27" rx="11" ry="16" fill="#e27a32" />
              <path d="m12 22 9 4-8 3Zm24 0-9 4 8 3ZM24 27l-3 5h6ZM13 33l7 3 4-2 4 2 7-3-5 7H19Z" fill="#23120e" />
              </g>
            </svg>
          ) : null}
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
          <div className="mt-2 inline-flex rounded-r-[0.45rem] bg-gradient-to-r from-rose-500 to-amber-300 px-6 py-1 text-xs font-black uppercase text-black">
            {currentStatus.title}
          </div>
        </div>
      </Link>

      {isHalloweenSeason() ? (
        <svg className="home-halloween-web" viewBox="0 0 80 80" aria-hidden="true" focusable="false">
          <path d="M79 1H1m78 0v78M79 1 20 60M79 1 7 29M79 1 51 73M55 1q0 10 2 10t6 7 16 7M31 1q1 18 9 18t12 13 27 17M7 1q3 26 16 26t17 20 39 25" />
        </svg>
      ) : null}

      <UpcomingTournament tournament={nextTournament} />

      <div className="relative" style={isHalloweenSeason() ? { marginTop: 44 } : undefined}>
        {isHalloweenSeason() ? (
          <svg className="halloween-gap-pumpkin" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
            <use href="#seasonal-pumpkin" />
          </svg>
        ) : null}
        {isHalloweenSeason() ? (
          <svg className="halloween-gap-bats" viewBox="0 0 160 40" aria-hidden="true" focusable="false">
            <use href="#seasonal-bat" transform="translate(10 0) scale(.65)" />
            <use href="#seasonal-bat" transform="translate(65 8) rotate(-12 25 20) scale(.45)" opacity=".65" />
            <use href="#seasonal-bat" transform="translate(114 0) scale(.55)" opacity=".8" />
          </svg>
        ) : null}
        <RatingBoard user={user} />
      </div>

      <div className="relative grid grid-cols-2 gap-3" style={isHalloweenSeason() ? { marginTop: 44 } : undefined}>
        {isHalloweenSeason() ? (
          <svg className="halloween-gap-pumpkin halloween-gap-pumpkin-right" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
            <use href="#seasonal-pumpkin" />
          </svg>
        ) : null}
        {isHalloweenSeason() ? (
          <svg className="halloween-gap-bats halloween-gap-bats-left" viewBox="0 0 160 40" aria-hidden="true" focusable="false">
            <use href="#seasonal-bat" transform="translate(10 0) rotate(10 25 20) scale(.7)" />
            <use href="#seasonal-bat" transform="translate(80 8) scale(.45)" opacity=".6" />
          </svg>
        ) : null}
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

      <a href={yandexMapsUrl} target="_blank" rel="noreferrer" className="home-address tap relative">
        {isHalloweenSeason() ? (
          <svg className="halloween-address-web" viewBox="0 0 80 80" aria-hidden="true" focusable="false">
            <path d="M79 1H1m78 0v78M79 1 20 60M79 1 7 29M79 1 51 73M55 1q0 10 2 10t6 7 16 7M31 1q1 18 9 18t12 13 27 17M7 1q3 26 16 26t17 20 39 25" />
          </svg>
        ) : null}
        <div className="flex items-center gap-3 text-2xl font-black">
          <MapPin className="h-9 w-9" />
          Адрес
        </div>
        <p className="mt-5 text-lg font-bold leading-snug text-slate-400">{clubAddress}</p>
      </a>
    </section>
  );
}
