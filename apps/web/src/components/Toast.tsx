import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

type Toast = { id: string; message: string; type: "success" | "error" };
type ToastContextValue = { showToast: (message: string, type?: Toast["type"]) => void };

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const showToast = useCallback((message: string, type: Toast["type"] = "success") => {
    const id = crypto.randomUUID();
    setToasts((items) => [...items, { id, message, type }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 3200);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed left-1/2 top-4 z-50 w-[min(calc(100vw-1.5rem),420px)] -translate-x-1/2 space-y-2">
        {toasts.map((toast) => (
          <div key={toast.id} className="glass flex items-center gap-3 rounded-lg px-4 py-3 text-sm">
            {toast.type === "success" ? <CheckCircle2 className="h-5 w-5 text-emerald" /> : <XCircle className="h-5 w-5 text-rose-400" />}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
