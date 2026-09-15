export type Terrain = "ocean" | "coast" | "plain" | "forest" | "hill" | "mountain" | "desert" | "lake";

export type Resource = "grain" | "timber" | "iron" | "coal" | "oil";

export type Nation = {
  id: string;
  name: string;
  nameEn: string;
  nameZh: string;
  nameEs: string;
  nameBaseId: string;
  governmentFormId: string;
  color: string;
  numericColor: number;
  capitalProvinceId: string;
  capitalCityId?: string;
};

export type Province = {
  id: string;
  name: string;
  nameEn: string;
  nameZh: string;
  nameEs: string;
  nationId: string | undefined;
  centerX: number;
  centerY: number;
  tileCount: number;
};

export type Tile = {
  x: number;
  y: number;
  terrain: Terrain;
  elevation: number;
  temperature: number;
  moisture: number;
  river?: boolean;
  riverWidth?: number;
  provinceId?: string;
  resource?: Resource;
};

export type City = {
  id: string;
  name: string;
  nameEn: string;
  nameZh: string;
  nameEs: string;
  nameId: string;
  nationId: string;
  provinceId: string;
  x: number;
  y: number;
  isCapital: boolean;
  population: number;
  level: number;
};

export type MapEdge = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  nationId?: string;
};

export type World = {
  seed: string;
  width: number;
  height: number;
  tiles: Tile[];
  nations: Nation[];
  provinces: Province[];
  cities: City[];
  provinceById: Map<string, Province>;
  nationById: Map<string, Nation>;
  cityById: Map<string, City>;
  provinceEdges: MapEdge[];
  nationEdges: MapEdge[];
};
