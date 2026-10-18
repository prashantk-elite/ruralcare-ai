import "./tokens.css";
import React from "react"; import { createRoot } from "react-dom/client"; import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { applyTheme, getTheme } from "./theme"; import "./styles.css";
applyTheme(getTheme());
createRoot(document.getElementById("root")!).render(<BrowserRouter><App /></BrowserRouter>);
