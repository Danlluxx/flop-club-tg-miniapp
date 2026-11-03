import React from "react";
import ReactDOM from "react-dom/client";
import { Root } from "./App";
import "./index.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/manrope/latin-800.css";
import "@fontsource/manrope/cyrillic-500.css";
import "@fontsource/manrope/cyrillic-600.css";
import "@fontsource/manrope/cyrillic-700.css";
import "@fontsource/manrope/cyrillic-800.css";
import "@fontsource/unbounded/latin-600.css";
import "@fontsource/unbounded/latin-700.css";
import "@fontsource/unbounded/cyrillic-600.css";
import "@fontsource/unbounded/cyrillic-700.css";
import "./styles/soft-icons.css";
import "./styles/soft.css";

// The soft design is a layer scoped to html.soft; Layout drops it on admin routes.
document.documentElement.classList.add("soft");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
