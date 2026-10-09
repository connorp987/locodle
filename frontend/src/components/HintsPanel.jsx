const HintsPanel = ({ hints }) => {
  if (!hints || hints.length === 0) {
    return null;
  }

  return (
    <ul className="divide-y divide-slate-100">
      {hints.map((hint, index) => (
        <li key={index} className="py-3 first:pt-0 last:pb-0 text-ink leading-relaxed">
          {hint}
        </li>
      ))}
    </ul>
  );
};

export default HintsPanel;
