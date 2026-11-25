import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { getApiUrl } from "../utils/apiUtils";
import { useDiscord } from "../contexts/DiscordContext";

// Photo of the answer from its Wikipedia article (`answer.info`). It goes
// through our proxy because Discord's CSP blocks Wikimedia's image hosts.
export const PlacePhoto = ({ info, isDiscord, className = "w-full h-48" }) => {
  const [failed, setFailed] = useState(false);
  if (!info?.image || failed) return null;
  return (
    <img
      src={getApiUrl(
        `/api/wiki-image?src=${encodeURIComponent(info.image)}`,
        isDiscord
      )}
      alt={info.title || ""}
      onError={() => setFailed(true)}
      className={`object-cover bg-slate-100 ${className}`}
    />
  );
};

// Short summary of the answer, with a link to the full article.
export const PlaceSummary = ({ info, lines = 5, className = "mt-4" }) => {
  const { openExternalLink } = useDiscord();
  if (!info?.summary) return null;
  // Spelled out so Tailwind keeps the classes.
  const clamp = { 3: "line-clamp-3", 4: "line-clamp-4", 5: "line-clamp-5" }[lines];
  return (
    <div className={className}>
      <p className={`text-sm text-ink-soft leading-relaxed ${clamp}`}>
        {info.summary}
      </p>
      {info.url && (
        <button
          onClick={() => openExternalLink(info.url)}
          className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-ink hover:underline"
        >
          Read more on Wikipedia
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
