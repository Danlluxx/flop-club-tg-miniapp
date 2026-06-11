import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navigate, Route, Routes, useSearchParams } from "react-router-dom";
import { BrowserRouter } from "react-router-dom";
import { api, setToken } from "./lib/api";
import { getInitData, getStartParam, initTelegram } from "./lib/telegram";
import type { User } from "./types";
import { Layout } from "./components/Layout";
import { ToastProvider } from "./components/Toast";
import { HomePage } from "./pages/HomePage";
import { TournamentsPage } from "./pages/TournamentsPage";
import { TournamentPage } from "./pages/TournamentPage";
import { MyPage } from "./pages/MyPage";
import { ProfilePage } from "./pages/ProfilePage";
import { RatingPage } from "./pages/RatingPage";
import { SupportPage } from "./pages/SupportPage";
import { ClubPage } from "./pages/ClubPage";
import { StatusesPage } from "./pages/StatusesPage";
import { AwardsPage } from "./pages/AwardsPage";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { AdminTournaments } from "./pages/admin/AdminTournaments";
import { TournamentForm } from "./pages/admin/TournamentForm";
import { ParticipantsPage } from "./pages/admin/ParticipantsPage";
import { AdminCheckInPage } from "./pages/admin/AdminCheckInPage";
import { AdminFillRatesPage } from "./pages/admin/AdminFillRatesPage";
import { currentRulesVersion, RulesGate } from "./components/RulesGate";
import { NameGate } from "./components/NameGate";
import { IntroCarousel } from "./components/IntroCarousel";

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
        <Route path="/admin/fill-rates" element={<AdminOnly user={user}><AdminFillRatesPage /></AdminOnly>} />
        <Route path="/admin/tournaments" element={<AdminOnly user={user}><AdminTournaments /></AdminOnly>} />
        <Route path="/admin/tournaments/new" element={<AdminOnly user={user}><TournamentForm /></AdminOnly>} />
        <Route path="/admin/tournaments/:id/edit" element={<AdminOnly user={user}><TournamentForm /></AdminOnly>} />
        <Route path="/admin/tournaments/:id/participants" element={<AdminOnly user={user}><ParticipantsPage /></AdminOnly>} />
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
