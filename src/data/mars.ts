import {
  HexSphereGrid,
  tileKey,
  sectorPoint,
  type Sector,
  type Tile,
} from "../game/grid/hexSphere";

export const mars = {
  id: "mars",
  name: "火星",
  frequency: 6,
  gridVersion: "hex-icosa-f6-r24-v1",
  radius: 3.3,
  gravity: "3.72",
  temperature: "−63",
  day: "24h 37m",
};
export const grid = new HexSphereGrid(mars.frequency);
export const SECTOR_LABELS: Record<Sector, string> = {
  FRONT: "正区",
  EAST: "东区",
  BACK: "背区",
  WEST: "西区",
  NORTH: "北区",
  SOUTH: "南区",
};
export const SECTOR_CODES: Record<Sector, string> = {
  FRONT: "F",
  EAST: "E",
  BACK: "B",
  WEST: "W",
  NORTH: "N",
  SOUTH: "S",
};
export type Terrain = "plain" | "ridge" | "crater" | "facility";
export const terrainInfo: Record<
  Terrain,
  {
    name: string;
    color: string;
    height: number;
    blocked: boolean;
    description: string;
  }
> = {
  plain: {
    name: "赤铁荒原",
    color: "#855643",
    height: 0.018,
    blocked: false,
    description: "开阔地表，可通行。",
  },
  ridge: {
    name: "玄武岩山脊",
    color: "#494344",
    height: 0.16,
    blocked: true,
    description: "陡峭岩层，当前禁止通行。",
  },
  crater: {
    name: "古老撞击坑",
    color: "#634c42",
    height: 0.005,
    blocked: false,
    description: "低洼地形，可通行。",
  },
  facility: {
    name: "战略设施",
    color: "#65716c",
    height: 0.025,
    blocked: false,
    description: "废弃的殖民地设施，可通行。",
  },
};
export const facilities: {
  id: string;
  name: string;
  subtitle: string;
  tile: Tile;
  kind: "relay" | "energy" | "archive";
}[] = [
  {
    id: "01",
    name: "阿瑞斯能源站",
    subtitle: "中央供能节点",
    tile: grid.nearestTile(sectorPoint("FRONT", 0.1, 0.15)),
    kind: "energy",
  },
  {
    id: "02",
    name: "南极中继阵列",
    subtitle: "跨面通讯节点",
    tile: grid.nearestTile(sectorPoint("SOUTH", 0.3, 0.5)),
    kind: "relay",
  },
  {
    id: "03",
    name: "黎明数据档案",
    subtitle: "GPT 记忆碎片",
    tile: grid.nearestTile(sectorPoint("EAST", -0.15, -0.45)),
    kind: "archive",
  },
];
export const DEFAULT_START = grid.nearestTile(
  sectorPoint("FRONT", -0.25, -0.45),
);
export const DEFAULT_END = facilities[2].tile;
export const SOUTH_WAYPOINT = grid.nearestTile(sectorPoint("SOUTH", 0.65, 0.7));
export const CRATER_TILE = grid.nearestTile(sectorPoint("FRONT", -0.35, 0.5));
const reserved = new Set(
  [
    DEFAULT_START,
    DEFAULT_END,
    SOUTH_WAYPOINT,
    ...facilities.map((f) => f.tile),
  ].map(tileKey),
);
const ridgeSegments: [Tile, Tile][] = [
  [
    grid.nearestTile(sectorPoint("FRONT", 0.6, -0.55)),
    grid.nearestTile(sectorPoint("FRONT", 0.6, 0.6)),
  ],
  [
    grid.nearestTile(sectorPoint("NORTH", -0.3, 0.1)),
    grid.nearestTile(sectorPoint("NORTH", 0.4, 0.1)),
  ],
  [
    grid.nearestTile(sectorPoint("WEST", -0.3, -0.5)),
    grid.nearestTile(sectorPoint("WEST", -0.3, 0.5)),
  ],
];
const ridgeIds = new Set(
  ridgeSegments.flatMap(([a, b]) => grid.findPath(a, b)).map(tileKey),
);
const craterIds = new Set(grid.getTilesInRange(CRATER_TILE, 1).map(tileKey));

export function terrainAt(tile: Tile): Terrain {
  if (facilities.some((f) => sameId(f.tile, tile))) return "facility";
  if (reserved.has(tile.id)) return "plain";
  if (ridgeIds.has(tile.id)) return "ridge";
  if (craterIds.has(tile.id)) return "crater";
  return "plain";
}
const sameId = (a: Tile, b: Tile) => a.id === b.id;
export const blockedTiles = new Set(
  grid.tiles.filter((t) => terrainInfo[terrainAt(t)].blocked).map(tileKey),
);
export const pentagonTiles = grid.tiles.filter((t) => t.kind === "pentagon");
export const hexagonCount = grid.tiles.length - pentagonTiles.length;
