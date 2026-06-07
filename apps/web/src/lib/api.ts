import type {
  ClubAward,
  RatingLeaderboardResponse,
  Registration,
  Tournament,
  TournamentLiveState,
  TournamentRatingPayload,
  TournamentRatingResult,
  User
} from "../types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

type AuthPayload = { token: string; user: User };
export type LeaderboardParams = {
  limit?: number;
  scope?: "global" | "season";
  month?: string;
  search?: string;
};

export type AdminStats = {
  totalTournaments: number;
  activeTournaments: number;
  totalRegistrations: number;
  totalUsers: number;
  averageFillRate: number;
  dailyFillRates: Array<{
    date: string;
    tournaments: number;
    registrations: number;
    capacity: number;
    averageFillRate: number;
  }>;
};

let token = localStorage.getItem("flop.token");

export function setToken(nextToken: string) {
  token = nextToken;
  localStorage.setItem("flop.token", nextToken);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: "Ошибка запроса" }));
    throw new Error(payload.message ?? "Ошибка запроса");
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function download(path: string, filename: string) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: "Ошибка скачивания" }));
    throw new Error(payload.message ?? "Ошибка скачивания");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  authTelegram: (initData: string) =>
    request<AuthPayload>("/api/auth/telegram", { method: "POST", body: JSON.stringify({ initData }) }),
  tournaments: (query = "") => request<Tournament[]>(`/api/tournaments${query}`),
  tournament: (id: string) => request<Tournament>(`/api/tournaments/${id}`),
  leaderboard: (params: number | LeaderboardParams = 50) => {
    const query = new URLSearchParams();
    if (typeof params === "number") {
      query.set("limit", String(params));
    } else {
      query.set("limit", String(params.limit ?? 50));
      if (params.scope) query.set("scope", params.scope);
      if (params.month) query.set("month", params.month);
      if (params.search?.trim()) query.set("search", params.search.trim());
    }

    return request<RatingLeaderboardResponse>(`/api/rating/leaderboard?${query.toString()}`);
  },
  createTournament: (data: unknown) => request<Tournament>("/api/tournaments", { method: "POST", body: JSON.stringify(data) }),
  updateTournament: (id: string, data: unknown) =>
    request<Tournament>(`/api/tournaments/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteTournament: (id: string) => request<void>(`/api/tournaments/${id}`, { method: "DELETE" }),
  register: (id: string) => request<Registration>(`/api/tournaments/${id}/register`, { method: "POST" }),
  cancel: (id: string) => request<Registration>(`/api/tournaments/${id}/register`, { method: "DELETE" }),
  acceptRules: () => request<User>("/api/me/rules/accept", { method: "POST" }),
  updateProfile: (data: { displayName?: string; email?: string | null; photoUrl?: string }) =>
    request<User>("/api/me/profile", { method: "PATCH", body: JSON.stringify(data) }),
  completeIntro: () => request<User>("/api/me/intro/complete", { method: "POST" }),
  myRegistrations: () => request<Registration[]>("/api/me/registrations"),
  myAwards: () => request<ClubAward[]>("/api/me/awards"),
  stats: () => request<AdminStats>("/api/admin/stats"),
  participants: (id: string) => request<Registration[]>(`/api/tournaments/${id}/participants`),
  addParticipant: (id: string, data: unknown) =>
    request<Registration>(`/api/admin/tournaments/${id}/participants`, { method: "POST", body: JSON.stringify(data) }),
  adminCheckIn: (token: string) => request<Registration>("/api/admin/check-in", { method: "POST", body: JSON.stringify({ token }) }),
  removeRegistration: (id: string) => request<Registration>(`/api/admin/registrations/${id}`, { method: "DELETE" }),
  liveState: (id: string) => request<TournamentLiveState>(`/api/admin/tournaments/${id}/live`),
  moveLiveSeat: (tournamentId: string, registrationId: string, data: { tableNumber: number; seatNumber: number }) =>
    request<TournamentLiveState>(`/api/admin/tournaments/${tournamentId}/live/registrations/${registrationId}/seat`, {
      method: "PATCH",
      body: JSON.stringify(data)
    }),
  recordElimination: (
    tournamentId: string,
    data: { eliminatedRegistrationId: string; killerRegistrationId?: string | null }
  ) =>
    request<TournamentLiveState>(`/api/admin/tournaments/${tournamentId}/live/eliminations`, {
      method: "POST",
      body: JSON.stringify(data)
    }),
  autoReseat: (tournamentId: string) =>
    request<TournamentLiveState>(`/api/admin/tournaments/${tournamentId}/live/reseat`, { method: "POST" }),
  finalTable: (tournamentId: string) =>
    request<TournamentLiveState>(`/api/admin/tournaments/${tournamentId}/live/final-table`, { method: "POST" }),
  addOn: (registrationId: string) =>
    request<Registration>(`/api/admin/registrations/${registrationId}/add-on`, { method: "POST" }),
  downloadDayReport: (date: string) =>
    download(`/api/admin/reports/day.xlsx?date=${encodeURIComponent(date)}`, `flop-club-rating-${date}.xlsx`),
  ratingResults: (id: string, entriesCount?: number) =>
    request<TournamentRatingPayload>(
      `/api/admin/tournaments/${id}/rating-results${entriesCount ? `?entriesCount=${entriesCount}` : ""}`
    ),
  saveRatingResults: (id: string, data: unknown) =>
    request<TournamentRatingResult[]>(`/api/admin/tournaments/${id}/rating-results`, { method: "POST", body: JSON.stringify(data) }),
  exportUrl: (id: string) => `${API_URL}/api/admin/tournaments/${id}/export.csv`
};
