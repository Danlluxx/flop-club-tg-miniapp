export const NO_SHOW_PENALTY_POINTS = 100;
let schedulerStarted = false;

export async function applyNoShowPenalties() {
  return 0;
}

export function startNoShowPenaltyScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  console.log("[no-show:penalty] disabled");
}
