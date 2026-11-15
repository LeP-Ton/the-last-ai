export const SECTORS = [
  "FRONT",
  "EAST",
  "BACK",
  "WEST",
  "NORTH",
  "SOUTH",
] as const;
export type Sector = (typeof SECTORS)[number];
export type Vec3 = readonly [number, number, number];
export type Tile = {
  readonly id: string;
  readonly sector: Sector;
  readonly center: Vec3;
  readonly vertices: readonly Vec3[];
  readonly vertexIds: readonly number[];
  readonly neighborIds: readonly string[];
  readonly kind: "hexagon" | "pentagon";
  readonly area: number;
};
type Triangle = readonly [number, number, number];
type Frame = { normal: Vec3; right: Vec3; up: Vec3 };

// 分区只服务于导航和任务命名，不决定格子形状或连接关系。
export const SECTOR_FRAMES: Record<Sector, Frame> = {
  FRONT: { normal: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0] },
  EAST: { normal: [1, 0, 0], right: [0, 0, -1], up: [0, 1, 0] },
  BACK: { normal: [0, 0, -1], right: [-1, 0, 0], up: [0, 1, 0] },
  WEST: { normal: [-1, 0, 0], right: [0, 0, 1], up: [0, 1, 0] },
  NORTH: { normal: [0, 1, 0], right: [1, 0, 0], up: [0, 0, -1] },
  SOUTH: { normal: [0, -1, 0], right: [1, 0, 0], up: [0, 0, 1] },
};
export const tileKey = (tile: Pick<Tile, "id">): string => tile.id;
export const sameTile = (a: Pick<Tile, "id">, b: Pick<Tile, "id">): boolean =>
  a.id === b.id;
export const dot = (a: Vec3, b: Vec3): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const scale = (v: Vec3, k: number): Vec3 => [
  v[0] * k,
  v[1] * k,
  v[2] * k,
];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const subtract = (a: Vec3, b: Vec3): Vec3 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const normalize = (v: Vec3): Vec3 => {
  const length = Math.hypot(...v);
  if (!Number.isFinite(length) || length < 1e-12)
    throw new RangeError("方向向量必须非零且有限");
  return scale(v, 1 / length);
};
export const angularDistance = (a: Vec3, b: Vec3): number =>
  Math.acos(Math.max(-1, Math.min(1, dot(a, b))));

export function sectorPoint(sector: Sector, u: number, v: number): Vec3 {
  const frame = SECTOR_FRAMES[sector];
  return normalize(
    add(frame.normal, add(scale(frame.right, u), scale(frame.up, v))),
  );
}

export function tangentFrame(center: Vec3): { right: Vec3; up: Vec3 } {
  const reference: Vec3 = Math.abs(center[1]) < 0.95 ? [0, 1, 0] : [0, 0, -1];
  const right = normalize(cross(reference, center));
  return { right, up: cross(center, right) };
}

/** 球面三角形面积，单位为球面度，不用平面面积近似验收均匀性。 */
function triangleArea(a: Vec3, b: Vec3, c: Vec3): number {
  return (
    2 *
    Math.atan2(
      Math.abs(dot(a, cross(b, c))),
      1 + dot(a, b) + dot(b, c) + dot(c, a),
    )
  );
}

function polygonArea(center: Vec3, vertices: readonly Vec3[]): number {
  return vertices.reduce(
    (sum, a, i) =>
      sum + triangleArea(center, a, vertices[(i + 1) % vertices.length]),
    0,
  );
}

function buildIcosahedron(frequency: number) {
  const phi = (1 + Math.sqrt(5)) / 2;
  const baseCoordinates: Vec3[] = [
    [-1, phi, 0],
    [1, phi, 0],
    [-1, -phi, 0],
    [1, -phi, 0],
    [0, -1, phi],
    [0, 1, phi],
    [0, -1, -phi],
    [0, 1, -phi],
    [phi, 0, -1],
    [phi, 0, 1],
    [-phi, 0, -1],
    [-phi, 0, 1],
  ];
  const base = baseCoordinates.map(normalize);
  const faces: Triangle[] = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];
  const points: Vec3[] = [],
    triangles: Triangle[] = [];
  const indices = new Map<string, number>();
  function register(point: Vec3) {
    const unit = normalize(point),
      key = unit.map((v) => v.toFixed(9)).join(",");
    const existing = indices.get(key);
    if (existing !== undefined) return existing;
    const id = points.length;
    points.push(unit);
    indices.set(key, id);
    return id;
  }
  for (const face of faces) {
    const [a, b, c] = face.map((index) => base[index]);
    const lattice = new Map<string, number>();
    for (let i = 0; i <= frequency; i++)
      for (let j = 0; j <= frequency - i; j++) {
        const point = add(
          scale(a, (frequency - i - j) / frequency),
          add(scale(b, i / frequency), scale(c, j / frequency)),
        );
        lattice.set(`${i},${j}`, register(point));
      }
    const at = (i: number, j: number) => lattice.get(`${i},${j}`)!;
    for (let i = 0; i < frequency; i++)
      for (let j = 0; j < frequency - i; j++) {
        triangles.push([at(i, j), at(i + 1, j), at(i, j + 1)]);
        if (i + j < frequency - 1)
          triangles.push([at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]);
      }
  }
  return { points, triangles };
}

function dualVertices(points: Vec3[], triangles: Triangle[]): Vec3[] {
  return triangles.map(([ia, ib, ic]) => {
    const a = points[ia],
      b = points[ib],
      c = points[ic];
    // 球面外接圆中心等距于三个格心，得到真正共享的 Voronoi 顶点。
    let center = normalize(cross(subtract(b, a), subtract(c, a)));
    if (dot(center, a) < 0) center = scale(center, -1);
    return center;
  });
}

function sortedCorners(
  center: Vec3,
  triangleIds: number[],
  corners: Vec3[],
): number[] {
  const frame = tangentFrame(center);
  const angle = (id: number) =>
    Math.atan2(dot(corners[id], frame.up), dot(corners[id], frame.right));
  return [...triangleIds].sort((a, b) => angle(a) - angle(b));
}

export class HexSphereGrid {
  readonly tiles: readonly Tile[];
  readonly edgeCount: number;
  private readonly byId: Map<string, Tile>;

  constructor(
    readonly frequency = 6,
    readonly relaxationIterations = 24,
  ) {
    if (!Number.isInteger(frequency) || frequency < 1 || frequency > 20)
      throw new RangeError("细分频率必须为 1 至 20 的整数");
    if (
      !Number.isInteger(relaxationIterations) ||
      relaxationIterations < 0 ||
      relaxationIterations > 100
    )
      throw new RangeError("均匀化次数必须为 0 至 100 的整数");
    const mesh = buildIcosahedron(frequency),
      triangles = mesh.triangles;
    let points = mesh.points;
    const incident = points.map(() => [] as number[]);
    triangles.forEach((triangle, id) =>
      triangle.forEach((vertex) => incident[vertex].push(id)),
    );

    // Lloyd 松弛把格心移向球面单元的面积重心，减少直接径向投影的尺寸差异。
    for (let iteration = 0; iteration < relaxationIterations; iteration++) {
      const corners = dualVertices(points, triangles);
      points = points.map((center, index) => {
        const ids = sortedCorners(center, incident[index], corners);
        let centroid: Vec3 = [0, 0, 0];
        for (let i = 0; i < ids.length; i++) {
          const a = corners[ids[i]],
            b = corners[ids[(i + 1) % ids.length]];
          centroid = add(
            centroid,
            scale(
              normalize(add(center, add(a, b))),
              triangleArea(center, a, b),
            ),
          );
        }
        return normalize(centroid);
      });
    }

    // 最终共享角点采用三角形重心：保留松弛后的面积均匀性，同时改善五边形附近六边形的边长比例。
    const corners = triangles.map(([a, b, c]) =>
      normalize(add(points[a], add(points[b], points[c]))),
    );
    const idOf = (index: number) => `T${String(index).padStart(3, "0")}`;
    this.tiles = points.map((center, index): Tile => {
      const vertexIds = sortedCorners(center, incident[index], corners);
      const vertices = vertexIds.map((id) => corners[id]);
      const neighborIds = vertexIds.map((triangleId, i) => {
        const next = triangles[vertexIds[(i + 1) % vertexIds.length]];
        const neighbor = triangles[triangleId].find(
          (v) => v !== index && next.includes(v),
        );
        if (neighbor === undefined) throw new Error("网格公共边缺少相邻单元");
        return idOf(neighbor);
      });
      const sector = SECTORS.reduce(
        (best, candidate) =>
          dot(center, SECTOR_FRAMES[candidate].normal) >
          dot(center, SECTOR_FRAMES[best].normal)
            ? candidate
            : best,
        SECTORS[0],
      );
      return {
        id: idOf(index),
        sector,
        center,
        vertices,
        vertexIds,
        neighborIds,
        kind: vertexIds.length === 5 ? "pentagon" : "hexagon",
        area: polygonArea(center, vertices),
      };
    });
    this.byId = new Map(this.tiles.map((tile) => [tile.id, tile]));
    this.edgeCount =
      this.tiles.reduce((sum, tile) => sum + tile.neighborIds.length, 0) / 2;
  }

  getTile(id: string): Tile {
    const tile = this.byId.get(id);
    if (!tile) throw new RangeError(`无效格子：${id}`);
    return tile;
  }

  nearestTile(direction: Vec3): Tile {
    const point = normalize(direction);
    return this.tiles.reduce((best, tile) =>
      dot(tile.center, point) > dot(best.center, point) ? tile : best,
    );
  }

  getNeighbor(tile: Tile, edgeIndex: number): Tile {
    const source = this.getTile(tile.id);
    if (
      !Number.isInteger(edgeIndex) ||
      edgeIndex < 0 ||
      edgeIndex >= source.neighborIds.length
    )
      throw new RangeError("邻接边编号超出当前多边形范围");
    return this.getTile(source.neighborIds[edgeIndex]);
  }

  neighbors(tile: Tile): Tile[] {
    return this.getTile(tile.id).neighborIds.map((id) => this.getTile(id));
  }

  convertAcrossEdge(tile: Tile, edgeIndex: number) {
    const source = this.getTile(tile.id),
      next = this.getNeighbor(source, edgeIndex);
    return {
      tile: next,
      entryEdge: next.neighborIds.indexOf(source.id),
      crossedSector: source.sector !== next.sector,
      // 平行运输后的前进方向位于目标格的切平面，五边形处无需虚构第六个方向。
      heading: normalize(
        subtract(
          scale(next.center, dot(source.center, next.center)),
          source.center,
        ),
      ),
    };
  }

  position(tile: Tile, radius = 1): Vec3 {
    return scale(this.getTile(tile.id).center, radius);
  }

  private search(
    start: Tile,
    blocked: ReadonlySet<string>,
    maxDistance = Infinity,
    end?: Tile,
  ) {
    const source = this.getTile(start.id);
    const distances = new Map<string, number>([[source.id, 0]]),
      parents = new Map<string, Tile>();
    const queue: Tile[] = [source];
    if (blocked.has(source.id))
      return { queue: [], distances: new Map<string, number>(), parents };
    for (let head = 0; head < queue.length; head++) {
      const current = queue[head],
        distance = distances.get(current.id)!;
      if (end && sameTile(current, end)) break;
      if (distance >= maxDistance) continue;
      for (const next of this.neighbors(current)) {
        if (distances.has(next.id) || blocked.has(next.id)) continue;
        distances.set(next.id, distance + 1);
        parents.set(next.id, current);
        queue.push(next);
      }
    }
    return { queue, distances, parents };
  }

  findPath(
    start: Tile,
    end: Tile,
    options: { blocked?: ReadonlySet<string>; via?: Tile[] } = {},
  ): Tile[] {
    const source = this.getTile(start.id),
      target = this.getTile(end.id);
    const blocked = options.blocked ?? new Set<string>();
    const stops = [
      source,
      ...(options.via ?? []).map((tile) => this.getTile(tile.id)),
      target,
    ];
    const path = [source];
    for (let i = 1; i < stops.length; i++) {
      const from = stops[i - 1],
        to = stops[i],
        result = this.search(from, blocked, Infinity, to);
      if (!result.distances.has(to.id)) return [];
      const segment = [to];
      let cursor = to;
      while (!sameTile(cursor, from)) {
        cursor = result.parents.get(cursor.id)!;
        segment.push(cursor);
      }
      path.push(...segment.reverse().slice(1));
    }
    return path;
  }

  getDistance(a: Tile, b: Tile): number {
    return this.findPath(a, b).length - 1;
  }

  getTilesInRange(
    tile: Tile,
    range: number,
    blocked: ReadonlySet<string> = new Set(),
  ): Tile[] {
    if (!Number.isInteger(range) || range < 0)
      throw new RangeError("范围必须为非负整数");
    return this.search(tile, blocked, range).queue;
  }
}
