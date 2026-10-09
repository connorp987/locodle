import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "@fontsource-variable/schibsted-grotesk";
import "./index.css";

import DiscordActivityWrapper from "./components/DiscordActivityWrapper";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <DiscordActivityWrapper>
      <App />
    </DiscordActivityWrapper>
  </React.StrictMode>
);
