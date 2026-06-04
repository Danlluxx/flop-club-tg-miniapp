const tournamentSlugs: Record<string, string> = {
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
  "Flop Black Edition": "flop-black-edition"
};

export function tournamentSlug(title: string) {
  return tournamentSlugs[title] ?? title.toLowerCase().replace(/\s+/g, "-");
}

export function tournamentEventImage(title: string) {
  return `/events/${tournamentSlug(title)}.jpg`;
}

export function awardImage(title: string, unlocked: boolean) {
  return `/awards/${unlocked ? "color" : "bw"}/${tournamentSlug(title)}.png`;
}
