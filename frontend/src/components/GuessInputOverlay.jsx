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
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[95%] max-w-2xl z-[1000]">
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
