import { useMutation } from "@tanstack/react-query";
import { FormEvent, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { User } from "../types";
import { useToast } from "./Toast";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function EmailGate({ onSaved, onSkip }: { onSaved: (user: User) => void; onSkip: () => void }) {
  const [email, setEmail] = useState("");
  const { showToast } = useToast();
  const cleanEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const canSave = cleanEmail.length <= 254 && emailPattern.test(cleanEmail);

  const save = useMutation({
    mutationFn: () => api.updateProfile({ email: cleanEmail }),
    onSuccess: onSaved,
    onError: (error) => showToast(error.message, "error")
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (canSave) save.mutate();
  }

  return (
    <section className="name-screen">
      <form onSubmit={submit} className="name-card">
        <div className="brand-mark name-mark rounded-full border border-electric/40">
          <img src="/flop-club-logo.webp" alt="" width={1064} height={797} />
        </div>
        <p className="mt-7 text-[11px] font-bold uppercase tracking-[0.34em] text-electric">Flop Club / Barnaul</p>
        <h1 className="name-title mt-4">Привяжите почту</h1>
        <p className="mt-5 text-center text-2xl font-black leading-tight text-white">Ваш email для входа</p>
        <p className="mt-3 max-w-sm text-center text-sm leading-relaxed text-slate-400">
          Скоро клуб заработает и в браузере. Почта станет вашим постоянным идентификатором: рейтинг, статусы и
          история турниров останутся с вами на любом устройстве.
        </p>

        <label className="sr-only" htmlFor="account-email">Email</label>
        <input
          id="account-email"
          autoFocus
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@example.com"
          className="name-input email-input"
        />
        <p className="email-hint">Мы не рассылаем спам и не передаём адрес третьим лицам.</p>

        <button type="submit" disabled={!canSave || save.isPending} className="name-accept tap">
          {save.isPending ? "Сохраняем..." : "Привязать"}
        </button>
        <button type="button" onClick={onSkip} className="email-skip tap">Напомнить позже</button>
      </form>
    </section>
  );
}
