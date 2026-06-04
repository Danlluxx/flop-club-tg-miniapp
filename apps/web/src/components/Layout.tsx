import { NavLink, Outlet } from "react-router-dom";
import { CalendarDays, Home, Shield, UserRound } from "lucide-react";
import type { User } from "../types";

const nav = [
  { to: "/", label: "Главная", icon: Home },
  { to: "/tournaments", label: "Турниры", icon: CalendarDays },
  { to: "/profile", label: "Профиль", icon: UserRound }
];

export function Layout({ user }: { user: User }) {
  const items = user.role === "ADMIN" ? [...nav, { to: "/admin", label: "Админ", icon: Shield }] : nav;

  return (
    <div className="page-shell mx-auto flex min-h-screen max-w-md flex-col px-4 pb-24 pt-6">
      <main className="flex-1">
        <Outlet />
      </main>

      <nav
        className="club-capsule fixed bottom-3 left-1/2 z-40 grid w-[min(92vw,420px)] -translate-x-1/2 gap-1 rounded-full p-2 backdrop-blur-xl"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            aria-label={label}
            className={({ isActive }) =>
              `tap grid min-h-14 place-items-center rounded-full px-2 py-2 ${
                isActive ? "border border-electric/35 bg-electric/20 text-white shadow-[0_0_28px_rgba(255,51,79,0.18)]" : "text-slate-400"
              }`
            }
          >
            <Icon className="h-6 w-6" />
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
