const timeZone = "Asia/Barnaul";

function partMap(date: Date) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
}

export function toBarnaulDateTimeInput(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = partMap(date);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function barnaulDateTimeInputToIso(value: string) {
  return new Date(`${value}:00+07:00`).toISOString();
}

export function formatBarnaulDateTime(value: string | Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(value instanceof Date ? value : new Date(value));
}
