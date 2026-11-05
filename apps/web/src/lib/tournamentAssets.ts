const tournamentSlugs: Record<string, string> = {
  "FLOP GRAND OPENING": "flop-grand-final",
  "FLOP GRAND OPENNING": "flop-grand-final",
  "Flop Butterfly": "flop-butterfly",
  "Flop Bounty": "flop-bounty",
  "Flop Grand Final": "flop-grand-final",
  "Flop One Shot": "flop-one-shot",
  "Flop Phoenix": "flop-phoenix",
  "Flop Last Call": "flop-last-call",
  "Flop Old Fashion": "flop-old-fashion",
  "Flop Freeze Out": "flop-freeze-out",
  "Flop Classic": "flop-classic",
  "Flop Deep Stack": "flop-deep-stack",
  "Flop Mystery Knockout": "flop-mystery-knockout",
  "Flop Secret Final": "flop-secret-final",
  "Flop Chip Leader": "flop-chip-leader",
  "Flop Rampage": "flop-rampage",
  "Flop Prime Event": "flop-prime-event",
  "Flop Black Edition": "flop-black-edition",
  "FLOP 3 MINUS 1": "flop-3-minus-1",
  "FLOP BOOSTER RE-ENTRY": "flop-booster-re-entry",
  "FLOP BOMB POT": "flop-bomb-pot",
  "FLOP DEVIL DEAL": "flop-devil-deal"
};

const tournamentDisplayTitles: Record<string, string> = {
  "FLOP 3 MINUS 1": "Flop 3 Minus 1",
  "FLOP BOOSTER RE-ENTRY": "Flop Booster Re-Entry",
  "FLOP BOMB POT": "Flop Bomb Pot",
  "FLOP DEVIL DEAL": "Flop Devil Deal"
};

const awardAssetVersion = "20261105-webp";

export function tournamentSlug(title: string) {
  return tournamentSlugs[title] ?? title.toLowerCase().replace(/\s+/g, "-");
}

export function tournamentDisplayTitle(title: string) {
  return tournamentDisplayTitles[title] ?? title;
}

export function tournamentEventImage(title: string) {
  return `/awards/color/${tournamentSlug(title)}.webp?v=${awardAssetVersion}`;
}

export function awardImage(title: string, unlocked: boolean) {
  if (title === "FLOP DEVIL DEAL") return "/awards/color/flop-devil-deal.webp";
  return `/awards/${unlocked ? "color" : "bw"}/${tournamentSlug(title)}.webp?v=${awardAssetVersion}`;
}
