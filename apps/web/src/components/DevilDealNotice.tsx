import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { api } from "../lib/api";

export function DevilDealNotice() {
  const location = useLocation();
  const registrations = useQuery({ queryKey: ["me", "registrations"], queryFn: api.myRegistrations, refetchInterval: 10000 });
  const candidate = registrations.data?.find(r => r.status === "ACTIVE" && r.tournament?.mechanics && ["OPEN", "CLOSED"].includes(r.tournament.status));
  const id = candidate?.tournamentId ?? "";
  const state = useQuery({ queryKey: ["devil", id], queryFn: () => api.devilState(id), enabled: !!id, refetchInterval: 3000 });
  if (!state.data?.dealAvailable || location.pathname === `/tournaments/${id}`) return null;
  return <Link className="app-panel mb-4 block border border-rose-400/30 p-4" to={`/tournaments/${id}`} role="status"><strong>ТВОЯ ИГРА ОКОНЧЕНА</strong><p className="mt-2 text-sm text-rose-200">Дьявол предлагает тебе сделку →</p></Link>;
}
