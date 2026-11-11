/** Experience Centre lockup: a black geometric square beside a stacked
 * wordmark, as described in the kiosk brand guide. This is a stand-in drawn
 * in code; replace it with the Centre's original logo artwork when supplied. */
export function KioskLogo() {
  return (
    <div className="kiosk-logo" role="img" aria-label="GMC Experience Centre">
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <rect width="48" height="48" fill="#171717" />
        <path
          d="M24 9 39 24 24 39 9 24Z M24 17 31 24 24 31 17 24Z"
          fill="none"
          stroke="#F3F1EE"
          strokeWidth="2.2"
        />
      </svg>
      <span aria-hidden="true">
        <b>GMC</b>
        <small>Experience</small>
        <small>Centre</small>
      </span>
    </div>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M15 5 8 12l7 7"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="square"
      />
    </svg>
  );
}
function House() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

/** Shared header for every kiosk view: logo top left on a light surface,
 * Back and Home within reach on the right, and the screen title below. */
export function KioskHeader({
  title,
  subtitle,
  onBack,
  backLabel = "Back",
  onHome,
  disabled = false,
}: {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  onHome?: () => void;
  disabled?: boolean;
}) {
  return (
    <header className="kiosk-header">
      <div className="kiosk-header-bar">
        <KioskLogo />
        {(onBack || onHome) && (
          <nav className="kiosk-nav" aria-label="Kiosk navigation">
            {onBack && (
              <button
                type="button"
                className="kiosk-button kiosk-secondary on-light"
                onClick={onBack}
                disabled={disabled}
              >
                <Arrow />
                {backLabel}
              </button>
            )}
            {onHome && (
              <button
                type="button"
                className="kiosk-button kiosk-secondary on-light"
                onClick={onHome}
                disabled={disabled}
              >
                <House />
                Home
              </button>
            )}
          </nav>
        )}
      </div>
      {title && (
        <div className="kiosk-title">
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
      )}
    </header>
  );
}
