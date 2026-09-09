export type Accessory = "none" | "bow" | "glasses" | "crown" | "cap";

export const ACCESSORY_OPTIONS: { id: Accessory; label: string; emoji: string }[] = [
  { id: "none", label: "Just me", emoji: "\u2728" },
  { id: "bow", label: "Bow", emoji: "\u{1F380}" },
  { id: "glasses", label: "Glasses", emoji: "\u{1F453}" },
  { id: "crown", label: "Crown", emoji: "\u{1F451}" },
  { id: "cap", label: "Cap", emoji: "\u{1F9E2}" },
];

export const MASCOT_COLORS = ["#7C4DFF", "#FF6F91", "#00C2A8", "#FFB03B", "#FF6B6B", "#4D9DE0"];

/**
 * Renders the "Nubble" mascot as an inline SVG string. Deliberately an original blob/creature
 * design (not the reference app's dog) with a color + accessory slot so kids can customize it --
 * unlocks are tied to mastery (see mastery.ts), never to payment.
 */
export function mascotSvg(color: string, accessory: Accessory, mood: "idle" | "happy" | "sad" = "idle", size = 160): string {
  const eyeY = mood === "sad" ? 78 : 72;
  const mouth =
    mood === "happy"
      ? `<path d="M64 96 Q80 118 96 96" stroke="#2B2140" stroke-width="5" stroke-linecap="round" fill="none"/>`
      : mood === "sad"
      ? `<path d="M64 104 Q80 92 96 104" stroke="#2B2140" stroke-width="5" stroke-linecap="round" fill="none"/>`
      : `<path d="M68 98 Q80 106 92 98" stroke="#2B2140" stroke-width="5" stroke-linecap="round" fill="none"/>`;

  const accessoryMarkup: Record<Accessory, string> = {
    none: "",
    bow: `<g transform="translate(104 40) rotate(18)"><path d="M0 0 L18 -10 L18 10 Z" fill="#FF6F91"/><path d="M0 0 L-18 -10 L-18 10 Z" fill="#FF6F91"/><circle cx="0" cy="0" r="5" fill="#E14D75"/></g>`,
    glasses: `<g stroke="#2B2140" stroke-width="4" fill="rgba(255,255,255,0.35)"><circle cx="60" cy="${eyeY}" r="14"/><circle cx="100" cy="${eyeY}" r="14"/><line x1="74" y1="${eyeY}" x2="86" y2="${eyeY}"/></g>`,
    crown: `<g transform="translate(40 18)"><path d="M0 22 L8 2 L20 16 L32 0 L44 16 L56 2 L64 22 Z" fill="#FFD166" stroke="#E1A700" stroke-width="2"/></g>`,
    cap: `<g transform="translate(40 12)"><path d="M0 26 Q32 -6 64 26 Z" fill="${color}" stroke="#2B2140" stroke-width="3"/><circle cx="32" cy="6" r="5" fill="#FFD166"/></g>`,
  };

  const showEyesRaw = accessory !== "glasses";
  const eyes = showEyesRaw
    ? `<circle cx="60" cy="${eyeY}" r="7" fill="#2B2140"/><circle cx="100" cy="${eyeY}" r="7" fill="#2B2140"/>` +
      `<circle cx="62" cy="${eyeY - 2}" r="2" fill="white"/><circle cx="102" cy="${eyeY - 2}" r="2" fill="white"/>`
    : "";

  return `
  <svg viewBox="0 0 160 160" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Nubble the mascot">
    <defs>
      <radialGradient id="body-grad" cx="35%" cy="30%" r="80%">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="${color}"/>
      </radialGradient>
    </defs>
    <ellipse cx="80" cy="140" rx="46" ry="8" fill="rgba(20,10,40,0.12)"/>
    <path d="M80 20 C118 20 142 52 138 90 C134 128 108 148 80 148 C52 148 26 128 22 90 C18 52 42 20 80 20 Z" fill="url(#body-grad)" />
    <circle cx="46" cy="100" r="10" fill="${color}" opacity="0.9"/>
    <circle cx="114" cy="100" r="10" fill="${color}" opacity="0.9"/>
    <circle cx="60" cy="88" r="6" fill="#FFC2D1" opacity="0.7"/>
    <circle cx="100" cy="88" r="6" fill="#FFC2D1" opacity="0.7"/>
    ${eyes}
    ${mouth}
    ${accessoryMarkup[accessory]}
  </svg>`;
}
