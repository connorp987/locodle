import { useEffect, useState, useCallback } from "react";
import { DiscordSDK } from "@discord/embedded-app-sdk";
import { DiscordContext } from "../contexts/DiscordContext";
import { API_BASE_URL } from "../utils/apiUtils";
import DiscordIcon from "./DiscordIcon";
import { getDiscordAuthUrl } from "../utils/discordUtils";

const DISCORD_CLIENT_ID = "1442219897131368508";

// Module-level flag to prevent double code exchange in React Strict Mode
let processedCode = null;

const DiscordActivityWrapper = ({ children }) => {
  const [auth, setAuth] = useState(null);
  const [error, setError] = useState(null);
  const [isDiscord, setIsDiscord] = useState(false);
  const [discordSdk, setDiscordSdk] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [webLoginRequired, setWebLoginRequired] = useState(false);
  const [isGuestMode, setIsGuestMode] = useState(false);

  // Analytics Helper
  const trackEvent = useCallback(
    async (eventName, params = {}) => {
      let userType;
      if (isGuestMode) {
        userType = "guest";
      } else if (currentUser?.username) {
        userType = "discord_user";
      } else {
        userType = "anonymous";
      }

      const platform = isDiscord ? "discord_activity" : "web";
      const userId =
        currentUser?.id || (isGuestMode ? "guest_user" : "anonymous");
      const username =
        currentUser?.username || (isGuestMode ? "Guest" : "Anonymous");

      const enhancedEventInfo = {
        ...params,
        platform: platform,
        user_type: userType,
        user_id: userId,
        username: username,
      };

      if (isDiscord) {
        // Send to Backend Proxy
        try {
          // Use relative URL for proxy
          await fetch("/api/analytics", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event_name: eventName,
              params: enhancedEventInfo,
              client_id: userId,
            }),
          });
        } catch (e) {
          console.error("Failed to send analytics", e);
        }
      } else {
        // Standard Web GA
        if (window.gtag) {
          // Set user properties for segmentation
          window.gtag("set", "user_properties", {
            platform: platform,
            user_type: userType,
            username: username,
          });

          // Send event with enhanced params
          window.gtag("event", eventName, enhancedEventInfo);
        }
      }
    },
    [isDiscord, currentUser?.id, currentUser?.username, isGuestMode]
  );

  // Update Discord Activity status (Rich Presence)
  const setActivityStatus = useCallback(
    async (state, details, persist = false) => {
      if (!isDiscord || !discordSdk) return;

      try {
        const activityConfig = {
          state: state, // e.g., "Completed in 3 guesses!"
          details: details, // e.g., "Playing Locodle"
        };

        // If persist is true, try to make the status persist after instance ends
        if (persist) {
          activityConfig.instance = false;
        }

        await discordSdk.commands.setActivity(activityConfig);
      } catch (e) {
        console.error("Failed to set activity status:", e);
      }
    },
    [isDiscord, discordSdk]
  );

  // Post a custom result message to the Discord channel (via backend proxy)
  const postChannelMessage = useCallback(
    async (messageContent) => {
      if (!isDiscord || !discordSdk) {
        console.warn(
          "postChannelMessage called outside of Discord or before SDK ready"
        );
        return false;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

      try {
        const channelId = discordSdk.channelId;

        // Send to backend which will post using the bot
        // Use full URL if possible or ensure relative URL is handled by proxy
        const response = await fetch("/api/post-result-message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channelId,
            content: messageContent,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        return response.ok;
      } catch (e) {
        clearTimeout(timeoutId);
        if (e.name === "AbortError") {
          console.error("Post message timed out after 5 seconds");
        } else {
          console.error("Failed to post message to channel:", e);
        }
        return false;
      }
    },
    [isDiscord, discordSdk]
  );

  // Close the activity
  const closeActivity = useCallback(async () => {
    if (!isDiscord || !discordSdk) return;

    try {
      if (typeof discordSdk.close === "function") {
        // Use official .close() method with status code 1000 (Normal Closure)
        discordSdk.close(1000);
      }
    } catch (e) {
      console.error("Failed to close activity:", e);
    }
  }, [isDiscord, discordSdk]);

  useEffect(() => {
    // Check if running in Discord - must have frame_id query param for SDK to work
    const urlParams = new URLSearchParams(window.location.search);
    const hasFrameId = urlParams.has("frame_id");

    // Only set isDiscord true if we have frame_id (required for SDK)
    setIsDiscord(hasFrameId);

    if (hasFrameId) {
      // Discord Activity Flow - only initialize SDK if frame_id exists
      const sdk = new DiscordSDK(DISCORD_CLIENT_ID);
      setDiscordSdk(sdk);

      const setupDiscordSdk = async () => {
        try {
          await sdk.ready();

          // Authorize with Discord Client
          const { code } = await sdk.commands.authorize({
            client_id: DISCORD_CLIENT_ID,
            response_type: "code",
            state: "",
            prompt: "none",
            scope: ["identify", "guilds"],
          });

          // Exchange code for token via backend
          const response = await fetch("/api/token", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ code }),
          });
          const { access_token, user } = await response.json();

          // Authenticate with Discord Client
          const authResult = await sdk.commands.authenticate({
            access_token,
          });

          setAuth(authResult);
          // Include guild_id from SDK for server-specific leaderboards
          const userWithGuild = {
            ...(user || authResult.user),
            guild_id: sdk.guildId,
          };
          setCurrentUser(userWithGuild);
        } catch (e) {
          console.error("Discord SDK Error", e);
          setError(e);
        }
      };
      setupDiscordSdk();
    } else {
      // Web Flow - Check for guest mode first
      const guestMode = localStorage.getItem("locodle-guest-mode");
      if (guestMode === "true") {
        setIsGuestMode(true);
        setAuth({ authenticated: true, guest: true });
        return;
      }

      // Check for existing Discord session
      const storedUser = localStorage.getItem("discord_user");
      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          setCurrentUser(user);
          setAuth({ authenticated: true });
          return;
        } catch (e) {
          localStorage.removeItem("discord_user");
        }
      }

      // Check for OAuth callback code in URL
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get("code");

      if (code) {
        // Prevent double execution in React Strict Mode
        if (processedCode === code) {
          return;
        }
        processedCode = code;

        // Exchange code for token
        const redirectUri = window.location.origin.replace(/\/+$/, "");

        fetch(`${API_BASE_URL}/api/token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ code, redirect_uri: redirectUri }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.user) {
              localStorage.setItem("discord_user", JSON.stringify(data.user));
              setCurrentUser(data.user);
              setAuth({ authenticated: true });
              // Clear code from URL
              window.history.replaceState(
                {},
                document.title,
                window.location.pathname
              );
            } else {
              console.error("Token exchange failed:", data);
              setWebLoginRequired(true);
            }
          })
          .catch((err) => {
            console.error("Token exchange error:", err);
            setWebLoginRequired(true);
          });
      } else {
        // No session, no code - require login
        setWebLoginRequired(true);
      }
    }
  }, []);

  const handleWebLogin = () => {
    const redirectUri = window.location.origin;
    const authUrl = getDiscordAuthUrl(DISCORD_CLIENT_ID, redirectUri);
    window.location.href = authUrl;
  };

  // Handle guest login
  const handleGuestLogin = () => {
    localStorage.setItem("locodle-guest-mode", "true");
    setIsGuestMode(true);
    setWebLoginRequired(false);
    setAuth({ authenticated: true, guest: true });
  };

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem("discord_user");
    localStorage.removeItem("locodle-guest-mode");
    setCurrentUser(null);
    setAuth(null);
    setIsGuestMode(false);
    setWebLoginRequired(true);
  };

  // Login Modal Component
  const LoginModal = () => (
    <div className="fixed inset-0 z-[5000] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" />
      {/* Modal */}
      <div className="relative bg-white rounded-3xl shadow-float p-7 max-w-sm w-full mx-4">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">
          Locodle
        </h1>
        <p className="mt-1 text-ink-soft leading-relaxed">
          A famous place is hidden on the map each day. Guess where it is and
          get closer with every try.
        </p>
        <button
          onClick={handleWebLogin}
          className="mt-6 w-full h-12 bg-[#5865F2] hover:bg-[#4752C4] text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
        >
          <DiscordIcon className="w-5 h-5" />
          Continue with Discord
        </button>
        <p className="mt-1.5 text-xs text-ink-faint text-center">
          Keeps your stats and streak across devices
        </p>
        <button
          onClick={handleGuestLogin}
          className="mt-4 w-full h-12 bg-slate-100 hover:bg-slate-200 text-ink font-semibold rounded-xl transition-colors"
        >
          Play as guest
        </button>
        <p className="mt-1.5 text-xs text-ink-faint text-center">
          Progress stays on this device only
        </p>
      </div>
    </div>
  );

  // Web user needs to login - show modal over the app
  if (!isDiscord && webLoginRequired) {
    return (
      <DiscordContext.Provider
        value={{
          isDiscord: false,
          user: null,
          sdk: null,
          isGuestMode: false,
          trackEvent,
          logout: handleLogout,
          setActivityStatus,
          postChannelMessage,
          closeActivity,
        }}
      >
        {children}
        <LoginModal />
      </DiscordContext.Provider>
    );
  }

  // Web user authenticated or processing OAuth callback
  if (!isDiscord && auth) {
    return (
      <DiscordContext.Provider
        value={{
          isDiscord: false,
          user: currentUser,
          sdk: null,
          isGuestMode: isGuestMode,
          trackEvent,
          logout: handleLogout,
          setActivityStatus,
          postChannelMessage,
          closeActivity,
        }}
      >
        {children}
      </DiscordContext.Provider>
    );
  }

  // Web user - still loading/processing
  if (!isDiscord && !auth && !webLoginRequired) {
    return (
      <DiscordContext.Provider
        value={{
          isDiscord: false,
          user: null,
          sdk: null,
          isGuestMode: false,
          trackEvent,
          logout: handleLogout,
          setActivityStatus,
          postChannelMessage,
          closeActivity,
        }}
      >
        <div className="min-h-screen flex items-center justify-center bg-white text-ink-soft">
          <div className="motion-safe:animate-pulse">Authenticating...</div>
        </div>
      </DiscordContext.Provider>
    );
  }

  // Discord Activity - Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-ink-soft p-4 text-center">
        <div>
          <h2 className="text-xl font-bold text-ink mb-2">Couldn&apos;t connect to Discord</h2>
          <p className="text-ink-soft">{error.message}</p>
        </div>
      </div>
    );
  }

  // Discord Activity - Loading state
  if (!auth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-ink-soft">
        <div className="motion-safe:animate-pulse">Loading Discord Activity...</div>
      </div>
    );
  }

  // Discord Activity - Authenticated
  return (
    <DiscordContext.Provider
      value={{
        isDiscord,
        user: currentUser,
        sdk: discordSdk,
        isGuestMode: false,
        trackEvent,
        logout: handleLogout,
        setActivityStatus,
        postChannelMessage,
        closeActivity,
      }}
    >
      {children}
    </DiscordContext.Provider>
  );
};

export default DiscordActivityWrapper;
