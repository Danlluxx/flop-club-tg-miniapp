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
  personalDataConsentAt?: string | null;
  personalDataConsentVersion?: string | null;
  photoVideoConsentAt?: string | null;
  photoVideoConsentVersion?: string | null;
  introCompletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Tournament = {
  mechanics?: TournamentMechanics | null;
  blindLevelIndex?: number;
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
  addOnChips: number;
  maxParticipants: number;
  status: TournamentStatus;
  allowCancellation: boolean;
  registrationOpen?: boolean;
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
  lifeNumber: number;
  issuedChips: number;
  entryNumber: number;
  addOnCount: number;
  eliminatedAt?: string | null;
  noShowPenaltyAppliedAt?: string | null;
  noShowPenaltyPoints: number;
  bountyAdjustment?: number;
  createdAt: string;
  updatedAt: string;
  tournament?: Tournament;
  user?: User;
};

export type TournamentPublicParticipant = {
  id: string;
  status: RegistrationStatus;
  liveStatus: ParticipantLiveStatus;
  finishPlace?: number | null;
  createdAt: string;
  user: Pick<User, "id" | "username" | "firstName" | "lastName" | "displayName" | "photoUrl" | "ratingPoints">;
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

// The leaderboard is visible to every player, so it carries only what a row shows.
export type RatingLeaderboardEntry = Pick<
  User,
  "id" | "username" | "firstName" | "lastName" | "displayName" | "photoUrl" | "ratingPoints" | "knockouts"
> & {
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
  chipLeaderBonus: number;
  createdAt: string;
  updatedAt: string;
  user?: User;
};

export type TournamentRatingPayload = {
  entriesCount?: number | null;
  ratingPool: number;
  awards: RatingAward[];
  results: TournamentRatingResult[];
  chipLeaderAward?: {
    tournamentId: string;
    userId: string;
    points: number;
  } | null;
};

export type ClubAward = {
  title: string;
  unlocked: boolean;
  wonAt?: string | null;
};

export type PlayerStats = {
  playedTournaments: number;
  winsCount: number;
  wins: Array<{
    id: string;
    tournamentId: string;
    title: string;
    startsAt: string;
    points: number;
  }>;
};

export type TournamentMechanics = {
  tournamentType: "FLOP_DEVIL_DEAL"; timezone: "Asia/Barnaul"; startingStack: number; blindLevelMinutes: number;
  registrationClosesAt: string; blindLevels: number[];
  reEntry: { enabled: boolean; maxEntries: number | null };
  resurrection: { enabled: boolean; maxAttemptsPerPlayer: 1; probabilities: { death: number; fiveBB: number; tenBB: number } };
  devilsSixes: { enabled: boolean; pocketSixesBonusBB: number; setOfSixesBonusBB: number; requiresShowdown: true };
  bounty: { enabled: boolean; ratingPointsPerElimination: number };
};
export type GameEvent = {
  id: string; tournamentId: string; userId: string | null; registrationId: string | null; actorId: string | null;
  eventKey: string; attemptKey: string | null; type: string; outcome: "DEATH" | "RESURRECT_5" | "RESURRECT_10" | null;
  eliminationId: string | null; handId: string | null; bigBlind: number; chips: number; ratingPoints: number;
  applied: boolean; reason: string | null; reversesId: string | null; createdAt: string;
};
export type DevilState = {
  tournamentId: string; rules: TournamentMechanics; reEntryPrice: number; serverNow: string; running: boolean; registrationOpen: boolean; paidReEntryOpen: boolean;
  mechanicsOpen: boolean; blindLevelIndex: number; bigBlind: number; dealAvailable: boolean; status: string | null;
  attempt: GameEvent | null; events: GameEvent[];
  registrations?: Registration[];
  stats: { registered: number; active: number; eliminations: number; attempts: number; successful: number; failed: number; sixes: number; bounties: number; ratingPoints: number };
};
