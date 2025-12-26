import { useEffect, useState, createContext, useContext } from "react";
import { DiscordSDK } from "@discord/embedded-app-sdk";

// Placeholder Client ID - User needs to replace this
const DISCORD_CLIENT_ID = "1442219897131368508";

// API Base URL
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

// Module-level flag to prevent double code exchange in React Strict Mode
let processedCode = null;

// Create Context
const DiscordContext = createContext({
  isDiscord: false,
  user: null,
  sdk: null,
  trackEvent: () => {},
  logout: () => {},
  setActivityStatus: () => {},
});

export const useDiscord = () => useContext(DiscordContext);

const DiscordActivityWrapper = ({ children }) => {
  const [auth, setAuth] = useState(null);
  const [error, setError] = useState(null);
  const [isDiscord, setIsDiscord] = useState(false);
  const [discordSdk, setDiscordSdk] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [webLoginRequired, setWebLoginRequired] = useState(false);

  // Analytics Helper
  const trackEvent = async (eventName, params = {}) => {
    if (isDiscord) {
      // Send to Backend Proxy
      try {
        // Use relative URL for proxy
        await fetch("/api/analytics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_name: eventName,
            params: params,
            client_id: currentUser?.id || "anonymous_discord_user",
          }),
        });
      } catch (e) {
        console.error("Failed to send analytics", e);
      }
    } else {
      // Standard Web GA
      if (window.gtag) {
        window.gtag("event", eventName, params);
      }
    }
  };

  // Update Discord Activity status (Rich Presence)
  const setActivityStatus = async (state, details, persist = false) => {
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
  };

  useEffect(() => {
    // Check if running in Discord - must have frame_id query param for SDK to work
    const urlParams = new URLSearchParams(window.location.search);
    const hasFrameId = urlParams.has("frame_id");
    const inDiscord = hasFrameId || document.referrer.includes("discord.com");

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
      // Web Flow - Check for existing session or OAuth callback
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

  // Handle web login redirect
  const handleWebLogin = () => {
    const redirectUri = encodeURIComponent(
      window.location.origin.replace(/\/+$/, "")
    );
    const scope = encodeURIComponent("identify guilds");
    const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;
    window.location.href = authUrl;
  };

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem("discord_user");
    setCurrentUser(null);
    setAuth(null);
    setWebLoginRequired(true);
  };

  // Login Modal Component
  const LoginModal = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      {/* Modal */}
      <div className="relative bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-md mx-4 text-center border border-gray-700">
        <div className="mb-6">
          <div className="w-16 h-16 bg-[#5865F2] rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-10 h-10 text-white"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            Welcome to Locodle
          </h1>
          <p className="text-gray-400">
            Sign in with Discord to play and track your progress across devices
          </p>
        </div>
        <button
          onClick={handleWebLogin}
          className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold py-3 px-6 rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
          </svg>
          Continue with Discord
        </button>
        <p className="text-gray-500 text-sm mt-4">
          Your progress syncs across web and Discord
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
          trackEvent,
          logout: handleLogout,
          setActivityStatus,
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
          trackEvent,
          logout: handleLogout,
          setActivityStatus,
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
          trackEvent,
          logout: handleLogout,
          setActivityStatus,
        }}
      >
        <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
          <div className="animate-pulse">Authenticating...</div>
        </div>
      </DiscordContext.Provider>
    );
  }

  // Discord Activity - Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white p-4 text-center">
        <div>
          <h2 className="text-xl font-bold mb-2">Discord Error</h2>
          <p className="text-gray-400">{error.message}</p>
        </div>
      </div>
    );
  }

  // Discord Activity - Loading state
  if (!auth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="animate-pulse">Loading Discord Activity...</div>
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
        trackEvent,
        logout: handleLogout,
        setActivityStatus,
      }}
    >
      {children}
    </DiscordContext.Provider>
  );
};

export default DiscordActivityWrapper;
