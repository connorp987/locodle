import { useState } from "react";
import { X, Share2, ExternalLink } from "lucide-react";
import { getTemperatureLabel } from "../utils/gameUtils";
import { getApiUrl } from "../utils/apiUtils";
import { useDiscord } from "../contexts/DiscordContext";

// Photo of the answer from its Wikipedia article. It goes through our proxy
// because Discord's CSP blocks Wikimedia's image hosts.
const PlacePhoto = ({ info, isDiscord }) => {
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
      className="w-full h-48 object-cover bg-slate-100"
    />
  );
};

// Short summary of the answer, with a link to the full article.
const PlaceSummary = ({ info }) => {
  const { openExternalLink } = useDiscord();
  if (!info?.summary) return null;
  return (
    <div className="mt-4">
      <p className="text-sm text-ink-soft leading-relaxed line-clamp-5">
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

const GameOverModal = ({
  isOpen,
  gameWon,
  answer,
  guesses,
  isDiscord,
  onShareAndExit,
  onClose,
}) => {
  if (!isOpen) return null;

  const guessWord = guesses.length === 1 ? "guess" : "guesses";

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center px-4 bg-ink/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="result-title"
        className="relative w-full max-w-sm max-h-[90vh] overflow-y-auto bg-white rounded-3xl shadow-float"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close results"
          className="absolute top-3 right-3 z-10 p-2 text-ink-faint hover:text-ink bg-white/80 hover:bg-white rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <PlacePhoto info={answer?.info} isDiscord={isDiscord} />

        <div className={`px-6 pb-6 ${answer?.info?.image ? "pt-5" : "pt-8"}`}>
          <p
            className={`text-sm font-semibold ${
              gameWon ? "text-heat-found" : "text-heat-fire"
            }`}
          >
            {gameWon
              ? `Found in ${guesses.length} ${guessWord}`
              : "Not this time. The answer was"}
          </p>
          <h2
            id="result-title"
            className="mt-1 text-3xl font-extrabold tracking-tight text-ink leading-tight"
          >
            {answer?.name}
          </h2>
          <p className="text-ink-soft">{answer?.country}</p>

          <PlaceSummary info={answer?.info} />

          {/* One square per guess, colored by how close it was */}
          {guesses.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-1">
              {guesses.map((guess, index) => {
                const temperature = getTemperatureLabel(guess.distance);
                return (
                  <span
                    key={index}
                    title={`Guess ${index + 1}: ${temperature.text}`}
                    className="w-5 h-5 rounded"
                    style={{ backgroundColor: temperature.hex }}
                  />
                );
              })}
            </div>
          )}

          <p className="mt-5 text-sm text-ink-soft">
            A new place every day. Come back tomorrow.
          </p>

          {isDiscord ? (
            <button
              onClick={onShareAndExit}
              className="mt-4 w-full h-12 bg-ink hover:bg-ink-soft text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              <Share2 className="w-5 h-5" />
              Share results and exit
            </button>
          ) : (
            <button
              onClick={onClose}
              className="mt-4 w-full h-12 bg-ink hover:bg-ink-soft text-white font-semibold rounded-xl transition-colors"
            >
              Back to map
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default GameOverModal;
