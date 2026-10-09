import GuessInput from "./GuessInput";

const GuessInputOverlay = ({
  gameCompleted,
  onGuess,
  onConfirm,
  guessCount,
  tempMarker,
  onClearMarker,
  isSubmitting,
}) => {
  if (gameCompleted) return null;

  return (
    <div className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] sm:bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-lg z-[1000]">
      <GuessInput
        onGuess={onGuess}
        onConfirm={onConfirm}
        disabled={gameCompleted}
        guessCount={guessCount}
        maxGuesses={-1}
        tempMarker={tempMarker}
        onClearMarker={onClearMarker}
        isSubmitting={isSubmitting}
      />
    </div>
  );
};

export default GuessInputOverlay;
