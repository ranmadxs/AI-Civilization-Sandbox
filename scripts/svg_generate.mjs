import { createServer } from "vite";
import { mkdirSync, existsSync, readdirSync, writeFileSync } from "node:fs";

const projectRoot = new URL("..", import.meta.url).pathname;
const seed = "init_world_004_11_09_2026";
const nationCount = 6;

function nextExecutionNumber() {
  const execDir = `${projectRoot}target/images/svg_generate`;
  let maxNum = 0;
  if (existsSync(execDir)) {
    const entries = readdirSync(execDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && /^execution_\d{4}$/.test(entry.name)) {
        const num = parseInt(entry.name.replace("execution_", ""), 10);
        if (num > maxNum) maxNum = num;
      }
    }
  }
  const next = maxNum + 1;
  return String(next).padStart(4, "0");
}

const execNum = nextExecutionNumber();
const outputDir = `${projectRoot}target/images/svg_generate/execution_${execNum}`;
mkdirSync(outputDir, { recursive: true });

const server = await createServer({
  appType: "custom",
  configFile: undefined,
  logLevel: "error",
  server: { middlewareMode: true },
  root: "src",
});

const modules = await Promise.all([
  server.ssrLoadModule("/world/buildDemoWorld.ts"),
  server.ssrLoadModule("/world/modelConfig.ts"),
]);
const buildDemoWorld = modules[0].buildDemoWorld;
const { buildDefaultNationModelConfigs } = modules[1];

const world = buildDemoWorld(seed, { nationCount, provincesPerNation: 1 });
buildDefaultNationModelConfigs(world);

function generateWorldSVG(world) {
  const TILE_SIZE = 10;
  const W = world.width + 2;
  const H = world.height + 2;
  const terrainColors = { ocean: "#315f8f", coast: "#4a89a8", plain: "#88a95f", forest: "#477457", hill: "#9a8d65", mountain: "#7d7f85", desert: "#c9b06b", lake: "#2e7d9e" };
  const padding = 2;

  const tileNationMap = new Map();
  for (const province of world.provinces) {
    if (!province.nationId) continue;
    for (const tile of world.tiles) {
      if (tile.provinceId === province.id) tileNationMap.set(`${tile.x},${tile.y}`, province.nationId);
    }
  }

  const allTileKeys = new Set();
  for (const tile of world.tiles) allTileKeys.add(`${tile.x},${tile.y}`);
  for (const [tileKey] of tileNationMap) allTileKeys.delete(tileKey);

  const nationTiles = {};
  for (const [tileKey, nid] of tileNationMap) {
    if (!nationTiles[nid]) nationTiles[nid] = [];
    nationTiles[nid].push(tileKey);
  }
  if (allTileKeys.size > 0) nationTiles["__neutral__"] = [...allTileKeys];

  const mapPixelW = W * TILE_SIZE;
  const mapPixelH = H * TILE_SIZE;
  let svg = `<svg id="map-svg" xmlns="http://www.w3.org/2000/svg" width="${mapPixelW}" height="${mapPixelH}" viewBox="0 0 ${mapPixelW} ${mapPixelH}" style="border:none;overflow:hidden;display:block;width:980px;height:660px">`;
  svg += `<rect x="0" y="0" width="${mapPixelW}" height="${mapPixelH}" fill="#132028"/>`;

  for (const tile of world.tiles) svg += `<rect x="${(padding + tile.x) * TILE_SIZE}" y="${(padding + tile.y) * TILE_SIZE}" width="${TILE_SIZE}" height="${TILE_SIZE}" fill="${terrainColors[tile.terrain] || "#333"}"/>`;
    for (const tile of world.tiles) { if (tile.river) svg += `<rect x="${(padding + tile.x) * TILE_SIZE}" y="${(padding + tile.y) * TILE_SIZE}" width="${TILE_SIZE}" height="${TILE_SIZE}" fill="#1a5276" opacity="0.7"/>`; }

  for (const nid of Object.keys(nationTiles).sort()) {
    const nation = world.nationById.get(nid);
    const color = nation ? nation.color : "#888";
    const name = nation ? nation.name : "Neutral";
    const opacity = nid === "__neutral__" ? 0.1 : 0.45;
    svg += `<g id="nation-${nid}" data-name="${name}" data-color="${color}">`;
    for (const tileKey of nationTiles[nid]) {
      const [tx, ty] = tileKey.split(",").map(Number);
      const sx = (padding + tx) * TILE_SIZE;
      const sy = (padding + ty) * TILE_SIZE;
      const isNeutral = nid === "__neutral__";
      const strokeAttr = isNeutral ? "" : ` stroke="${color}" stroke-opacity="1" stroke-width="1"`;
      svg += `<rect x="${sx}" y="${sy}" width="${TILE_SIZE}" height="${TILE_SIZE}" fill="${color}" opacity="${opacity}"${strokeAttr} data-nation="${nid}"/>`;
      if (!isNeutral) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ntx = tx + dx, nty = ty + dy;
          const neighborNid = tileNationMap.get(`${ntx},${nty}`);
          if (neighborNid !== nid) {
            if (dx === 1) svg += `<line x1="${sx + TILE_SIZE}" y1="${sy}" x2="${sx + TILE_SIZE}" y2="${sy + TILE_SIZE}" stroke="${color}" stroke-opacity="1" stroke-width="2" data-nation="${nid}"/>`;
            else if (dx === -1) svg += `<line x1="${sx}" y1="${sy}" x2="${sx}" y2="${sy + TILE_SIZE}" stroke="${color}" stroke-opacity="1" stroke-width="2" data-nation="${nid}"/>`;
            else if (dy === 1) svg += `<line x1="${sx}" y1="${sy + TILE_SIZE}" x2="${sx + TILE_SIZE}" y2="${sy + TILE_SIZE}" stroke="${color}" stroke-opacity="1" stroke-width="2" data-nation="${nid}"/>`;
            else if (dy === -1) svg += `<line x1="${sx}" y1="${sy}" x2="${sx + TILE_SIZE}" y2="${sy}" stroke="${color}" stroke-opacity="1" stroke-width="2" data-nation="${nid}"/>`;
          }
        }
      }
    }
    svg += `</g>`;
  }

  svg += `
  <defs>
    <filter id="neon-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <g id="neon-borders" opacity="0">
    ${Object.keys(nationTiles).filter(nid => nid !== "__neutral__").map(nid => {
      const nation = world.nationById.get(nid);
      if (!nation) return "";
      const color = nation.color;
      const tiles = nationTiles[nid];
      let edges = [];
      for (const tileKey of tiles) {
        const [tx, ty] = tileKey.split(",").map(Number);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ntx = tx + dx, nty = ty + dy;
          const neighborNid = tileNationMap.get(`${ntx},${nty}`);
          if (neighborNid !== nid) {
            const sx = (padding + tx) * TILE_SIZE;
            const sy = (padding + ty) * TILE_SIZE;
            if (dx === 1) edges.push(`<line x1="${sx + TILE_SIZE}" y1="${sy}" x2="${sx + TILE_SIZE}" y2="${sy + TILE_SIZE}" stroke="${color}" stroke-width="3" filter="url(#neon-glow)" data-nation="${nid}"/>`);
            else if (dx === -1) edges.push(`<line x1="${sx}" y1="${sy}" x2="${sx}" y2="${sy + TILE_SIZE}" stroke="${color}" stroke-width="3" filter="url(#neon-glow)" data-nation="${nid}"/>`);
            else if (dy === 1) edges.push(`<line x1="${sx}" y1="${sy + TILE_SIZE}" x2="${sx + TILE_SIZE}" y2="${sy + TILE_SIZE}" stroke="${color}" stroke-width="3" filter="url(#neon-glow)" data-nation="${nid}"/>`);
            else if (dy === -1) edges.push(`<line x1="${sx}" y1="${sy}" x2="${sx + TILE_SIZE}" y2="${sy}" stroke="${color}" stroke-width="3" filter="url(#neon-glow)" data-nation="${nid}"/>`);
          }
        }
      }
      return edges.join("");
    }).join("\n")}
  </g>
  <script>
    var neonGroup = document.getElementById('neon-borders');
    if (neonGroup) {
      var opacity = 0.3;
      var dir = 1;
      setInterval(function() {
        opacity += 0.02 * dir;
        if (opacity > 0.8) { opacity = 0.8; dir = -1; }
        if (opacity < 0.1) { opacity = 0.1; dir = 1; }
        neonGroup.setAttribute('opacity', opacity);
      }, 50);
    }
  <\/script>
  `;

  for (const city of world.cities) {
    const x = city.x * TILE_SIZE + TILE_SIZE / 2, y = city.y * TILE_SIZE + TILE_SIZE / 2;
    const nation = world.nationById.get(city.nationId);
    svg += `<circle cx="${x}" cy="${y}" r="${city.isCapital ? 5 : 3}" fill="${nation ? nation.color : "#fff"}" opacity="0.9"/>`;
  }

  const deadNations = [];
  for (const nation of world.nations) {
    const capitalCity = nation.capitalCityId ? world.cityById.get(nation.capitalCityId) : undefined;
    const capitalProvince = world.provinceById.get(nation.capitalProvinceId);
    const cx = (capitalCity?.x ?? capitalProvince?.centerX) ?? 0;
    const cy = (capitalCity?.y ?? capitalProvince?.centerY) ?? 0;
    const capitalTileKey = `${cx},${cy}`;
    const ownsCapitalTile = capitalCity && tileNationMap.get(capitalTileKey) === nation.id;
    svg += `<text x="${cx * TILE_SIZE + TILE_SIZE * 0.7}" y="${cy * TILE_SIZE - TILE_SIZE * 0.9}" fill="#fff" font-size="12" font-weight="bold" stroke="none">${nation.name}</text>`;
    if ((!ownsCapitalTile && world.cities.filter((c) => c.nationId === nation.id).length === 0) || world.provinces.filter((p) => p.nationId === nation.id).length === 0) {
      deadNations.push(nation.id);
      const bx = cx * TILE_SIZE + TILE_SIZE * 0.7;
      const by = cy * TILE_SIZE - TILE_SIZE * 0.9;
      svg += `<g id="dead-${nation.id}" transform="translate(${bx},${by})"><circle cx="0" cy="-2" r="7"/><circle cx="-3" cy="-4" r="2.5" fill="#1a1a1a"/><circle cx="3" cy="-4" r="2.5" fill="#1a1a1a"/><path d="M-2,2 Q0,5 2,2" fill="none" stroke="#1a1a1a" stroke-width="1"/><line x1="-5" y1="5" x2="-2" y2="9" stroke="#ff0000" stroke-width="2.5" stroke-linecap="round"/><line x1="5" y1="5" x2="2" y2="9" stroke="#ff0000" stroke-width="2.5" stroke-linecap="round"/></g>`;
    }
  }

  const hasDead = deadNations.length > 0;
  const nationList = world.nations.map(n => { const isDead = deadNations.includes(n.id); return `<label style="color:${isDead ? "#ff4444" : n.color};margin-right:16px;cursor:pointer"><input type="checkbox" checked onchange="toggleNation('${n.id}')"> ${isDead ? "💀 " + n.name : n.name}</label>`; }).join(" ") +
     (hasDead ? ` <label style="color:#ff4444;margin-right:16px;cursor:pointer"><input type="checkbox" checked onchange="toggleDead()"> 💀 Naciones Muertas</label>` : "");
  svg += `</svg>`;
  return { svg, deadNations, mapPixelW, mapPixelH };
}

const { svg: svgContent, deadNations, mapPixelW, mapPixelH } = generateWorldSVG(world);
const hasDead = deadNations.length > 0;
const nationList = world.nations.map(n => { const isDead = deadNations.includes(n.id); return `<label style="color:${isDead ? "#ff4444" : n.color};margin-right:16px;cursor:pointer"><input type="checkbox" checked onchange="toggleNation('${n.id}')"> ${isDead ? "💀 " + n.name : n.name}</label>`; }).join(" ") +
   (hasDead ? ` <label style="color:#ff4444;margin-right:16px;cursor:pointer"><input type="checkbox" checked onchange="toggleDead()"> 💀 Naciones Muertas</label>` : "");
const deadScript = hasDead ? `
function toggleDead() {
  var checked = document.querySelector('input[onchange="toggleDead()"]').checked;
  ${hasDead.map(id => `document.getElementById('dead-${id}').style.display = checked ? '' : 'none';`).join('\n')}
}` : '';

const htmlContent = `<!DOCTYPE html><html><head><style>
  body{margin:0;background:#132028;display:flex;justify-content:center;align-items:center;width:100vw;height:100vh;overflow:hidden;font-family:Arial,sans-serif}
  #map-container{position:relative;width:980px;height:660px;overflow:hidden}
  #map-svg{width:980px;height:660px;display:block;cursor:grab}
  #map-svg:active{cursor:grabbing}
  #map-frame{position:absolute;top:0;left:0;width:980px;height:660px;border:2px solid #49b7c9;box-shadow:0 0 15px rgba(73,183,201,0.6),0 0 30px rgba(73,183,201,0.3),inset 0 0 15px rgba(73,183,201,0.2);pointer-events:none;z-index:10;border-radius:2px}
  #map-frame::before{content:'';position:absolute;top:-4px;left:-4px;right:-4px;bottom:-4px;border:1px solid rgba(73,183,201,0.3);border-radius:4px;pointer-events:none}
  #map-frame::after{content:'';position:absolute;top:8px;left:8px;right:8px;bottom:8px;border:1px solid rgba(73,183,201,0.15);border-radius:2px;pointer-events:none}
  #zoom-controls{position:fixed;bottom:20px;right:20px;z-index:200;display:flex;flex-direction:column;gap:8px}
  #zoom-controls button{width:40px;height:40px;border-radius:8px;border:2px solid #58a6ff;background:#161b22;color:#58a6ff;font-size:20px;font-weight:bold;cursor:pointer;display:flex;justify-content:center;align-items:center}
  #zoom-controls button:hover{background:#58a6ff;color:#132028}
  #zoom-info{position:fixed;bottom:20px;left:20px;z-index:200;background:rgba(0,0,0,0.85);color:#58a6ff;padding:10px 16px;border-radius:8px;font-size:13px;border:1px solid #333}
  #zoom-info span{color:#e6edf3;font-weight:bold}
  #nation-overlay{position:fixed;top:10px;left:10px;z-index:100;background:rgba(0,0,0,0.85);padding:12px;border-radius:6px;font-family:Arial,sans-serif;font-size:13px;color:#fff;border:1px solid #333}
</style></head><body>
<div id="map-container">${svgContent}<div id="map-frame"></div></div>
<div id="zoom-info">Zoom: <span id="zoom-pct">100</span>% | Tiles visibles: <span id="zoom-tiles">0</span></div>
<div id="zoom-controls"><button onclick="zoomIn()">+</button><button onclick="zoomOut()">-</button></div>
<div id="nation-overlay">${nationList}</div>
<script>
  const mapPixelW = ${mapPixelW};
  const mapPixelH = ${mapPixelH};
  const svg = document.getElementById('map-svg');
  const zoomPct = document.getElementById('zoom-pct');
  const zoomTiles = document.getElementById('zoom-tiles');
  const svgContainer = document.getElementById('map-container');
  const svgW = mapPixelW;
  const svgH = mapPixelH;
  const FRAME_W = mapPixelW;
  const FRAME_H = mapPixelH;
  let scale = 1.0;
  let panX = 0, panY = 0;
  let dragging = false, dragStartX, dragStartY, panStartX, panStartY;
  const tileSize = 10;
  svg.addEventListener('mousedown', function(e) { dragging = true; dragStartX = e.clientX; dragStartY = e.clientY; panStartX = panX; panStartY = panY; svg.style.cursor = 'grabbing'; });
  window.addEventListener('mousemove', function(e) { if (!dragging) return; panX = panStartX - (e.clientX - dragStartX); panY = panStartY - (e.clientY - dragStartY); updateZoom(); });
  window.addEventListener('mouseup', function() { dragging = false; svg.style.cursor = 'grab'; });
  function clampPan(vbW, vbH) {
    const ox = (vbW - svgW) / 2;
    const oy = (vbH - svgH) / 2;
    const minPanX = ox;
    const maxPanX = svgW - vbW + ox;
    const minPanY = oy;
    const maxPanY = svgH - vbH + oy;
    if (maxPanX >= minPanX) {
      return { panX: Math.max(minPanX, Math.min(maxPanX, panX)), panY: Math.max(minPanY, Math.min(maxPanY, panY)) };
    }
    return { panX: minPanX, panY: minPanY };
  }
  function updateZoom() {
    const vbW = svgW / scale;
    const vbH = svgH / scale;
    const ox = (vbW - svgW) / 2;
    const oy = (vbH - svgH) / 2;
    const clamped = clampPan(vbW, vbH);
    panX = clamped.panX; panY = clamped.panY;
    svg.setAttribute('viewBox', (panX - ox) + ' ' + (panY - oy) + ' ' + vbW + ' ' + vbH);
    zoomPct.textContent = Math.round(scale * 100);
    zoomTiles.textContent = Math.ceil(vbW / tileSize) + 'x' + Math.ceil(vbH / tileSize) + ' (' + (Math.ceil(vbW / tileSize) * Math.ceil(vbH / tileSize)) + ')';
  }
  function zoomIn() { scale = Math.min(scale + 0.05, 5); updateZoom(); }
  function zoomOut() { scale = Math.max(scale - 0.05, 0.2); updateZoom(); }
  document.addEventListener('wheel', function(e) {
    e.preventDefault();
    const dir = Math.sign(e.deltaY);
    scale = dir < 0 ? Math.min(scale + 0.05, 5) : Math.max(scale - 0.05, 0.2);
    updateZoom();
  }, { passive: false });
  function toggleNation(nid) {
    var g = document.getElementById('nation-' + nid);
    if (g) g.style.display = g.style.display === 'none' ? '' : 'none';
  }
  ${deadScript}
  updateZoom();
<\/script>
</body></html>`;

writeFileSync(`${outputDir}/map_year_0.html`, htmlContent);
await server.close();
console.log(`Mapa generado: ${outputDir}/map_year_0.html`);
console.log(`Naciones: ${world.nations.map(n => n.name).join(', ')}`);
