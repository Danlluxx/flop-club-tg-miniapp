import { ArrowLeft, ChevronsUp } from "lucide-react";
import { Link } from "react-router-dom";
import { RatingIcon } from "../components/RatingIcon";
import { getPlayerStatus, getStatusProgress, playerStatuses } from "../lib/playerStatuses";
import type { User } from "../types";

const numberFormatter = new Intl.NumberFormat("ru-RU");

function displayName(user: User) {
  return user.displayName || user.username || [user.firstName, user.lastName].filter(Boolean).join(" ") || "Игрок Flop Club";
}

function avatarFallback(user: User) {
  return displayName(user).slice(0, 1).toUpperCase();
}

export function StatusesPage({ user }: { user: User }) {
  const points = user.ratingPoints ?? 0;
  const currentStatus = getPlayerStatus(points);
  const progress = getStatusProgress(points);
  const name = displayName(user);

  return (
    <section className="statuses-page space-y-5">
      <div className="screen-topbar">
        <Link to="/" className="screen-back tap" aria-label="Назад">
          <ArrowLeft className="h-5 w-5" />
        </Link>
      </div>

      <h1 className="screen-title">Статусы</h1>

      <div className="status-user">
        {user.photoUrl ? (
          <img className="status-avatar" src={user.photoUrl} alt="" />
        ) : (
          <div className="status-avatar bg-gradient-to-br from-electric to-violet">{avatarFallback(user)}</div>
        )}
        <p className="truncate text-2xl font-black text-white">{name}</p>
      </div>

      <div className="status-progress">
        <div className="status-progress-glow" style={{ left: `${progress}%` }} />
        <div className="status-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="status-rating-line">
        Рейтинг:
        <RatingIcon className="h-6 w-6" />
        <span>{numberFormatter.format(points)}</span>
      </div>

      <div className="status-list">
        {playerStatuses.map((status) => {
          const isCurrent = status.title === currentStatus.title;
          const isLocked = points < status.pointsFrom;

          return (
            <div key={status.title} className={isCurrent ? "status-card status-card-current" : "status-card"}>
              <div className="flex min-w-0 items-center gap-3">
                <img className={isLocked ? "status-icon status-icon-locked" : "status-icon"} src={status.icon} alt="" />
                <span className="truncate text-lg font-black uppercase text-white">{status.title}</span>
              </div>
              <div className="rating-number flex shrink-0 items-center gap-1.5 text-lg text-slate-500">
                <RatingIcon className="h-5 w-5 opacity-60" />
                {numberFormatter.format(status.pointsFrom)}
                <ChevronsUp className="h-5 w-5" />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
