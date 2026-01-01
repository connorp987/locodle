import { createContext, useContext } from "react";

export const DiscordContext = createContext({
  isDiscord: false,
  user: null,
  sdk: null,
  trackEvent: () => {},
  logout: () => {},
  setActivityStatus: () => {},
  postChannelMessage: () => {},
  closeActivity: () => {},
});

export const useDiscord = () => useContext(DiscordContext);
