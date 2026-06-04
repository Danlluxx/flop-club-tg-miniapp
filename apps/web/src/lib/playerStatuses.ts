export type PlayerStatus = {
  title: string;
  pointsFrom: number;
  icon: string;
};

export const playerStatuses: PlayerStatus[] = [
  { title: "Salmon", pointsFrom: 0, icon: "/statuses/salmon.png" },
  { title: "Flop Beginner", pointsFrom: 3500, icon: "/statuses/flop-beginner.png" },
  { title: "Pot Hunter", pointsFrom: 10000, icon: "/statuses/pot-hunter.png" },
  { title: "Tom Dwan", pointsFrom: 15000, icon: "/statuses/tom-dwan.png" },
  { title: "Finalist", pointsFrom: 22000, icon: "/statuses/finalist.png" },
  { title: "Black Stack", pointsFrom: 40000, icon: "/statuses/black-stack.png" },
  { title: "Flopfather", pointsFrom: 70000, icon: "/statuses/flopfather.png" }
];

export function getPlayerStatus(points: number) {
  return playerStatuses.reduce((current, status) => (
    points >= status.pointsFrom ? status : current
  ), playerStatuses[0]);
}

export function getNextPlayerStatus(points: number) {
  return playerStatuses.find((status) => status.pointsFrom > points) ?? null;
}

export function getStatusProgress(points: number) {
  const current = getPlayerStatus(points);
  const next = getNextPlayerStatus(points);
  if (!next) return 100;

  const currentFloor = current.pointsFrom;
  const nextFloor = next.pointsFrom;
  return Math.max(4, Math.min(100, Math.round(((points - currentFloor) / (nextFloor - currentFloor)) * 100)));
}
