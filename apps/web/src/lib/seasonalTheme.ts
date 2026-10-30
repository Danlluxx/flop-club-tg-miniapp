const halloweenStart = "2026-10-27";
const halloweenEnd = "2026-10-31";

function barnaulDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Barnaul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function isHalloweenSeason(date = new Date()) {
  const key = barnaulDateKey(date);
  return key >= halloweenStart && key <= halloweenEnd;
}
