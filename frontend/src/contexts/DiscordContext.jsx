import { createContext, useContext } from "react";

export const DiscordContext = createContext({
  isDiscord: false,
  user: null,
  sdk: null,
  isGuestMode: false,
  trackEvent: () => {},
  logout: () => {},
  setActivityStatus: () => {},
  postChannelMessage: () => {},
  closeActivity: () => {},
  openExternalLink: () => {},
});

export const useDiscord = () => useContext(DiscordContext);
