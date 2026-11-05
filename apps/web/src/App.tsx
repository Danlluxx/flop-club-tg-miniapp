import { lazy, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navigate, Route, Routes, useSearchParams } from "react-router-dom";
import { BrowserRouter } from "react-router-dom";
import { api, setToken } from "./lib/api";
import { getInitData, getStartParam, initTelegram } from "./lib/telegram";
import type { User } from "./types";
import { Layout } from "./components/Layout";
import { ToastProvider } from "./components/Toast";
import { HomePage } from "./pages/HomePage";
import { currentRulesVersion, RulesGate } from "./components/RulesGate";
import { NameGate } from "./components/NameGate";
import { IntroCarousel } from "./components/IntroCarousel";
import {
  currentPersonalDataConsentVersion,
  currentPhotoVideoConsentVersion,
  PersonalDataConsentGate
} from "./components/PersonalDataConsentGate";

// Only the home page ships in the first bundle; everything else loads on first visit.
const TournamentsPage = lazy(() => import("./pages/TournamentsPage").then((m) => ({ default: m.TournamentsPage })));
const TournamentPage = lazy(() => import("./pages/TournamentPage").then((m) => ({ default: m.TournamentPage })));
const MyPage = lazy(() => import("./pages/MyPage").then((m) => ({ default: m.MyPage })));
const ProfilePage = lazy(() => import("./pages/ProfilePage").then((m) => ({ default: m.ProfilePage })));
const RatingPage = lazy(() => import("./pages/RatingPage").then((m) => ({ default: m.RatingPage })));
const SupportPage = lazy(() => import("./pages/SupportPage").then((m) => ({ default: m.SupportPage })));
const ClubPage = lazy(() => import("./pages/ClubPage").then((m) => ({ default: m.ClubPage })));
const StatusesPage = lazy(() => import("./pages/StatusesPage").then((m) => ({ default: m.StatusesPage })));
const AwardsPage = lazy(() => import("./pages/AwardsPage").then((m) => ({ default: m.AwardsPage })));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard").then((m) => ({ default: m.AdminDashboard })));
const AdminTournaments = lazy(() => import("./pages/admin/AdminTournaments").then((m) => ({ default: m.AdminTournaments })));
const TournamentForm = lazy(() => import("./pages/admin/TournamentForm").then((m) => ({ default: m.TournamentForm })));
const DevilControlPage = lazy(() => import("./pages/admin/DevilControlPage").then((m) => ({ default: m.DevilControlPage })));
const ParticipantsPage = lazy(() => import("./pages/admin/ParticipantsPage").then((m) => ({ default: m.ParticipantsPage })));
const AdminCheckInPage = lazy(() => import("./pages/admin/AdminCheckInPage").then((m) => ({ default: m.AdminCheckInPage })));
const AdminFillRatesPage = lazy(() => import("./pages/admin/AdminFillRatesPage").then((m) => ({ default: m.AdminFillRatesPage })));
const AdminAnalyticsPage = lazy(() => import("./pages/admin/AdminAnalyticsPage").then((m) => ({ default: m.AdminAnalyticsPage })));

const queryClient = new QueryClient();

function AdminOnly({ user, children }: { user: User; children: React.ReactNode }) {
  if (user.role !== "ADMIN") return <Navigate to="/" replace />;
  return children;
}

function checkInTokenFromStartParam(startParam: string) {
  if (!startParam.startsWith("checkin_")) return "";
  return startParam.slice("checkin_".length);
}

function AppRoutes({ user, onUserUpdated }: { user: User; onUserUpdated: (user: User) => void }) {
  const [searchParams] = useSearchParams();
  const checkInToken = searchParams.get("checkInToken") || checkInTokenFromStartParam(getStartParam());

  return (
    <Routes>
      <Route element={<Layout user={user} />}>
        <Route
          index
          element={checkInToken ? <AdminOnly user={user}><AdminCheckInPage token={checkInToken} /></AdminOnly> : <HomePage user={user} />}
        />
        <Route path="/tournaments" element={<TournamentsPage />} />
        <Route path="/tournaments/:id" element={<TournamentPage />} />
        <Route path="/rating" element={<RatingPage user={user} />} />
        <Route path="/statuses" element={<StatusesPage user={user} />} />
        <Route path="/awards" element={<AwardsPage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/club" element={<ClubPage />} />
        <Route path="/my" element={<MyPage />} />
        <Route path="/profile" element={<ProfilePage user={user} onUserUpdated={onUserUpdated} />} />
        <Route path="/admin" element={<AdminOnly user={user}><AdminDashboard /></AdminOnly>} />
        <Route path="/admin/analytics" element={<AdminOnly user={user}><AdminAnalyticsPage /></AdminOnly>} />
        <Route path="/admin/fill-rates" element={<AdminOnly user={user}><AdminFillRatesPage /></AdminOnly>} />
        <Route path="/admin/tournaments" element={<AdminOnly user={user}><AdminTournaments /></AdminOnly>} />
        <Route path="/admin/tournaments/new" element={<AdminOnly user={user}><TournamentForm /></AdminOnly>} />
        <Route path="/admin/tournaments/:id/edit" element={<AdminOnly user={user}><TournamentForm /></AdminOnly>} />
        <Route path="/admin/tournaments/:id/participants" element={<AdminOnly user={user}><ParticipantsPage /></AdminOnly>} />
        <Route path="/admin/tournaments/:id/devil" element={<AdminOnly user={user}><DevilControlPage /></AdminOnly>} />
        <Route path="/check-in/:token" element={<AdminOnly user={user}><AdminCheckInPage /></AdminOnly>} />
      </Route>
    </Routes>
  );
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initTelegram();
    api
      .authTelegram(getInitData())
      .then((payload) => {
        setToken(payload.token);
        setUser(payload.user);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center px-4">
        <div className="glass rounded-lg p-5">
          <h1 className="text-xl font-black">Не удалось войти</h1>
          <p className="mt-2 text-sm text-slate-300">{error}</p>
          <p className="mt-4 text-xs text-slate-500">Откройте приложение внутри Telegram или задайте dev initData для локальной разработки.</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center px-4">
        <div className="glass w-full rounded-lg p-5">
          <div className="h-5 w-1/2 animate-pulse rounded bg-white/10" />
          <div className="mt-4 h-3 w-full animate-pulse rounded bg-white/10" />
          <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-white/10" />
        </div>
      </div>
    );
  }

  if (!user.rulesAcceptedAt || user.rulesVersion !== currentRulesVersion) {
    return <RulesGate onAccepted={setUser} />;
  }

  if (
    !user.personalDataConsentAt ||
    user.personalDataConsentVersion !== currentPersonalDataConsentVersion ||
    !user.photoVideoConsentAt ||
    user.photoVideoConsentVersion !== currentPhotoVideoConsentVersion
  ) {
    return <PersonalDataConsentGate user={user} onAccepted={setUser} />;
  }

  if (!user.displayName) {
    return <NameGate user={user} onSaved={setUser} />;
  }

  if (!user.introCompletedAt) {
    return <IntroCarousel onCompleted={setUser} />;
  }

  return <AppRoutes user={user} onUserUpdated={setUser} />;
}

export function Root() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
