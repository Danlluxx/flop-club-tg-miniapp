import { ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type LeaderboardParams } from "../lib/api";
import { RatingIcon } from "./RatingIcon";
import type { RatingLeaderboardEntry, User } from "../types";

function userName(user: User) {
  return user.displayName || user.username || [user.firstName, user.lastName].filter(Boolean).join(" ") || "Игрок";
}

function RankMedal({ rank, tier }: { rank: number | string; tier: "gold" | "silver" | "bronze" | "player" }) {
  return (
    <div className={`rank-medal rank-medal-${tier}`}>
      {rank}
    </div>
  );
}

function Avatar({ src, fallback }: { src?: string | null; fallback: string }) {
  if (src) return <img className="rank-avatar" src={src} alt="" />;
  return <div className="rank-avatar bg-gradient-to-br from-electric to-violet">{fallback.slice(0, 1).toUpperCase()}</div>;
}

function tierForRank(rank: number): "gold" | "silver" | "bronze" | "player" {
  if (rank === 1) return "gold";
  if (rank === 2) return "silver";
  if (rank === 3) return "bronze";
  return "player";
}

function Row({ player, tier }: { player: RatingLeaderboardEntry; tier: "gold" | "silver" | "bronze" | "player" }) {
  const nickname = userName(player);

  return (
    <div className={`rank-row rank-row-${tier}`}>
      <RankMedal rank={player.rank} tier={tier} />
      <div className="flex min-w-0 items-center gap-3">
        <Avatar src={player.photoUrl} fallback={nickname} />
        <span className={`truncate text-base font-black ${tier === "player" ? "text-amber-200" : ""}`}>{nickname}</span>
      </div>
      <span className="rating-number text-center text-base">{player.knockouts ?? 0}</span>
      <span className="rating-number flex items-center justify-end gap-1 text-base">
        {(player.ratingPoints ?? 0).toLocaleString("ru-RU")}
        <RatingIcon className="h-5 w-5" />
      </span>
    </div>
  );
}

type RatingBoardProps = {
  user: User;
  compact?: boolean;
  showTitle?: boolean;
  leaderboardParams?: LeaderboardParams;
};

export function RatingBoard({ user, compact = false, showTitle = true, leaderboardParams }: RatingBoardProps) {
  const params = leaderboardParams ?? { limit: compact ? 50 : 3, scope: "global" as const };
  const { data, isLoading } = useQuery({ queryKey: ["rating", "leaderboard", params], queryFn: () => api.leaderboard(params) });
  const leaders = data?.leaders ?? [];
  const currentUserRank = data?.currentUserRank;
  const currentUserInList = leaders.some((player) => player.id === user.id);
  const me: RatingLeaderboardEntry = {
    ...user,
    rank: currentUserRank ?? "—",
    ratingPoints: user.ratingPoints ?? 0,
    knockouts: user.knockouts ?? 0
  };

  return (
    <section className="space-y-3">
      {showTitle && (
        <Link to="/rating" className="rating-section-title tap flex items-center gap-2 text-2xl text-white">
          Рейтинг <ChevronRight className="h-5 w-5" />
        </Link>
      )}

      <div className="rank-header">
        <span className="pl-2 text-xl">▥</span>
        <span>Никнейм</span>
        <span className="text-center">Нокауты</span>
        <span className="text-right">Рейтинг</span>
      </div>

      <div className="space-y-3">
        {isLoading && [1, 2, 3].map((item) => <div key={item} className="h-[4.75rem] animate-pulse rounded-[1.35rem] bg-white/8" />)}
        {!isLoading && leaders.map((player) => (
          <Row key={player.id} player={player} tier={typeof player.rank === "number" ? tierForRank(player.rank) : "player"} />
        ))}
        {!isLoading && leaders.length === 0 && (
          <div className="app-panel px-4 py-6 text-center text-sm font-bold text-slate-400">Рейтинг появится после первых завершённых турниров.</div>
        )}
      </div>

      {!compact && (
        <div className="flex justify-center gap-1 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
          <span className="h-1.5 w-5 rounded-full bg-white" />
        </div>
      )}

      {!currentUserInList && <Row player={me} tier="player" />}
    </section>
  );
}
