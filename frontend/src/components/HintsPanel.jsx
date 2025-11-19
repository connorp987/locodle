import { Lightbulb } from "lucide-react";

const HintsPanel = ({ hints }) => {
  if (!hints || hints.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
        <Lightbulb className="w-5 h-5 text-yellow-500" />
        Hints
      </h2>

      <div className="space-y-3">
        {hints.map((hint, index) => (
          <div
            key={index}
            className="flex gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg"
          >
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-yellow-500 text-white text-xs font-bold flex-shrink-0">
              {index + 1}
            </span>
            <p className="text-sm text-gray-700">{hint}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HintsPanel;
