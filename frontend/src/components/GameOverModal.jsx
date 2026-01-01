import { X, Trophy, Target, Share2, Calendar } from "lucide-react";

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

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center px-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
      <div
        className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button for web users */}
        {!isDiscord && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all"
          >
            <X className="w-6 h-6" />
          </button>
        )}

        <div className="p-8 text-center">
          {gameWon ? (
            <div className="space-y-4">
              <div className="relative inline-block">
                <div className="absolute inset-0 bg-yellow-400 blur-2xl opacity-20 animate-pulse"></div>
                <Trophy className="relative w-20 h-20 text-yellow-500 mx-auto" />
              </div>
              <h2 className="text-3xl font-black text-gray-900">
                Congratulations! 🎉
              </h2>
              <div className="bg-green-50 text-green-700 rounded-2xl p-4 border border-green-100">
                <p className="text-lg">
                  You found <span className="font-bold">{answer?.name}</span>,{" "}
                  {answer?.country}
                </p>
                <p className="text-sm font-semibold mt-1">
                  In {guesses.length}{" "}
                  {guesses.length === 1 ? "guess" : "guesses"}!
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Target className="w-20 h-20 text-red-500 mx-auto" />
              <h2 className="text-3xl font-black text-gray-900">Game Over</h2>
              <div className="bg-red-50 text-red-700 rounded-2xl p-4 border border-red-100">
                <p className="text-lg">
                  The answer was{" "}
                  <span className="font-bold">{answer?.name}</span>
                </p>
                <p className="text-sm font-semibold mt-1">{answer?.country}</p>
              </div>
            </div>
          )}

          <div className="mt-8 space-y-4">
            <div className="flex items-center justify-center gap-2 text-gray-500 font-medium">
              <Calendar className="w-4 h-4" />
              <span>Come back tomorrow for a new challenge!</span>
            </div>

            {isDiscord ? (
              <button
                onClick={onShareAndExit}
                className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-primary-600/20 transform hover:scale-[1.02] active:scale-[0.98]"
              >
                <Share2 className="w-6 h-6" />
                <span className="text-lg">Share Results & Exit</span>
              </button>
            ) : (
              <button
                onClick={onClose}
                className="w-full bg-gray-900 hover:bg-black text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-xl transform hover:scale-[1.02] active:scale-[0.98]"
              >
                Close Results
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameOverModal;
