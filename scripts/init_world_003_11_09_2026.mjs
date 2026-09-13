#!/usr/bin/env node

import { createServer } from "vite";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";

const seed = "init_world_003_11_09_2026";
const yearsToRun = 200;
const monthsToRun = yearsToRun * 12;
const steps = 5;
const snapshotMonths = Array.from({ length: steps }, (_, i) => Math.round((i / (steps - 1)) * monthsToRun));
const nationCount = 6;

function nextExecutionNumber() {
  const counterFile = `target/images/.execution_counter_${seed}`;
  let next = 1;
  if (existsSync(counterFile)) {
    try { next = parseInt(readFileSync(counterFile, "utf8").trim()) + 1; } catch { next = 1; }
  }
  writeFileSync(counterFile, String(next));
  return String(next).padStart(4, "0");
}

const execNum = nextExecutionNumber();
const outputDir = `target/images/${seed}/execution_${execNum}`;
const reportPath = `${outputDir}/report.html`;

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
  server.ssrLoadModule("/world/turnSimulation.ts"),
  server.ssrLoadModule("/world/war.ts"),
  server.ssrLoadModule("/world/cityEconomy.ts"),
]);
const buildDemoWorld = modules[0].buildDemoWorld;
const advanceSimulationTurn = modules[1].advanceSimulationTurn;
const createInitialSimulationState = modules[1].createInitialSimulationState;
const getNationWarSummary = modules[2].getNationWarSummary;
const calculateNationCityEconomy = modules[3].calculateNationCityEconomy;

const world = buildDemoWorld(seed, { nationCount });

function findMissingNationResources(world) {
  const resourceTypes = ["grain", "timber", "iron", "coal", "oil"];
  return world.nations.flatMap((nation) => {
    const provinceIds = new Set(world.provinces.filter((province) => province.nationId === nation.id).map((province) => province.id));
    const resources = new Set(world.tiles.filter((tile) => tile.provinceId && provinceIds.has(tile.provinceId)).map((tile) => tile.resource).filter(Boolean));
    return resourceTypes.filter((resource) => !resources.has(resource)).map((resource) => `${nation.name} missing ${resource}`);
  });
}

const missingResources = findMissingNationResources(world);
if (missingResources.length > 0) {
  throw new Error(`Recursos faltantes: ${missingResources.join("; ")}`);
}

const nationTurnExecutor = async () => undefined;
let simulation = createInitialSimulationState(world);

const nationHistory = {};
for (const n of world.nations) {
  nationHistory[n.id] = [];
}

function recordSnapshot(month) {
  for (const n of world.nations) {
    const cities = world.cities.filter((c) => c.nationId === n.id);
    const provinces = world.provinces.filter((p) => p.nationId === n.id);
    const economy = calculateNationCityEconomy(n.id, world);
    const provIds = new Set(provinces.map((p) => p.id));
    const tileCount = world.tiles.filter((t) => t.provinceId && provIds.has(t.provinceId)).length;
    nationHistory[n.id].push({ month, population: economy.population, provinces: provinces.length, tiles: tileCount, cities: cities.length });
  }
}

function getTechnologyEra(avgCityLevel) {
  if (avgCityLevel < 1.5) return "Primitive";
  if (avgCityLevel < 2.5) return "Classical";
  if (avgCityLevel < 3.5) return "Medieval";
  if (avgCityLevel < 4.5) return "Early Modern";
  return "Late Modern";
}

function getNationData() {
  return world.nations.map((nation) => {
    const cities = world.cities.filter((c) => c.nationId === nation.id);
    const provinces = world.provinces.filter((p) => p.nationId === nation.id);
    const economy = calculateNationCityEconomy(nation.id, world);
    const stockpile = simulation.nationStockpiles[nation.id];
    const summary = getNationWarSummary(simulation.diplomacy, simulation.military, world, nation.id);
    const provIds = new Set(provinces.map((p) => p.id));
    const tiles = world.tiles.filter((t) => t.provinceId && provIds.has(t.provinceId)).length;
    const avgCityLevel = cities.length > 0 ? cities.reduce((s, c) => s + c.level, 0) / cities.length : 0;
    const history = nationHistory[nation.id] || [];
    const last = history[history.length - 1] || { population: economy.population, tiles };
    const first = history[0] || { population: economy.population, tiles };
    return {
      name: nation.name, id: nation.id, color: nation.color,
      provinces: provinces.length, tiles, cities: cities.length,
      population: economy.population, avgCityLevel,
      technologyEra: getTechnologyEra(avgCityLevel),
      soldiers: summary.totalSoldiers, gold: Math.round(stockpile?.gold ?? 0),
      activeWars: summary.activeWars.length,
      popGrowth: last.population - first.population,
      territoryGrowth: last.tiles - first.tiles,
    };
  });
}

function generateWorldSVG(world) {
  const TILE_SIZE = 10;
  const W = world.width, H = world.height;
  const terrainColors = { ocean: "#315f8f", coast: "#4a89a8", plain: "#88a95f", forest: "#477457", hill: "#9a8d65", mountain: "#7d7f85", desert: "#c9b06b" };
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * TILE_SIZE}" height="${H * TILE_SIZE}" viewBox="0 0 ${W * TILE_SIZE} ${H * TILE_SIZE}">`;
  for (const tile of world.tiles) {
    svg += `<rect x="${tile.x * TILE_SIZE}" y="${tile.y * TILE_SIZE}" width="${TILE_SIZE}" height="${TILE_SIZE}" fill="${terrainColors[tile.terrain] || "#333"}"/>`;
  }
  for (const province of world.provinces) {
    const nation = world.nationById.get(province.nationId);
    const nc = nation ? nation.color : "#fff";
    for (const tile of world.tiles) {
      if (tile.provinceId === province.id) {
        svg += `<rect x="${tile.x * TILE_SIZE + 1}" y="${tile.y * TILE_SIZE + 1}" width="${TILE_SIZE - 2}" height="${TILE_SIZE - 2}" fill="${nc}" opacity="0.4"/>`;
      }
    }
  }
  for (const city of world.cities) {
    const x = city.x * TILE_SIZE + TILE_SIZE / 2, y = city.y * TILE_SIZE + TILE_SIZE / 2;
    const nation = world.nationById.get(city.nationId);
    const color = nation ? nation.color : "#fff";
    svg += `<circle cx="${x}" cy="${y}" r="${city.isCapital ? 5 : 3}" fill="${color}" opacity="0.9"/>`;
  }
  for (const nation of world.nations) {
    const capitalCity = nation.capitalCityId ? world.cityById.get(nation.capitalCityId) : undefined;
    const capitalProvince = world.provinceById.get(nation.capitalProvinceId);
    const cx = (capitalCity?.x ?? capitalProvince?.centerX) ?? 0;
    const cy = (capitalCity?.y ?? capitalProvince?.centerY) ?? 0;
    const tx = cx * TILE_SIZE + TILE_SIZE * 0.7, ty = cy * TILE_SIZE - TILE_SIZE * 0.9;
    svg += `<text x="${tx}" y="${ty}" fill="#fff" font-size="12" font-weight="bold" stroke="#132028" stroke-width="3">${nation.name}</text>`;
  }
  svg += `</svg>`;
  return svg;
}

function monthToYear(month) { return Math.round(month / 12); }

async function captureWorld(world, simulation, month) {
  const year = monthToYear(month);
  const htmlPath = `${outputDir}/map_year_${year}.html`;
  const svgContent = generateWorldSVG(world);
  const htmlContent = `<!DOCTYPE html><html><head><style>body{margin:0;background:#132028;display:flex;justify-content:center;align-items:center;width:100vw;height:100vh}svg{max-width:100vw;max-height:100vh}</style></head><body>${svgContent}</body></html>`;
  writeFileSync(htmlPath, htmlContent);
  return htmlPath;
}

function buildPartialReport(world, simulation, month) {
  const year = monthToYear(month);
  const nations = getNationData();
  const tableRows = nations.map((n) => `
    <tr style="border-bottom:1px solid #333">
      <td style="padding:8px"><span style="color:${n.color};font-weight:bold">${n.name}</span></td>
      <td style="padding:8px;text-align:center">${n.provinces}</td>
      <td style="padding:8px;text-align:center">${n.tiles}</td>
      <td style="padding:8px;text-align:center">${n.cities}</td>
      <td style="padding:8px;text-align:center">${n.population.toLocaleString()}</td>
      <td style="padding:8px;text-align:center">${n.technologyEra}</td>
      <td style="padding:8px;text-align:center">${n.gold.toLocaleString()}</td>
      <td style="padding:8px;text-align:center">${n.soldiers.toLocaleString()}</td>
      <td style="padding:8px;text-align:center">${n.activeWars}</td>
    </tr>`).join("");
  return `<!DOCTYPE html><html><head><style>
    body{font-family:Arial,sans-serif;background:#0d1117;color:#e6edf3;margin:20px}
    h1{color:#58a6ff;text-align:center}
    table{width:100%;border-collapse:collapse;margin:20px auto;max-width:1000px}
    th{background:#161b22;padding:12px;text-align:center;border-bottom:2px solid #58a6ff;color:#58a6ff}
    td{padding:8px;text-align:center;border-bottom:1px solid #21262d}
    .footer{margin-top:40px;color:#8b949e;font-size:12px;text-align:center}
  </style></head><body>
    <h1>World Simulation: Year ${year} (${month} months)</h1>
    <div style="color:#8b949e;text-align:center">Seed: ${seed} | Nations: ${world.nations.length} | Diplomacy: AI-driven</div>
    <table>
      <tr><th>Nation</th><th>Provinces</th><th>Tiles</th><th>Cities</th><th>Population</th><th>Tech Era</th><th>Gold</th><th>Soldiers</th><th>Wars</th></tr>
      ${tableRows}
    </table>
    <div class="footer">AI Civilization Sandbox</div>
  </body></html>`;
}

function buildFinalReport() {
  const nations = getNationData();
  const labels = [];
  for (let i = 0; i <= monthsToRun; i += 5) labels.push(i);
  const datasets = world.nations.map((n) => {
    const data = nationHistory[n.id].map((h) => h.population);
    return { label: n.name, data, borderColor: n.color, backgroundColor: n.color + "20", tension: 0.3, pointRadius: 3 };
  });
  const territoryDatasets = world.nations.map((n) => {
    const data = nationHistory[n.id].map((h) => h.tiles);
    return { label: n.name + " (tiles)", data, borderColor: n.color, backgroundColor: n.color + "20", tension: 0.3, pointRadius: 3 };
  });
  const chartData = JSON.stringify({ labels, datasets });
  const territoryChart = JSON.stringify({ labels, datasets: territoryDatasets });
  const tableRows = nations.map((n) => `
    <tr style="border-bottom:1px solid #333">
      <td style="padding:12px"><span style="color:${n.color};font-weight:bold;font-size:14px">${n.name}</span></td>
      <td style="padding:12px;text-align:center">${n.provinces}</td>
      <td style="padding:12px;text-align:center;background:#161b22;font-weight:bold">${n.tiles.toLocaleString()}</td>
      <td style="padding:12px;text-align:center">${n.cities}</td>
      <td style="padding:12px;text-align:center;font-weight:bold">${n.population.toLocaleString()}</td>
      <td style="padding:12px;text-align:center">${n.technologyEra}</td>
      <td style="padding:12px;text-align:center">${n.gold.toLocaleString()}</td>
      <td style="padding:12px;text-align:center">${n.soldiers.toLocaleString()}</td>
      <td style="padding:12px;text-align:center">${n.activeWars}</td>
      <td style="padding:12px;text-align:center">${n.avgCityLevel.toFixed(1)}</td>
      <td style="padding:12px;text-align:center">${n.popGrowth > 0 ? '+' + n.popGrowth.toLocaleString() : n.popGrowth.toLocaleString()}</td>
      <td style="padding:12px;text-align:center">${n.territoryGrowth > 0 ? '+' + n.territoryGrowth : n.territoryGrowth}</td>
    </tr>`).join("");
  const explanation = `<div style="margin-top:30px;color:#8b949e;font-size:13px;max-width:800px;margin-left:auto;margin-right:auto;line-height:1.8">
    <h3 style="color:#58a6ff">What are Tiles?</h3>
    <p>A <strong>Tile</strong> is the smallest unit of the game world map. The world is a grid of 96×64 = 6,144 tiles.</p>
    <p>Each tile has: terrain type (ocean, coast, plain, forest, hill, mountain, desert), elevation, temperature, moisture, and optionally a resource (grain, timber, iron, coal, oil).</p>
    <p>Tiles belong to <strong>Provinces</strong>, and Provinces belong to <strong>Nations</strong>. So a Nation's <strong>Tiles</strong> count represents all the map squares within its provinces.</p>
    <p><strong>Provinces</strong> = territorial divisions controlled by a nation.</p>
    <p><strong>Cities</strong> = urban centers built on tiles within provinces.</p>
    <p><strong>Population</strong> = total inhabitants across all cities of a nation.</p>
  </div>`;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    body{font-family:Arial,sans-serif;background:#0d1117;color:#e6edf3;margin:0;padding:20px}
    h1{color:#58a6ff;text-align:center;font-size:28px}
    h2{color:#58a6ff;margin-top:40px}
    table{width:100%;border-collapse:collapse;margin:20px auto;max-width:1100px}
    th{background:#161b22;padding:14px;text-align:center;border-bottom:2px solid #58a6ff;color:#58a6ff;font-size:12px}
    td{padding:12px;text-align:center;border-bottom:1px solid #21262d}
    .chart-container{max-width:900px;margin:30px auto;padding:20px;background:#161b22;border-radius:8px}
    .info{color:#8b949e;font-size:14px;text-align:center;margin:20px}
    .footer{margin-top:40px;color:#8b949e;font-size:12px;text-align:center;padding:20px}
  </style><script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script></head><body>
    <h1>🌍 World Simulation: ${seed}</h1>
    <div class="info">Seed: ${seed} | Duration: ${monthsToRun} months (${monthsToRun / 12} years) | Nations: ${world.nations.length} | Diplomacy: AI-driven | Executor: Policy-based</div>
    <h2>⚙️ Simulation Parameters</h2>
    <table>
      <tr><th style="text-align:left">Parameter</th><th>Value</th></tr>
      <tr><td style="text-align:left">Seed</td><td>${seed}</td></tr>
      <tr><td style="text-align:left">Duration</td><td>${monthsToRun} months (${monthsToRun / 12} years)</td></tr>
      <tr><td style="text-align:left">Nations</td><td>${world.nations.length}</td></tr>
      <tr><td style="text-align:left">Nation IDs</td><td>${world.nations.map((n) => n.id).join(', ')}</td></tr>
      <tr><td style="text-align:left">Executor</td><td>async () => undefined (no-op)</td></tr>
      <tr><td style="text-align:left">Diplomacy</td><td>AI-driven (auto via resolveTurn)</td></tr>
      <tr><td style="text-align:left">Snapshots</td><td>${snapshotMonths.map(m => m + 'm (' + Math.round(m/12) + 'y)').join(', ')}</td></tr>
      <tr><td style="text-align:left">Output</td><td>HTML only (no PNG)</td></tr>
      <tr><td style="text-align:left">File</td><td>scripts/init_world_003_11_09_2026.mjs</td></tr>
      <tr><td style="text-align:left">Execution</td><td>execution_${execNum}</td></tr>
    </table>
    <h2>📊 Final Nation Summary</h2>
    <table>
      <tr><th>Nation</th><th>Provinces</th><th>Tiles</th><th>Cities</th><th>Population</th><th>Tech Era</th><th>Gold</th><th>Soldiers</th><th>Wars</th><th>Avg Level</th><th>Pop Growth</th><th>Territory Growth</th></tr>
      ${tableRows}
    </table>
    <div class="chart-container"><canvas id="popChart"></canvas></div>
    <div class="chart-container"><canvas id="territoryChart"></canvas></div>
    ${explanation}
    <div class="footer">Generated by AI Civilization Sandbox | ${new Date().toISOString()}</div>
    <script>
      const popCtx = document.getElementById('popChart').getContext('2d');
      new Chart(popCtx, { type: 'line', data: ${chartData}, options: { responsive: true, plugins: { title: { display: true, text: 'Population Growth Over Time', color: '#58a6ff' }, legend: { labels: { color: '#e6edf3' } } }, scales: { x: { title: { display: true, text: 'Month', color: '#8b949e' }, ticks: { color: '#8b949e' }, grid: { color: '#21262d' } }, y: { title: { display: true, text: 'Population', color: '#8b949e' }, ticks: { color: '#8b949e', callback: v => v.toLocaleString() }, grid: { color: '#21262d' } } } } });
      const terrCtx = document.getElementById('territoryChart').getContext('2d');
      new Chart(terrCtx, { type: 'line', data: ${territoryChart}, options: { responsive: true, plugins: { title: { display: true, text: 'Territory (Tiles) Growth Over Time', color: '#58a6ff' }, legend: { labels: { color: '#e6edf3' } } }, scales: { x: { title: { display: true, text: 'Month', color: '#8b949e' }, ticks: { color: '#8b949e' }, grid: { color: '#21262d' } }, y: { title: { display: true, text: 'Tiles', color: '#8b949e' }, ticks: { color: '#8b949e', callback: v => v.toLocaleString() }, grid: { color: '#21262d' } } } } });
    </script>
  </body></html>`;
}

try {
  mkdirSync(outputDir, { recursive: true });
  const pngPath0 = await captureWorld(world, simulation, 0);
  writeFileSync(`${outputDir}/report_year_0.html`, buildPartialReport(world, simulation, 0));
  const snapshots = [{ month: 0, pngPath: pngPath0 }];
  recordSnapshot(0);

  for (let month = 1; month <= monthsToRun; month += 1) {
    const next = await advanceSimulationTurn(world, simulation, nationTurnExecutor);
    simulation = next;
    if (month % 5 === 0) {
      recordSnapshot(month);
    }
    if (snapshotMonths.includes(month)) {
      const pngPath = await captureWorld(world, simulation, month);
      const year = monthToYear(month);
      const partialReportPath = `${outputDir}/report_year_${year}.html`;
      writeFileSync(partialReportPath, buildPartialReport(world, simulation, month));
      snapshots.push({ month, pngPath });
    }
  }

  writeFileSync(reportPath, buildFinalReport());

  console.log(`\n=== Simulation: ${seed} ===`);
  console.log(`Duration: ${monthsToRun} months (${monthsToRun / 12} years)`);
  console.log(`Nations: ${world.nations.length} | Diplomacy: AI-driven`);
  console.log(`Snapshots: ${snapshots.length} at ${snapshotMonths.map(m => m + "m (" + Math.round(m/12) + "y)").join(', ')}`);
  console.log(`Report: ${reportPath}`);
  console.log(`\n--- Final Stats ---`);
  for (const n of world.nations) {
    const h = nationHistory[n.id];
    const last = h[h.length - 1];
    const first = h[0];
    const avgCityLevel = world.cities.filter((c) => c.nationId === n.id).reduce((s, c) => s + c.level, 0) / Math.max(world.cities.filter((c) => c.nationId === n.id).length, 1);
    console.log(`- ${n.name}: pop=${last.population.toLocaleString()} (+${(last.population - first.population).toLocaleString()}), tiles=${last.tiles}, provinces=${last.provinces}, cities=${last.cities}, era=${getTechnologyEra(avgCityLevel)}`);
  }
} finally {
  await server.close();
}
