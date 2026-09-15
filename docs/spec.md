# AI Civilization Sandbox — Especificación del Repositorio

 **Versión del documento:** 1.0  
**Última actualización:** 2026-09-13  
**Versión del juego:** V1.0.0  
**Licencia:** GPL-2.0-only

---

## 1. Descripción General

**AI Civilization Sandbox** es un juego de simulación de civilización por turnos donde naciones controladas por IA toman decisiones autónomas para desarrollar sus sociedades, competir entre sí y, eventualmente, librar guerras. El jugador actúa como observador del mundo, pudiendo avanzar turnos, observar mapas, inspeccionar naciones y rastrear eventos históricos.

- **Lenguaje del juego:** Inglés (origen) y Chino simplificado (soporte nativo completo)
- **Tipo de juego:** Estrategia por turnos, observación con simulación autónoma
- **Número de naciones:** 2–12 (por defecto 6)
- **Mundo:** 96×64 tiles determinístico generado desde una semilla

---

## 2. Stack Tecnológico

| Componente | Tecnología | Versión |
|---|---|---|
| Lenguaje | TypeScript | ^5.9.3 |
| Framework UI | React | ^19.2.3 |
| Renderizado UI | React DOM | ^19.2.3 |
| Motor de build | Vite | ^7.3.0 |
| Plugin React | @vitejs/plugin-react | ^5.1.1 |
| Renderizado mapa | PixiJS | ^8.14.3 |
| Gestor de paquetes | pnpm | — |
| TS Config | target ES2022, jsx react-jsx, strict | — |

---

## 3. Estructura del Proyecto

```
AI-Civilization-Sandbox/
├── index.html                  # Punto de entrada HTML
├── package.json                # Configuración de dependencias y scripts
├── pnpm-workspace.yaml         # Configuración de workspace pnpm
├── tsconfig.json               # Configuración TypeScript principal
├── tsconfig.node.json          # Configuración TypeScript para herramientas
├── vite.config.ts              # Configuración Vite
├── src/
│   ├── main.tsx                # Entry point de React
│   ├── App.tsx                 # Componente principal de la aplicación
│   ├── styles.css              # Estilos globales del juego
│   ├── components/             # Capa de UI de React
│   │   ├── MainMenu.tsx        # Pantalla de inicio
│   │   ├── WorldMap.tsx        # Mapa interactivo (PixiJS)
│   │   └── NationModelConfiguration.tsx  # Configuración de IA por nación
│   └── world/                  # Lógica de simulación pura (~5000+ líneas)
│       ├── types.ts            # Tipos de datos fundamentales
│       ├── buildDemoWorld.ts   # Generación procedural del mundo
│       ├── economy.ts          # Sistema de producción de recursos
│       ├── cityEconomy.ts      # Cálculos económicos por ciudad/nación
│       ├── settlement.ts       # Gestión de reservas e ingresos
│       ├── policyAI.ts         # Motor de decisiones de la IA
│       ├── diplomacy.ts        # Sistema diplomático
│       ├── relationships.ts    # Actitudes y relaciones entre naciones
│       ├── war.ts              # Sistema militar y de guerra
│       ├── spies.ts            # Red de espionaje
│       ├── turnSimulation.ts   # Bucle principal de turnos
│       ├── nationStatus.ts     # Detección de derrota
│       ├── events.ts           # Tipos y gestión de eventos
│       ├── localization.ts     # Localización bilingüe zh/en
│       ├── nameCatalog.ts      # Catálogo de nombres bilingües
│       └── modelConfig.ts      # Configuración de API por nación
├── docs/
│   ├── spec.md                 # Este archivo
│   └── images/                 # Capturas de pantalla
│       ├── main-menu.png
│       ├── world-observer.png
│       └── nation-ai-configuration.png
├── scripts/
│   └── smoke-simulation.mjs    # Script de validación automatizada
└── .gitignore
```

---

## 4. Arquitectura

### 4.1 Separación de Capas

El proyecto sigue una separación estricta entre lógica de simulación y UI:

- **`src/world/`** — Código puro, sin dependencias de React. Toda la simulación es funcional y determinista. `advanceSimulationTurn()` es el único punto de entrada para avanzar un turno.
- **`src/components/`** — Capa de presentación React que consume el estado de simulación y renderiza la interfaz.
- **`src/App.tsx`** — Orquestador que conecta ambos mundos, manteniendo `simulationRef` como fuente de verdad del estado.

### 4.2 Flujo del Turno

```
advanceSimulationTurn(world, state, executor)
  │
  ├── Para cada nación activa (en orden):
  │     executeNationAction(context) → Promise (actualmente no-op)
  │
  └── resolveTurn(world, state, nextMonth)
        │
        ├── settleNationStockpiles()      → Ingresos y reservas
        ├── advanceNationPolicies()       → Re-decisión de políticas (cada 6 meses)
        ├── advanceMilitaryEconomy()      → Reclutamiento, mantenimiento, desarrollo
        ├── advanceSpyNetwork()           → Misiones, inteligencia, efectos
        ├── executeDiplomacyPolicies()    → Declaración de guerra, propuestas
        ├── evaluateDiplomaticProposals() → Aceptación/rechazo de propuestas
        ├── advanceArmyGroups()           → Movimiento de ejércitos
        └── advanceWarSystem()            → Batallas, capturas, derrota de naciones
        │
        └── → Nuevo SimulationState
```

### 4.3 Tipo de Ejecutor de Nación

```typescript
type NationTurnExecutor = (context: NationTurnContext) => Promise<void>;
```

Actualmente es una función vacía (`async () => undefined`). El diseño permite futura integración con APIs externas (OpenAI-compatible). El contrato garantiza que una respuesta lenta no afecte el turno de otras naciones.

---

## 5. Sistemas de Juego Detallados

### 5.1 Generación del Mundo

- **Tamaño:** 96×64 tiles
- **Algoritmo:** Ruido de Fourier basado en fBm (fractal Brownian motion) con `noise2D` y `mulberry32` PRNG
- **Terrenos:** Ocean (elevación < 0.39), Coast (0.39–0.45), Mountain (> 0.82), Hill (0.68–0.82), Desert (temp > 0.62 y moisture < 0.34), Forest (moisture > 0.62), Plain (resto)
- **Recursos:** Asignación probabilística por tipo de terreno (grain en plains, timber en forests, iron/coal en hills/mountains, oil en coasts/deserts)
- **Provincias:** ~118, asignadas por proximidad a semillas con ruido de frontera
- **Naciones:** Nombre = {nombreBase} + {formaDeGobierno}, colores asignados de una paleta fija
- **Ciudades:** Capital (nivel 3) + ciudades adicionales según territorio y recursos, máximo 9 por nación
- **Garantía:** Cada nación inicial tiene al menos un tile de cada recurso

### 5.2 Unidades Militares

| Unidad | Ataque | Defensa | HP | Velocidad | Coste (oro) | Mantenimiento |
|---|---|---|---|---|---|---|
| Militia | 4 | 3 | 60 | 1 | 0.8 | 0.4 |
| Infantry | 7 | 7 | 100 | 1 | 2.0 | 1.0 |
| Light Cavalry | 8 | 5 | 80 | 3 | 3.5 | 1.8 |
| Heavy Cavalry | 12 | 10 | 140 | 2 | 6.0 | 3.0 |

- Cada unidad requiere recursos específicos para reclutamiento y mantenimiento mensual
- Movimiento: velocidad modificada por terreno, peso de caballería pesada penaliza en montañas

### 5.3 Diplomacia

- **Actitudes:** -100 (Hostile) a +100 (Trusted), con etiquetas: Hostile (≤-60), Wary (≤-25), Neutral (<25), Friendly (<60), Trusted (≥60)
- **Tipos de propuesta:** Alliance, Peace, Vassalage Offer, Vassalage Demand
- **Treguas:** 24 meses, con probabilidad de ruptura
- **Vasallaje:** 20% oro / 10% recursos (demanda) o 12% oro / 8% recursos (oferta), ruptura tras 120 meses si actitud ≤ -45 o poder vasallo ≥ 72% del señor
- **Alianzas:** Defensa mutua, disolución tras 144 meses si actitud < 20

### 5.4 Espionaje

- 3 espías por nación, con 4 misiones posibles:
  - Gather Intelligence (inteligencia militar y de recursos)
  - Sow Discord (reduce relación entre dos naciones -5)
  - Improve Relations (+4 entre naciones)
  - Damage Relations (-4 entre naciones)
- Probabilidades de éxito: Inteligencia 86%, otros 74%
- Las misiones se revisan cada 6 meses

### 5.5 Localización

- **Idiomas soportados:** Inglés (`en`) y Chino simplificado (`zh`)
- **Mecanismo:** `localizeText(text, language, world?)` — primero reemplaza entidades (nombres de naciones/ciudades/provincias), luego mapas estáticos, finalmente regex de frases comunes
- **Cambio en tiempo real:** No reinicia el juego, actualiza interfaz, etiquetas de mapa, nombres y eventos

---

## 6. Interfaz de Usuario

### 6.1 Layout Principal (3 paneles)

```
┌─────────────────────────────────────────────────────┐
│ Panel de Eventos (320px)         │ Mapa (centro)    │ Panel Lateral (300px)│
│ - Bitácora de eventos           │ - Mapa PixiJS    │ - Detalles de nación │
│ - Filtro por nación             │ - Zoom/Pan       │ - Detalle de ciudad  │
│ - Modo Overview / Nation        │ - Modos: Político│ - Lista de naciones  │
│                                   │ - Modo Terreno   │ - Controles de turno │
│                                   │ - Modo Recursos  │ - Mapa político      │
└─────────────────────────────────────────────────────┘
```

### 6.2 Componentes

| Componente | Descripción |
|---|---|
| `MainMenu` | Pantalla de inicio con seed, cantidad de naciones/ciudades, selector de idioma |
| `WorldMap` | Mapa interactivo PixiJS con 3 modos, drag/zoom, tooltips de recursos, selección de ciudad/provincia |
| `NationModelConfiguration` | Panel para configurar API OpenAI-compatible por nación (endpoint, modelo, API key, prompt de personalidad) |
| `EventLogPanel` | Bitácora de eventos con filtros por nación y modo overview/nation |
| `CityDetailPanel` | Detalle de ciudad con población, oro, ejército, defensa, ranuras de edificios |
| `NationDetailPanel` | Vista completa de nación con economía, política, militar, espionaje, diplomacia |

### 6.3 Controles de Turno

- **Play/Pause:** Ejecución automática de turnos
- **Velocidad:** 1x, 2x, 5x
- **Next Turn:** Avanzar un turno manualmente
- **Indicador de progreso:** Muestra qué nación está actuando y cuántas han completado su turno

---

## 7. Modelos de Datos Clave

### 7.1 SimulationState

```typescript
type SimulationState = {
  defeatedNations: Record<string, DefeatedNationRecord>;
  diplomacy: DiplomacyState;
  elapsedMonths: number;
  events: GameEvent[];        // Máximo 240 eventos en historial
  mapRevision: number;
  military: MilitaryState;
  nationPolicies: Record<string, NationPolicyState>;
  nationRelations: NationRelations;
  nationStockpiles: Record<string, NationStockpile>;
  spies: SpyNetwork;
};
```

### 7.2 World

```typescript
type World = {
  seed: string;
  width: number;               // 96
  height: number;              // 64
  tiles: Tile[];              // ~6144 tiles
  nations: Nation[];
  provinces: Province[];
  cities: City[];
  provinceById: Map<string, Province>;
  nationById: Map<string, Nation>;
  cityById: Map<string, City>;
  provinceEdges: MapEdge[];
  nationEdges: MapEdge[];
};
```

### 7.3 Tipos de Eventos (GameEventKind)

Guerra: `war_declared`, `war_ended`  
Batallas: `battle_fought`  
Territorio: `province_occupied`, `city_lost`, `capital_lost`  
Diplomacia: `alliance_signed`, `alliance_dissolved`, `truce_signed`, `proposal_accepted`, `proposal_created`, `proposal_expired`, `proposal_rejected`, `vassalage_signed`, `vassalage_broken`, `vassal_rebellion`  
Militar: `military_upkeep_shortage`, `military_supply_shortage`, `military_disbanded`, `recruitment_completed`, `army_group_created`, `army_group_moved`, `army_group_ordered`, `army_groups_merged`  
Espionaje: `spy_dispatched`, `intelligence_acquired`, `relations_improved`, `relations_damaged`, `relations_sowed_discord`  
Otros: `city_developed`, `nation_defeated`

---

## 8. Scripts

### 8.1 smoke-simulation.mjs

Script de validación que:
1. Ejecuta 600 meses de simulación (configurable)
2. Verifica que los eventos importantes ocurrieron (guerras, batallas, movimientos)
3. Verifica que no hay guerras estancadas (>180 meses sin batalla)
4. Verifica que no hay overflow de recursos o ejércitos
5. Verifica que las naciones derrotadas no dejan residuos activos
6. Verifica que las naciones del norte tuvieron actividad militar
7. Reporta resultados con PASS/FAIL

### 8.2 Comandos Disponibles

```bash
pnpm dev              # Servidor de desarrollo en http://127.0.0.1:5173
pnpm build            # Build de producción (tsc + vite)
pnpm preview          # Vista previa del build
pnpm smoke:simulation # Validación automatizada de simulación
```

---

## 9. Configuración de IA por Nación (Futura Integración)

El repositorio incluye infraestructura para conectar cada nación a un modelo de lenguaje externo compatible con OpenAI:

- **Almacenamiento:** localStorage (`ai-civilization:nation-model-configs:v1`)
- **Configuración por nación:** providerName, endpoint, model, apiKey, personalityPrompt, enabled
- **Prueba de conexión:** POST al endpoint con prompt de prueba, timeout de 15 segundos
- **Códigos de error:** `invalid_endpoint`, `missing_model`, `request_rejected`, `request_timeout`, `network_error`
- **Prompt por defecto:** "You are the national decision maker of {nationName}. Act consistently with the nation's interests, history, resources, diplomatic situation, and military reality."

---

## 10. Notas de Diseño

1. **Determinismo:** Toda la generación del mundo y la simulación son deterministas dado una semilla. El PRNG `mulberry32` produce resultados reproducibles.

2. **Estabilidad del turno:** El diseño del `NationTurnExecutor` garantiza que una respuesta lenta de una API externa no cause que acciones de un turno posterior se filtren en el turno equivocado.

3. **Localización completa:** Todos los textos de la interfaz, etiquetas de mapa, nombres de ciudades/naciones/provincias y eventos dinámicos se localizan al cambiar el idioma.

4. **Escalabilidad:** La arquitectura de simulación pura permite futuras extensiones como:
   - Integración con APIs de IA reales
   - Multijugador por turnos
   - Exportación/carga de estados de partida

5. **Tamaño estimado del mundo:** 6144 tiles, ~118 provincias, ~50-70 ciudades, 6 naciones activas por partida.

---

## 11. Dependencias

### Dependencias de Producción
- `react` ^19.2.3
- `react-dom` ^19.2.3
- `pixi.js` ^8.14.3
- `@vitejs/plugin-react` ^5.1.1

### Dependencias de Desarrollo
- `typescript` ^5.9.3
- `vite` ^7.3.0
- `@types/react` ^19.2.7
- `@types/react-dom` ^19.2.3

---

## 12. Archivos de Configuración

### tsconfig.json
- target: ES2022
- module: ESNext con moduleResolution: Bundler
- jsx: react-jsx
- strict: true
- include: ["src"]

### vite.config.ts
- Plugin: @vitejs/plugin-react
- Configuración mínima

### pnpm-workspace.yaml
- allowBuilds: esbuild: true

---

*Documento generado como referencia del repositorio AI Civilization Sandbox.*

---

## 13. Licencia

Este proyecto está licenciado bajo la **GNU General Public License version 2.0 (GPL-2.0-only)**.

- **SPDX:** `GPL-2.0-only`
- **Archivo:** `LICENSE`
- **Texto:** Licencia completa de GNU GPL v2 como la usada por el kernel de Linux
- **Referencia:** `<https://www.gnu.org/licenses/old-licenses/gpl-2.0.txt>`

Bajo los términos de esta licencia, el software se distribuye "tal cual", sin garantía de ningún tipo, y cualquier obra derivada debe distribuirse bajo los mismos términos.

### Resumen de la Licencia GPL-2.0-only

- ✅ Uso comercial permitido
- ✅ Modificación permitida
- ✅ Distribución permitida
- ✅ Uso privado permitido
- ❌ Suministro de patentes (cláusula 7)
- ❌ Responsabilidad limitada (sección NO WARRANTY)
- ⚠️ **Copyleft**: obras derivadas deben usar la misma licencia GPL-2.0

Cualquier contribución al proyecto se considera bajo los términos de esta licencia.
