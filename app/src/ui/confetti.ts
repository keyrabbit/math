/** Lightweight DOM/CSS confetti burst -- no canvas/deps needed, kept small & dependency-free. */
export function burstConfetti(target: HTMLElement, count = 24): void {
  const colors = ["#FFD166", "#FF6F91", "#7C4DFF", "#00C2A8", "#4D9DE0", "#FF6B6B"];
  const rect = target.getBoundingClientRect();
  const container = document.createElement("div");
  container.className = "confetti-layer";
  document.body.appendChild(container);

  for (let i = 0; i < count; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    const angle = Math.random() * Math.PI * 2;
    const distance = 60 + Math.random() * 120;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance - 60;
    piece.style.setProperty("--dx", `${dx}px`);
    piece.style.setProperty("--dy", `${dy}px`);
    piece.style.setProperty("--rot", `${Math.random() * 720 - 360}deg`);
    piece.style.left = `${rect.left + rect.width / 2}px`;
    piece.style.top = `${rect.top + rect.height / 2}px`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${Math.random() * 80}ms`;
    container.appendChild(piece);
  }

  setTimeout(() => container.remove(), 1400);
}
