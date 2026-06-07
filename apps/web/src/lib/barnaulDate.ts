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

export function barnaulDateKey(value: string | Date = new Date()) {
  return toBarnaulDateTimeInput(value).slice(0, 10);
}

export function startOfBarnaulDayIso(value: string | Date = new Date()) {
  return new Date(`${barnaulDateKey(value)}T00:00:00+07:00`).toISOString();
}

export function endOfBarnaulDayIso(value: string | Date = new Date()) {
  return new Date(`${barnaulDateKey(value)}T23:59:59.999+07:00`).toISOString();
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
