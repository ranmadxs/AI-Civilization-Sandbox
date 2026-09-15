# Especificación del Sistema de Mercado y Supervivencia

**Versión:** 1.0  
**Última actualización:** 2026-09-13  
**Proyecto:** AI Civilization Sandbox  
**Licencia:** GPL-2.0-only

---

## 1. Descripción General

Este documento especifica el diseño del **sistema de mercado**, **supervivencia (hambre/sed)**, **moneda**, **eras**, **construcción de ciudades** y **militar** para AI Civilization Sandbox. Estos subsistemas reemplazan y extienden el modelo actual de recursos fijos por un modelo dinámico basado en población.

---

## 2. Supervivencia y Consumo

### 2.1 Consumo Poblacional

Cada persona en el juego consume recursos proporcionalmente cada mes de juego (1 turno).

```
Consumo por persona por mes:
  grain:  0.01  (1/100 grain/persona/mes)
  water:  0.001 (1/1000 water/persona/mes)
```

**El consumo aplica a toda la población del mundo**, incluyendo personas sin ciudad asignada.

### 2.2 Muerte por Falta de Recursos

| Recurso | Tiempo sin consumo | Resultado |
|---------|--------------------|-----------|
| Agua (water) | 72 horas (≈ 0.1 turno) | Muerte irremediable |
| Comida (grain) | 2 meses (2 turnos) | Muerte irremediable |

Cuando el stockpile de una provincia llega a 0 para un recurso, toda la población de esa provincia comienza a morir inmediatamente según las reglas anteriores.

### 2.3 Producción Dinámica de Alimento

La producción de alimento NO es fija por tile. Varía según la población que vive en cada tile agrícola.

```
food_production(tile) = f(población_viviendo_en_tile)

Reglas:
  - 0 personas en tile → 0 food
  - 1 persona en tile → food mínimo
  - Escala logarítmica: más personas = más food, pero con rendimientos decrecientes
  - Solo tiles con resource = "grain" producen food
  - Tiles sin resource = 0 food (incluso con personas)
```

```
food_production = base_yield × log(1 + population_on_tile) × terrain_multiplier

donde:
  base_yield = 6 (grain tile actual)
  terrain_multiplier = 1.0 (plain/coast), 0.8 (forest/hill), 0.5 (desert)
```

### 2.4 Extracción Dinámica de Minerales

Los tiles de metal (iron, coal, etc.) producen según la población que trabaja el recurso.

```
metal_extraction(tile) = f(población_trabajando_el_tile)

Reglas:
  - 0 personas → 0 extracción
  - Más personas → mayor velocidad de extracción
  - Proporcional al ocupamiento del tile
  - Escala logarítmica con techo
```

```
extraction_rate = base_yield × min(1, workers_on_tile / optimal_workers) × log(1 + workers)

donde:
  base_yield = 3 (iron/coal), 2 (oil)
  optimal_workers = 20 (máximo eficiente)
```

### 2.5 Agua

El agua es un **resource separado** del grano y solo se genera en tiles que tienen contacto con elementos acuáticos.

```
Condición de generación:
  - tile.terrain = "coast"  → genera water
  - tile.terrain = "ocean"  → genera water (océano, no habitable)
  
El sistema siempre proporciona una oferta base de water con precio en oro.
```

---

## 3. Sistema de Mercado

### 3.1 Fases del Mercado por Turno

El mercado ejecuta **2 veces por turno**: una al inicio y una al final.

```
Pipeline de turno:

  [MARKET_START]     ← Fase de ofertas y negociación
  [HUNGER]           ← Consumo de food/water, muertes
  [EXTRACTION]       ← Extracción dinámica de recursos
  [ACTING]           ← Las naciones ejecutan sus acciones
  [RESOLVING]        ← Resolución de guerras, diplomacia, espionaje
  [CONSTRUCTION]     ← Progreso de construcciones
  [MARKET_END]       ← Ejecución de transacciones
```

### 3.2 MARKET_START (Inicio de Turno)

**Propósito:** Las naciones hacen ofertas. Se establecen precios. Se abre el canal de comunicación.

```
Acciones en MARKET_START:
  1. Cada IA presenta ofertas (qué vende, qué compra, precio deseado)
  2. Se calculan precios base del sistema
  3. Se abre el canal de chat global
  4. Las IA pueden ver ofertas de otras naciones
  5. Las IA pueden responder/negociar antes de que termine la fase
```

### 3.3 MARKET_END (Final de Turno)

**Propósito:** Se ejecutan las transacciones acordadas.

```
Acciones en MARKET_END:
  1. Se procesan todas las transacciones ofertadas en MARKET_START
  2. Se ejecutan pagos (oro o moneda nacional)
  3. Se calcula el costo de transporte de bienes entre naciones
  4. Se actualizan los stockpiles de todas las naciones
  5. Se cierran las transacciones del turno
```

### 3.4 Sistema como Vendedor (NPC)

El sistema del juego actúa como vendedor base cuando una nación no tiene acceso a recursos o necesita comprar.

```
Precio base del sistema = costo_producción × markup + fluctuación

  markup = 1.2 (20% de ganancia del sistema)
  fluctuación = random(-0.1, +0.1) del precio base

Recursos ofrecidos por el sistema:
  - agua (siempre disponible si hay gold)
  - grano (siempre disponible si hay gold)  
  - metal (siempre disponible si hay gold)

La nación compra al sistema cuando no puede obtener de otras naciones.
```

### 3.5 Transporte de Bienes

Los bienes comprados a otra nación deben ser transportados.

```
costo_transporte = distancia_provincia × unidades × factor_logistico

  factor_logistico = 0.01 gold/tile/unidad
  
El comprador paga el costo de transporte además del precio del bien.
```

### 3.6 Ofertas y Precios

```
Oferta (Offer):
  - seller_nation_id
  - buyer_nation_id (o "system" o "any")
  - resource_type (grain, water, iron, coal, oil)
  - quantity
  - unit_price (en oro o moneda nacional)
  - currency (gold o moneda_nacional_id)
  - valid_from (turno actual, MARKET_START)
  - valid_until (turno actual + N, MARKET_END)

Precio de mercado dinámico:
  - base_price = sistema calcula desde producción
  - market_price = base_price × (1 + demand_ratio - supply_ratio)
  - demand_ratio = cantidad solicitada / cantidad disponible total
  - supply_ratio = cantidad ofertada / cantidad disponible total
```

---

## 4. Sistema Monetario

### 4.1 Oro (Moneda Universal)

```
El oro es la moneda universal del juego.
Siempre aceptada por cualquier nación y por el sistema.
Precio base = 1 gold = 1 gold (sin conversión).
```

### 4.2 Moneda Nacional

Cada nación tiene su propia moneda respaldada por sus reservas metálicas.

```
valor_moneda_nacional = (reserva_metálica_total / población_total) × factor

factor = 0.01 (ajustable)

La moneda se puede usar para comerciar entre naciones.
Cada IA decide en qué moneda comerciar.
El mercado calcula la conversión automáticamente.
```

### 4.3 Conversión de Monedas

```
al_cambio = cantidad × (valor_origen / valor_destino)

El sistema maneja la conversión automáticamente al ejecutar transacciones.
Si la moneda del comprador es diferente a la del vendedor:
  - Se convierte al tipo de cambio actual
  - El costo de conversión = 2% del monto
```

---

## 5. Sistema de Eras

### 5.1 Definición de Eras

| Era | Desbloqueo | Costos Base | Unidades Disponibles | Construcción |
|-----|------------|-------------|---------------------|-------------|
| **Piedra** | Inicial | Madera + piedra mínima | militia | 1 turno, barato |
| **Medieval** | ≥5 ciudades funcionando | Madera + hierro + oro | militia, infantry, lightCavalry | 2-3 turnos |
| **Moderna** | ≥15 ciudades, todas en Medieval ≥10 turnos | Todos los recursos en cantidades grandes | Todas las unidades | 5+ turnos |

### 5.2 Reglas de Desbloqueo de Era

```
Reglas para subir de era:
  - Piedra → Medieval: necesidad de ≥5 ciudades funcionando en la nación
  - Medieval → Moderna: necesidad de ≥15 ciudades funcionando, todas construidas en era Medieval durante ≥10 turnos
  - No puede haber ciudades sin construcción (solo casas de madera) para estar en Moderna
  - El progreso es acumulativo: tipo de materiales construidos determina la era
  - Si la nación no tiene ninguna ciudad: no puede estar en ninguna era superior a Piedra
```

### 5.3 Costos de Construcción por Era

```
Estructura de costos:
  era_costs = {
    piedra:   { wood: 10, stone: 5 },
    medieval: { wood: 20, iron: 10, gold: 5 },
    moderna:  { wood: 30, iron: 25, gold: 15, steel: 10 }
  }

Construcción de ciudad nueva:
  - Costo = era_costs[current_era] × factor_especial
  - factor_especial = 1.0 (normal), 1.5 (desierto), 0.8 (capital)
  
Tiempo de construcción:
  - piedra: 1 turno
  - medieval: 2 turnos
  - moderna: 5 turnos

Reconstrucción tras despoblamiento:
  - Mismo costo que construcción nueva
  - Mismo tiempo que construcción nueva
```

---

## 6. Construcción de Ciudades

### 6.1 Requisitos para Crear Ciudad

```
Requisitos mínimos:
  - ≥10 personas en el tile destino
  - Acceso a recursos base (grain, water)
  - Era actual definida para la nación
  - Recursos suficientes para el costo de construcción
  - Tiempo de construcción (1-5 turnos según era)
```

### 6.2 Costos Multi-Recurso

```
Costo de ciudad = f(era, tipo_construcción)

Ejemplo de costos por era:

  Casa de piedra (era Piedra):
    madera: 10, piedra: 5
  
  Casa medieval (era Medieval):
    madera: 20, hierro: 10, oro: 5
  
  Casa moderna (era Moderna):
    madera: 30, hierro: 25, oro: 15, acero: 10
```

### 6.3 Reconstrucción tras Despoblamiento

```
Cuando una ciudad pierde toda su población:
  1. La ciudad vuelve a ser un tile silvestre
  2. La provincia pierde el tile de la ciudad
  3. Si repuebla (≥10 personas en el tile):
     a. Se puede reconstruir la ciudad
     b. Tiempo de reconstrucción = costo_era / velocidad_construcción
     c. La ciudad vuelve a funcionar normalmente
```

---

## 7. Sistema Militar Modificado

### 7.1 Tope Militar por Provincia

```
max_ejercito_provincia = base_province × sqrt(num_ciudades) × factor_era

donde:
  base_province = 500 (constante base por provincia)
  num_ciudades = cantidad de ciudades en la provincia
  factor_era = 1.0 (Piedra), 1.3 (Medieval), 1.8 (Moderna)

Sin ciudades = tope militar = 0 (no puede haber ejército)
```

### 7.2 Ejército y Ciudades

```
Regla fundamental: solo se puede tener ejército si hay ciudades.

Ejército disponible por provincia = min(
  max_ejercito_provincia,
  ciudades × ratio_soldados
)

ratio_soldados = 200 × factor_era (soldados por ciudad)

Proporción:
  - Provincia con 3 ciudades → hasta 3 × 200 = 600 soldados (Piedra)
  - Provincia con 3 ciudades → hasta 3 × 260 = 780 soldados (Medieval)
```

### 7.3 Desertores

Cuando una ciudad se vacía (población = 0), el ejército estacionado ahí toma una decisión:

```
Si ciudad pierde toda su población:
  1. IA que controla el ejército decide:
     a. Mover el ejército a otra ciudad de la misma nación
     b. Desertar → el ejército se convierte en personas normales
     
  2. Si el ejército deserta:
     a. Las personas se convierten en población civil sin nación
     b. Otra nación puede adquirirlas como población
     c. El tile puede ser reclamado por otra nación
  
  3. Ejército sin ciudad de origen válida:
     a. Se considera "sin hogar"
     b. La IA debe reasignarlo en el siguiente MARKET_START
```

### 7.4 Reasignación Militar

```
Mecánica de reasignación:
  - Cuando el ejército se mueve a otra ciudad:
    a. El ejército se transfiere a la nueva guarnición
    b. El costo de traslado = costo_transporte (oro)
    c. Tiempo de traslado = 1 turno si adyacente, +1 por provincia extra
    
  - Si el ejército no tiene ciudad válida:
    a. Se convierte en personas normales
    b. Pueden ser adquiridos por otra nación como población
    c. Otras naciones pueden reclutarlos si tienen ciudades disponibles
```

---

## 8. Canal de Chat

### 8.1 Estructura del Chat

```
Canal de chat global accesible desde la UI.

Mensajes tienen las siguientes propiedades:
  - sender: "nation_id" | "system" | "user"
  - timestamp: turno_actual
  - channel: "market" | "diplomacy" | "military" | "general"
  - content: string

Reglas del canal:
  - Todas las IA pueden ver todos los mensajes
  - Todas las IA pueden responder a cualquier mensaje
  - El usuario (jugador) puede escribir mensajes
  - El sistema puede enviar notificaciones
  - No hay privacidad: todo es público
```

### 8.2 Uso del Chat en el Mercado

```
En MARKET_START:
  - Las IA publican ofertas en el canal de mercado
  - Las IA pueden negociar precios por chat
  - El sistema publica precios base
  - El usuario puede observar y escribir

En MARKET_END:
  - El sistema publica transacciones ejecutadas
  - Se confirman precios finales
  - Se registran los resultados comerciales
```

### 8.3 Categorías del Chat

```
Categorías disponibles:
  - market: ofertas, negociaciones comerciales
  - diplomacy: tratados, alianzas, ultimátums
  - military: movimientos de ejército, solicitudes de ayuda
  - general: cualquier otro tema

Filtrado en UI:
  - El usuario puede filtrar por categoría
  - El chat se muestra con categorías en el panel lateral
  - El usuario puede escribir en cualquier categoría
```

---

## 9. Integración con el Pipeline de Turno

### 9.1 Pipeline Modificado

```
advanceSimulationTurn() se ejecuta con el siguiente orden:

  [MARKET_START]
    → market.generateOffers(world, simulation)
    → market.calculateBasePrices(world)
    → chat.broadcast("market", "MARKET_START")
    → await negotiationPhase()
  
  [HUNGER]
    → hunger.consumeResources(world, simulation)
    → hunger.checkStarvation(world)
    → hunger.processDeaths(world)
    → hunger.processDeserters(world)
  
  [EXTRACTION]
    → extraction.calculateProduction(world, simulation)
    → settlement.updateStockpiles(world, simulation)
  
  [ACTING]  ← existing logic
    → for each active nation: executeNationAction()
  
  [RESOLVING]  ← existing logic
    → resolveTurn()
  
  [CONSTRUCTION]
    → construction.progressBuildings(world, simulation)
    → construction.checkNewCities(world, simulation)
  
  [MARKET_END]
    → market.executeTransactions(world, simulation)
    → market.processPayments(world)
    → market.calculateTransportCosts(world)
    → chat.broadcast("market", "MARKET_END")
  
  → elapsedMonths += 1
```

### 9.2 Datos Añadidos a SimulationState

```typescript
type SimulationState = {
  // Campos existentes...
  defeatedNations: Record<string, DefeatedNationRecord>;
  diplomacy: ReturnType<typeof buildInitialDiplomacyState>;
  elapsedMonths: number;
  events: GameEvent[];
  mapRevision: number;
  military: MilitaryState;
  nationPolicies: Record<string, NationPolicyState>;
  nationRelations: NationRelations;
  nationStockpiles: Record<string, NationStockpile>;
  spies: SpyNetwork;
  
  // Campos nuevos:
  marketState: MarketState;
  hungerState: HungerState;
  eraState: Record<string, EraState>;
  chatLog: ChatMessage[];
  currencyState: CurrencyState;
};
```

---

## 10. Estructura de Datos

### 10.1 Nuevos Tipos

```typescript
// Supervivencia
type HungerState = {
  globalFoodConsumption: number;
  globalWaterConsumption: number;
  totalDeaths: number;
  provincesAtRisk: string[];
};

// Mercado
type MarketState = {
  offers: MarketOffer[];
  transactions: Transaction[];
  basePrices: Record<string, number>;
  currentPhase: "MARKET_START" | "MARKET_END" | "CLOSED";
  currentTurn: number;
};

type MarketOffer = {
  id: string;
  sellerNationId: string;
  buyerNationId: string | "system" | "any";
  resourceType: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  validFrom: number;
  validUntil: number;
  status: "offered" | "accepted" | "expired" | "executed";
};

type Transaction = {
  id: string;
  offers: string[];
  totalGold: number;
  transportCost: number;
  executedAt: number;
  status: "pending" | "completed" | "failed";
};

// Moneda
type CurrencyState = {
  goldUniversal: number;
  nationalCurrencies: Record<string, NationalCurrency>;
};

type NationalCurrency = {
  nationId: string;
  metalReserve: Record<string, number>;
  exchangeRateToGold: number;
  conversionFee: number;
};

// Eras
type EraState = {
  nationId: string;
  currentEra: "stone" | "medieval" | "modern";
  citiesBuiltInEra: string[];
  eraProgress: number;
  unlockedAt: number;
};

// Construcción
type ConstructionProject = {
  id: string;
  cityId?: string;
  nationId: string;
  provinceId: string;
  era: string;
  cost: Record<string, number>;
  remainingTurns: number;
  status: "building" | "complete" | "abandoned";
  startedAt: number;
};

// Militar
type ProvinceMilitaryLimit = {
  provinceId: string;
  maxArmySize: number;
  currentArmySize: number;
  hasCities: boolean;
  cityCount: number;
};

// Chat
type ChatMessage = {
  id: string;
  sender: string;
  timestamp: number;
  channel: "market" | "diplomacy" | "military" | "general";
  content: string;
  metadata?: Record<string, string>;
};
```

### 10.2 Modificaciones a Tipos Existentes

```typescript
// NationStockpile se extiende con water
type NationStockpile = {
  gold: number;
  water: number;         // NUEVO
  resources: ResourceTotals;
};

// Tile se extiende con population info
type Tile = {
  x: number;
  y: number;
  terrain: Terrain;
  elevation: number;
  temperature: number;
  moisture: number;
  provinceId?: string;
  resource?: Resource;
  populationOnTile?: number;     // NUEVO: personas viviendo en este tile
  workersOnTile?: number;        // NUEVO: personas trabajando el recurso
};

// City se extiende con era y construction info
type City = {
  id: string;
  name: string;
  nationId: string;
  provinceId: string;
  x: number;
  y: number;
  isCapital: boolean;
  population: number;
  level: number;
  era?: string;                // NUEVO: era de la ciudad
  constructionProgress?: number; // NUEVO: progreso si está en construcción
};
```

---

## 11. Integración con UI

### 11.1 Panel de Alimento

Se añade un **panel lateral nuevo** al interface existente para mostrar información de alimento y mercado.

```
Panel "Alimento & Mercado":
  ├── Sección: Alimentación
  │   ├── Reserve de grano (por provincia)
  │   ├── Reserve de agua (por provincia)  
  │   ├── Consumo mensual total
  │   ├── Personas en riesgo de muerte
  │   └── Alertas de hambruna/sed
  │
  ├── Sección: Mercado
  │   ├── Precios actuales de recursos
  │   ├── Ofertas del mercado
  │   ├── Monedas disponibles y tipos de cambio
  │   └── Historial de transacciones
  │
  └── Sección: Chat
      ├── Canal de mercado
      ├── Canal diplomático
      ├── Canal militar
      ├── Canal general
      └── Input de texto para usuario
```

### 11.2 Event Log con Categorías

El log de eventos existente se extiende con filtros por categoría.

```
Categorías nuevas de eventos:
  - "hunger": muertes por hambruna o sed
  - "market": transacciones comerciales
  - "construction": construcción o reconstrucción de ciudades
  - "desertion": ejércitos desertores
  - "currency": conversiones monetarias
  - "era": cambio de era de la nación
```

---

## 12. Consideraciones de Balance

### 12.1 Progresión de Dificultad

```
Las naciones más grandes tienen ventaja en el mercado:
  - Más ciudades → más recursos → más poder de negociación
  - Las naciones pequeñas pueden sobrevivir siendo eficientes
  - El agua es el recurso más crítico: las naciones sin acceso a agua deben comerciar obligatoriamente
  
El sistema NPC garantiza supervivencia mínima:
  - Precio base del sistema para water/grain/metal
  - Las naciones pueden comprar del sistema si no hay otro vendedor
  - Pero el precio del sistema es más alto que el mercado directo
```

### 12.2 Ciclos Económicos

```
Flujo económico natural:
  personas → trabajan tiles → producen recursos → recursos al stockpile
  → se consumen personas (food/water) → si hay excedente → expansión
  → expansión cuesta recursos → más personas → más producción → ciclo
  
Riesgo de espiral mortal:
  población baja → poca producción → más hambre → menos población → muerte
  (esto es el "death spiral" que el jugador/IA debe evitar)
```

---

## 13. Plan de Implementación

### 13.1 Orden de Implementación

| Fase | Archivos | Dependencias |
|------|----------|--------------|
| **1. Supervivencia** | `hunger.ts`, `economy.ts` | Ninguna (base) |
| **2. Moneda** | `currency.ts`, `settlement.ts` | Fase 1 |
| **3. Mercado** | `market.ts`, `turnSimulation.ts` | Fase 2 |
| **4. Eras** | `era.ts`, `construction.ts` | Ninguna (independiente) |
| **5. Militar** | `provinceLimits.ts`, `war.ts` | Fase 4 |
| **6. Integración** | `cityEconomy.ts`, `llmExecutor.ts` | Fases 1-5 |
| **7. UI** | `App.tsx` | Todas las anteriores |
| **8. Tests** | `scripts/`, `test_model.mjs` | Todas las anteriores |

### 13.2 Tests Requeridos

```
Tests por fase:
  Fase 1: starvation_test, food_production_test, water_production_test
  Fase 2: currency_conversion_test, stockpile_update_test
  Fase 3: market_offer_test, market_execution_test, transport_cost_test
  Fase 4: era_unlock_test, construction_cost_test, city_rebuild_test
  Fase 5: military_cap_test, desertion_test, reassignment_test
  Fase 6: integration_test (simulación completa)
```

---

## 14. Archivos Nuevos y Modificados

### 14.1 Archivos Nuevos

```
src/world/hunger.ts           ← Consumo, muerte, producción dinámica
src/world/market.ts           ← Mercado, ofertas, transacciones
src/world/currency.ts         ← Monedas, tipos de cambio
src/world/era.ts              ← Definición de eras, desbloqueo
src/world/construction.ts     ← Construcción de ciudades por era
src/world/provinceLimits.ts   ← Tope militar por provincia
src/world/chat.ts             ← Canal de chat global
```

### 14.2 Archivos Modificados

```
src/world/types.ts            ← Añadir water, populationOnTile, era, construction
src/world/economy.ts          ← Añadir water production, dynamic yields
src/world/cityEconomy.ts      ← Refactorizar consumo y producción per capita
src/world/settlement.ts       ← Dynamic extraction, water stockpiles
src/world/war.ts              ← Army-citizen ratio, province limits, deserters
src/world/turnSimulation.ts   ← Pipeline con market phases
src/world/llmExecutor.ts      ← Prompts con comercio y supervivencia
src/App.tsx                   ← Panel de alimento, chat, categorías de eventos
```

---

## 15. Índice de Términos

| Término | Definición |
|---------|-----------|
| **Tile** | Celda individual del mapa (96×64 = 6144 tiles) |
| **Province** | Grupo de tiles adyacentes con la misma nación |
| **City** | Asentamiento construido sobre un tile dentro de una provincia |
| **Nation** | Nación controlada por IA o jugador |
| **Stockpile** | Reservas de oro, agua y recursos de una nación |
| **Era** | Etapa tecnológica: piedra, medieval, moderna |
| **Market Phase** | Fase de turno para ofertas (START) y transacciones (END) |
| **Deserter** | Ejército sin ciudad de origen que se convierte en personas |
| **Death Spiral** | Espiral de población baja → poca producción → más hambre |
| **Province Cap** | Tope máximo de soldados por provincia basado en ciudades |
