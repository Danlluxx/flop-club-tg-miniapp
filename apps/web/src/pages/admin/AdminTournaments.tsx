import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Edit3, Trash2, Users } from "lucide-react";
import { api } from "../../lib/api";
import { StatusBadge } from "../../components/StatusBadge";
import { useToast } from "../../components/Toast";

export function AdminTournaments() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { data, isLoading } = useQuery({ queryKey: ["admin", "tournaments"], queryFn: () => api.tournaments() });
  const remove = useMutation({
    mutationFn: api.deleteTournament,
    onSuccess: async () => {
      showToast("Турнир удалён");
      await queryClient.invalidateQueries({ queryKey: ["admin", "tournaments"] });
    },
    onError: (error) => showToast(error.message, "error")
  });

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="page-title text-[3rem]">Турниры</h2>
        <Link to="/admin/tournaments/new" className="rounded-full bg-white px-4 py-2 text-sm font-black text-graphite">Новый</Link>
      </div>
      {isLoading && <div className="app-panel p-5">Загрузка...</div>}
      <div className="space-y-3">
        {data?.map((item) => (
          <div key={item.id} className="app-panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold">{item.title}</h3>
                <p className="mt-1 text-sm text-slate-400">{new Date(item.startsAt).toLocaleString("ru-RU")}</p>
              </div>
              <StatusBadge status={item.status} />
            </div>
            <div className="mt-4 flex gap-2">
              <Link to={`/admin/tournaments/${item.id}/edit`} className="tap grid h-10 w-10 place-items-center rounded-full bg-white/8"><Edit3 className="h-4 w-4" /></Link>
              <Link to={`/admin/tournaments/${item.id}/participants`} className="tap grid h-10 w-10 place-items-center rounded-full bg-white/8"><Users className="h-4 w-4" /></Link>
              <button onClick={() => remove.mutate(item.id)} className="tap grid h-10 w-10 place-items-center rounded-full bg-rose-400/15 text-rose-200"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
