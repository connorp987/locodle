import { useEffect, useState, createContext, useContext } from "react";
import { DiscordSDK } from "@discord/embedded-app-sdk";

// Placeholder Client ID - User needs to replace this
const DISCORD_CLIENT_ID = "1442219897131368508";

// Create Context
const DiscordContext = createContext({
  isDiscord: false,
  user: null,
  sdk: null,
  trackEvent: () => {},
});

export const useDiscord = () => useContext(DiscordContext);

const DiscordActivityWrapper = ({ children }) => {
  const [auth, setAuth] = useState(null);
  const [error, setError] = useState(null);
  const [isDiscord, setIsDiscord] = useState(false);
  const [discordSdk, setDiscordSdk] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

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

  useEffect(() => {
    // Check if running in Discord
    const inDiscord = document.referrer.includes("discord.com");
    setIsDiscord(inDiscord);

    if (inDiscord) {
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

          // Retrieve an access_token from your activity's server
          // For single player demo, we might skip the full backend exchange initially
          // but typically you'd POST the code to your backend here.
          
          // For now, we'll just assume success if we got a code
          setAuth({ code });
          
          // Authenticate with Backend (Optional for now, but good for user info)
          const response = await fetch("/api/token", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              code,
            }),
          });
          const { access_token } = await response.json();

          // Authenticate with Discord Client
          const auth = await sdk.commands.authenticate({
            access_token,
          });

          setAuth(auth);
          setCurrentUser(auth.user); // Save user for analytics
        } catch (e) {
          console.error("Discord SDK Error", e);
          setError(e);
        }
      };
      setupDiscordSdk();
    }
  }, []);

  // If not in Discord, render with isDiscord: false
  if (!document.referrer.includes("discord.com")) {
    return (
      <DiscordContext.Provider value={{ isDiscord: false, user: null, sdk: null }}>
        {children}
      </DiscordContext.Provider>
    );
  }

  if (error) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white p-4 text-center">
              <div>
                  <h2 className="text-xl font-bold mb-2">Discord Error</h2>
                  <p className="text-gray-400">{error.message}</p>
              </div>
          </div>
      )
  }

  if (!auth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="animate-pulse">Loading Discord Activity...</div>
      </div>
    );
  }

  return (
    <DiscordContext.Provider
      value={{
        isDiscord,
        user: currentUser,
        sdk: discordSdk,
        trackEvent,
      }}
    >
      {children}
    </DiscordContext.Provider>
  );
};

export default DiscordActivityWrapper;
