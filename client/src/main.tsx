import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { watchForProtectedAreaLocks } from "./lib/protected-area";

watchForProtectedAreaLocks();

createRoot(document.getElementById("root")!).render(<App />);
