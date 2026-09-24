// Petits schémas SVG dessinés en code (aucune image externe, aucun appel API).

function rectSVG(L, l, unit) {
  const scale = Math.min(200 / L, 110 / l, 16);
  const w = L * scale, h = l * scale, x = 20, y = 12;
  return `<svg viewBox="0 0 ${w + 90} ${h + 46}" width="100%" style="max-width:280px" role="img" aria-label="Rectangle de ${L} ${unit} sur ${l} ${unit}">
    <rect class="fig-shape" x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/>
    <text class="fig-text" x="${x + w / 2}" y="${y + h + 24}" text-anchor="middle">${L} ${unit}</text>
    <text class="fig-text" x="${x + w + 10}" y="${y + h / 2 + 5}">${l} ${unit}</text>
  </svg>`;
}

function triSVG(base, hauteur, unit) {
  const scale = Math.min(180 / base, 110 / hauteur, 10);
  const w = base * scale, h = hauteur * scale, x = 60, y = 12;
  return `<svg viewBox="0 0 ${w + x + 20} ${h + 46}" width="100%" style="max-width:280px" role="img" aria-label="Triangle rectangle de base ${base} ${unit} et hauteur ${hauteur} ${unit}">
    <polygon class="fig-shape" points="${x},${y} ${x},${y + h} ${x + w},${y + h}"/>
    <path class="fig-mark" d="M${x} ${y + h - 14} h14 v14"/>
    <text class="fig-text" x="${x + w / 2}" y="${y + h + 24}" text-anchor="middle">${base} ${unit}</text>
    <text class="fig-text" x="${x - 8}" y="${y + h / 2 + 5}" text-anchor="end">${hauteur} ${unit}</text>
  </svg>`;
}

function paveSVG(L, l, h, unit) {
  const scale = Math.min(160 / L, 90 / h, 14);
  const w = L * scale, H = h * scale;
  const dx = Math.min(l * scale * 0.6, 50), dy = Math.min(l * scale * 0.45, 36);
  const x = 50, y = 12 + dy;
  return `<svg viewBox="0 0 ${x + w + dx + 70} ${y + H + 34}" width="100%" style="max-width:280px" role="img" aria-label="Pavé droit de ${L} ${unit} sur ${l} ${unit} sur ${h} ${unit}">
    <path class="fig-shape" d="M${x} ${y} h${w} v${H} h${-w}z"/>
    <path class="fig-shape" d="M${x} ${y} l${dx} ${-dy} h${w} l${-dx} ${dy}z"/>
    <path class="fig-shape" d="M${x + w} ${y} l${dx} ${-dy} v${H} l${-dx} ${dy}z"/>
    <text class="fig-text" x="${x + w / 2}" y="${y + H + 22}" text-anchor="middle">${L} ${unit}</text>
    <text class="fig-text" x="${x + w + dx / 2 + 6}" y="${y + H - dy / 2 + 16}">${l} ${unit}</text>
    <text class="fig-text" x="${x - 6}" y="${y + H / 2 + 5}" text-anchor="end">${h} ${unit}</text>
  </svg>`;
}

function angleSVG(mesure) {
  const cx = 20, cy = 100, r = 70;
  const rad = (mesure * Math.PI) / 180;
  const x2 = cx + r * Math.cos(-rad), y2 = cy + r * Math.sin(-rad);
  const largeArc = mesure > 180 ? 1 : 0;
  const arcR = 26;
  const ax = cx + arcR, ay = cy;
  const bx = cx + arcR * Math.cos(-rad), by = cy + arcR * Math.sin(-rad);
  return `<svg viewBox="0 0 160 120" width="100%" style="max-width:220px" role="img" aria-label="Angle de ${mesure} degrés">
    <line class="fig-axis" x1="${cx}" y1="${cy}" x2="${cx + r}" y2="${cy}"/>
    <line class="fig-axis" x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}"/>
    <path class="fig-mark" d="M${ax} ${ay} A${arcR} ${arcR} 0 ${largeArc} 0 ${bx} ${by}" fill="none"/>
  </svg>`;
}

function symetrieSVG() {
  const cx = 100, cy = 60, ax = 40, ay = 30;
  const apx = 2 * cx - ax, apy = 2 * cy - ay;
  return `<svg viewBox="0 0 200 120" width="100%" style="max-width:240px" role="img" aria-label="Symétrie centrale de centre O">
    <line class="fig-axis" x1="${ax}" y1="${ay}" x2="${apx}" y2="${apy}"/>
    <circle class="fig-point" cx="${cx}" cy="${cy}" r="4"/>
    <text class="fig-text" x="${cx + 8}" y="${cy - 6}">O</text>
    <circle class="fig-point" cx="${ax}" cy="${ay}" r="4"/>
    <text class="fig-text" x="${ax - 14}" y="${ay - 6}">A</text>
    <circle class="fig-point" cx="${apx}" cy="${apy}" r="4"/>
    <text class="fig-text" x="${apx + 8}" y="${apy + 14}">A'</text>
  </svg>`;
}
