import React, { useEffect, useRef } from "react";

export function Icon({ name, size = 20, ...props }) {
  const paths = {
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a6 6 0 0 0-12 0v2m14-8a5 5 0 0 1 4 5v3M16 3a4 4 0 0 1 0 8" />
        <circle cx="10" cy="7" r="4" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
      </>
    ),
    logout: (
      <>
        <path d="M9 21H4V3h5m1 9h11m-4-4 4 4-4 4" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    hidden: (
      <>
        <path d="m3 3 18 18M10 5a13 13 0 0 1 12 7 17 17 0 0 1-3 4M6 6a17 17 0 0 0-4 6s3 7 10 7a13 13 0 0 0 5-1" />
        <path d="M10 10a3 3 0 0 0 4 4" />
      </>
    ),
    search: (
      <>
        <circle cx="10" cy="10" r="7" />
        <path d="m15 15 6 6" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M16 3v4M8 3v4M3 11h18M8 15h2m4 0h2m-8 3h2" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    list: (
      <>
        <path d="M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    left: <path d="m14 6-6 6 6 6" />,
    right: <path d="m10 6 6 6-6 6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    pin: (
      <>
        <path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    music: (
      <>
        <path d="M9 18V5l11-2v13M9 9l11-2" />
        <ellipse cx="6" cy="18" rx="3" ry="3" />
        <ellipse cx="17" cy="16" rx="3" ry="3" />
      </>
    ),
    medical: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M9 5V3h6v2M12 10v6M9 13h6" />
      </>
    ),
    coffee: (
      <>
        <path d="M4 9h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5ZM17 10h2a3 3 0 0 1 0 6h-2M7 3v2M11 2v3M15 3v2" />
      </>
    ),
    leaf: (
      <>
        <path d="M20 3C9 1 2 8 5 15s16 6 15-12Z" />
        <path d="M4 21 15 10M9 16v-5m0 5h5" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-1.3.7-1.7 1-1.7 2.2M12 17h.01" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    edit: (
      <>
        <path d="m16 3 5 5-12 12-6 1 1-6Z M13 6l5 5" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />
      </>
    ),
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name] || paths.calendar}
    </svg>
  );
}

export function Modal({ children, titleId, onClose, busy = false }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const target =
      ref.current.querySelector("input") || ref.current.querySelector("button");
    target?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => {
        if (previous?.isConnected) previous.focus();
        else document.querySelector(".page-heading .primary-button")?.focus();
      });
    };
  }, []);
  function handleKey(event) {
    if (event.key === "Escape" && !busy) {
      event.stopPropagation();
      closeRef.current();
    }
    if (event.key === "Tab") {
      const elements = [
        ...ref.current.querySelectorAll(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        ),
      ];
      if (!elements.length) {
        event.preventDefault();
        ref.current.focus();
        return;
      }
      const first = elements[0],
        last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={ref}
        onKeyDown={handleKey}
      >
        {children}
      </section>
    </div>
  );
}
