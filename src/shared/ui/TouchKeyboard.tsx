export function TouchKeyboard({
  label,
  onClose,
  onType,
  nameKeys = false,
}: {
  label: string;
  nameKeys?: boolean;
  onClose: () => void;
  onType: (key: string) => void;
}) {
  return (
    <div
      className="touch-keyboard"
      role="group"
      aria-label="On-screen keyboard"
      onPointerDown={(e) => e.preventDefault()}
    >
      <div className="keyboard-heading">
        <span>{label}</span>
        <button
          type="button"
          onClick={() => onClose()}
          aria-label="Close keyboard"
        >
          ✕
        </button>
      </div>
      {(nameKeys
        ? ["qwertyuiop", "asdfghjkl", "zxcvbnm"]
        : ["1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm"]
      ).map((row) => (
        <div className="key-row" key={row}>
          {row.split("").map((letter) => (
            <button type="button" key={letter} onClick={() => onType(letter)}>
              {letter}
            </button>
          ))}
        </div>
      ))}
      <div className="key-row">
        {(nameKeys ? ["-", "’"] : ["_", "."]).map((key) => (
          <button type="button" key={key} onClick={() => onType(key)}>
            {key}
          </button>
        ))}
        <button className="space-key" type="button" onClick={() => onType(" ")}>
          Space
        </button>
        <button
          type="button"
          onClick={() => onType("⌫")}
          aria-label="Backspace"
        >
          ⌫
        </button>
      </div>
    </div>
  );
}
