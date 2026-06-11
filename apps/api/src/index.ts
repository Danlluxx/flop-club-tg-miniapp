import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { config } from "./config.js";
import { authRouter } from "./routes/auth.js";
import { tournamentsRouter } from "./routes/tournaments.js";
import { meRouter } from "./routes/me.js";
import { adminRouter } from "./routes/admin.js";
import { ratingRouter } from "./routes/rating.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { startTournamentReminderScheduler } from "./services/telegramReminders.js";

const app = express();
const allowedOrigins = new Set([
  config.FRONTEND_URL,
  ...(config.NODE_ENV === "development" ? ["http://localhost:5173", "http://localhost:5174"] : [])
]);

app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Not allowed by CORS"));
  },
  credentials: true
}));
app.use(express.json({ limit: "128kb" }));
app.use(morgan("tiny"));

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);
app.use("/api/tournaments", tournamentsRouter);
app.use("/api/me", meRouter);
app.use("/api/rating", ratingRouter);
app.use("/api/admin", adminRouter);
app.use(errorHandler);

app.listen(config.PORT, () => {
  console.log(`[api] listening on :${config.PORT}`);
  startTournamentReminderScheduler();
});
