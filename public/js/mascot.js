function mascotSVG(size = 78) {
  return `<svg class="mascot bob" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="Mascotte de Click&amp;Learn">
    <circle cx="30" cy="18" r="7" fill="#FF6B57"/>
    <circle cx="70" cy="18" r="7" fill="#FF6B57"/>
    <path d="M20 45 Q20 15 50 15 Q80 15 80 45 L80 65 Q80 90 50 90 Q20 90 20 65 Z" fill="#FF6B57" stroke="#24124F" stroke-width="3"/>
    <path d="M20 60 Q50 68 80 60 L80 65 Q80 90 50 90 Q20 90 20 65 Z" fill="#FFC53D" stroke="#24124F" stroke-width="3"/>
    <circle cx="38" cy="42" r="9" fill="#fff" stroke="#24124F" stroke-width="2.5"/>
    <circle cx="62" cy="42" r="9" fill="#fff" stroke="#24124F" stroke-width="2.5"/>
    <circle cx="39" cy="43" r="4" fill="#24124F"/>
    <circle cx="63" cy="43" r="4" fill="#24124F"/>
    <circle cx="26" cy="52" r="5" fill="#FF9E8F" opacity="0.7"/>
    <circle cx="74" cy="52" r="5" fill="#FF9E8F" opacity="0.7"/>
    <path d="M40 58 Q50 66 60 58" fill="none" stroke="#24124F" stroke-width="3" stroke-linecap="round"/>
  </svg>`;
}

function fireConfetti() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.getElementById('confetti');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ['#6C4DFF', '#FF6B57', '#FFC53D', '#22C48A', '#3D8BFF', '#FF5FA2'];
  const pieces = Array.from({ length: 70 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * 120,
    r: 4 + Math.random() * 4,
    color: colors[Math.floor(Math.random() * colors.length)],
    vx: -2 + Math.random() * 4,
    vy: 2.5 + Math.random() * 3,
    rot: Math.random() * Math.PI,
    vr: -0.2 + Math.random() * 0.4
  }));

  let frame = 0;
  const maxFrames = 90;

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      ctx.restore();
    });
    frame++;
    if (frame < maxFrames) {
      requestAnimationFrame(tick);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
  tick();
}
