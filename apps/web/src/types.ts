export type Role = "USER" | "ADMIN";
export type TournamentStatus = "OPEN" | "CLOSED" | "CANCELLED" | "FINISHED";
export type RegistrationStatus = "ACTIVE" | "CANCELLED";
export type ParticipantLiveStatus = "IN_GAME" | "ELIMINATED";
export type TournamentProfile = "BASE" | "FREEZE" | "PHOENIX" | "TURBO_ACTION" | "DEEP_SPECIAL" | "KNOCKOUT" | "FINAL";

export type User = {
  id: string;
  telegramId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  email?: string | null;
  photoUrl?: string | null;
  role: Role;
  ratingPoints: number;
  knockouts: number;
  rulesAcceptedAt?: string | null;
  rulesVersion?: string | null;
  introCompletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Tournament = {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  location: string;
  buyIn: number;
  reEntry: number;
  prizePool: number;
  ratingPool: number;
  entriesCount?: number | null;
  profile: TournamentProfile;
  lateRegistrationEndsAt?: string | null;
  addOnEnabled: boolean;
  addOnPrice: number;
  maxParticipants: number;
  status: TournamentStatus;
  allowCancellation: boolean;
  activeSeatsCount?: number;
  _count: { registrations: number };
  myRegistration?: Registration | null;
};

export type Registration = {
  id: string;
  userId: string;
  tournamentId: string;
  status: RegistrationStatus;
  liveStatus: ParticipantLiveStatus;
  checkInToken: string;
  checkedInAt?: string | null;
  tableNumber?: number | null;
  seatNumber?: number | null;
  finishPlace?: number | null;
  entryNumber: number;
  addOnCount: number;
  eliminatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  tournament?: Tournament;
  user?: User;
};

export type Knockout = {
  id: string;
  tournamentId: string;
  eliminatedRegistrationId: string;
  killerRegistrationId?: string | null;
  createdAt: string;
  updatedAt: string;
  eliminatedRegistration?: Registration;
  killerRegistration?: Registration | null;
};

export type LiveSeat = {
  seatNumber: number;
  registration: Registration | null;
};

export type LiveTable = {
  tableNumber: number;
  occupied: number;
  seats: LiveSeat[];
};

export type TournamentLiveState = {
  tournament: Tournament;
  registrations: Registration[];
  inGame: Registration[];
  eliminated: Registration[];
  tables: LiveTable[];
  knockouts: Knockout[];
};

export type RatingLeaderboardEntry = User & {
  rank: number | string;
};

export type RatingLeaderboardResponse = {
  leaders: RatingLeaderboardEntry[];
  currentUserRank: number | null;
  scope?: "global" | "season";
  month?: string | null;
};

export type RatingAward = {
  place: number;
  percent: number;
  points: number;
};

export type TournamentRatingResult = {
  id: string;
  tournamentId: string;
  userId: string;
  place: number;
  percent: number;
  points: number;
  knockouts: number;
  createdAt: string;
  updatedAt: string;
  user?: User;
};

export type TournamentRatingPayload = {
  entriesCount?: number | null;
  ratingPool: number;
  awards: RatingAward[];
  results: TournamentRatingResult[];
};

export type ClubAward = {
  title: string;
  unlocked: boolean;
  wonAt?: string | null;
};
