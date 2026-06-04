import { ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { awardImage } from "../lib/tournamentAssets";
import type { ClubAward } from "../types";

function AwardTile({ award }: { award: ClubAward }) {
  return (
    <div className={award.unlocked ? "awards-page-tile awards-page-tile-open" : "awards-page-tile"} title={award.title}>
      <img src={awardImage(award.title, award.unlocked)} alt={award.title} />
    </div>
  );
}

export function AwardsPage() {
  const { data: awards = [] } = useQuery({ queryKey: ["me", "awards"], queryFn: api.myAwards });
  const unlockedCount = awards.filter((award) => award.unlocked).length;

  return (
    <section className="awards-page space-y-6">
      <div className="screen-topbar">
        <Link to="/profile" className="screen-back tap" aria-label="Назад">
          <ArrowLeft className="h-5 w-5" />
        </Link>
      </div>

      <div className="awards-page-grid">
        {awards.map((award) => <AwardTile key={award.title} award={award} />)}
      </div>

      <div className="awards-counter">
        {unlockedCount} / {awards.length}
      </div>
    </section>
  );
}
