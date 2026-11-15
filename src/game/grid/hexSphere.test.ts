import test from "node:test";
import assert from "node:assert/strict";
import {
  HexSphereGrid,
  angularDistance,
  dot,
  sameTile,
  scale,
  SECTORS,
  type Vec3,
} from "./hexSphere";
import {
  grid,
  blockedTiles,
  DEFAULT_START,
  DEFAULT_END,
  SOUTH_WAYPOINT,
  facilities,
} from "../../data/mars";

test("蜂窝球面由 350 个六边形和 12 个五边形组成，满足欧拉公式", () => {
  assert.equal(grid.tiles.length, 362);
  assert.equal(grid.tiles.filter((t) => t.kind === "hexagon").length, 350);
  assert.equal(grid.tiles.filter((t) => t.kind === "pentagon").length, 12);
  assert.equal(grid.edgeCount, 1080);
  const vertices = new Set(grid.tiles.flatMap((tile) => [...tile.vertexIds]));
  assert.equal(vertices.size - grid.edgeCount + grid.tiles.length, 2);
  assert.equal(grid.getTilesInRange(DEFAULT_START, 100).length, 362);
});

test("不同细分频率都只有 12 个五边形，不产生四边形或孤立格", () => {
  for (const frequency of [1, 2, 3, 8]) {
    const g = new HexSphereGrid(frequency, 4);
    assert.equal(g.tiles.length, 10 * frequency * frequency + 2);
    assert.equal(g.tiles.filter((t) => t.vertices.length === 5).length, 12);
    assert.ok(
      g.tiles.every((t) => t.vertices.length === 5 || t.vertices.length === 6),
    );
    assert.equal(g.getTilesInRange(g.tiles[0], 100).length, g.tiles.length);
  }
});

test("所有相邻边双向互逆，共享几何端点相同，运输后的朝向位于目标切平面", () => {
  let directedEdges = 0,
    crossSectorEdges = 0;
  for (const tile of grid.tiles) {
    assert.equal(new Set(tile.neighborIds).size, tile.vertices.length);
    tile.neighborIds.forEach((_, index) => {
      const transition = grid.convertAcrossEdge(tile, index),
        next = transition.tile;
      assert.equal(grid.getNeighbor(next, transition.entryEdge).id, tile.id);
      assert.equal(
        tile.vertexIds[index],
        next.vertexIds[(transition.entryEdge + 1) % next.vertices.length],
      );
      assert.equal(
        tile.vertexIds[(index + 1) % tile.vertices.length],
        next.vertexIds[transition.entryEdge],
      );
      assert.deepEqual(
        tile.vertices[index],
        next.vertices[(transition.entryEdge + 1) % next.vertices.length],
      );
      assert.ok(Math.abs(dot(transition.heading, next.center)) < 1e-10);
      assert.ok(Math.abs(Math.hypot(...transition.heading) - 1) < 1e-10);
      directedEdges++;
      if (transition.crossedSector) crossSectorEdges++;
    });
  }
  assert.equal(directedEdges, grid.edgeCount * 2);
  assert.ok(crossSectorEdges > 0);
});

test("全部格子覆盖 4π 球面面积，顶点在单位球上", () => {
  assert.ok(
    Math.abs(
      grid.tiles.reduce((sum, tile) => sum + tile.area, 0) - 4 * Math.PI,
    ) < 1e-10,
  );
  for (const tile of grid.tiles) {
    for (const point of [tile.center, ...tile.vertices])
      assert.ok(Math.abs(Math.hypot(...point) - 1) < 1e-10);
    assert.ok(tile.area > 0);
  }
});

test("六边形面积相对标准差小于 3%，每格边长最大比小于 1.17", () => {
  const hexagons = grid.tiles.filter((tile) => tile.kind === "hexagon");
  const mean =
    hexagons.reduce((sum, tile) => sum + tile.area, 0) / hexagons.length;
  const cv =
    Math.sqrt(
      hexagons.reduce((sum, tile) => sum + (tile.area - mean) ** 2, 0) /
        hexagons.length,
    ) / mean;
  assert.ok(cv < 0.03);
  for (const tile of hexagons) {
    const lengths = tile.vertices.map((a, i) =>
      angularDistance(a, tile.vertices[(i + 1) % 6]),
    );
    assert.ok(Math.max(...lengths) / Math.min(...lengths) < 1.17);
  }
});

test("六边形和五边形的一步范围分别包含 7 格和 6 格", () => {
  const hexagon = grid.tiles.find((t) => t.kind === "hexagon")!;
  const pentagon = grid.tiles.find((t) => t.kind === "pentagon")!;
  assert.equal(grid.getTilesInRange(hexagon, 1).length, 7);
  assert.equal(grid.getTilesInRange(pentagon, 1).length, 6);
  assert.throws(() => grid.getNeighbor(pentagon, 5));
  assert.equal(grid.getDistance(hexagon, grid.neighbors(hexagon)[0]), 1);
  const coarse = new HexSphereGrid(1, 0),
    start = coarse.tiles[0];
  assert.equal(
    coarse.getDistance(start, coarse.nearestTile(scale(start.center, -1))),
    3,
  );
});

test("指定南区的固定路线连续跨区，所有设施和途经点均可通行", () => {
  const path = grid.findPath(DEFAULT_START, DEFAULT_END, {
    blocked: blockedTiles,
    via: [SOUTH_WAYPOINT],
  });
  assert.equal(path.length - 1, 8);
  assert.deepEqual(
    path
      .filter((tile, i) => !i || tile.sector !== path[i - 1].sector)
      .map((t) => t.sector),
    ["FRONT", "SOUTH", "EAST"],
  );
  assert.ok(path.some((t) => sameTile(t, SOUTH_WAYPOINT)));
  path.forEach((tile, index) => {
    assert.ok(!blockedTiles.has(tile.id));
    if (index)
      assert.ok(grid.neighbors(path[index - 1]).some((t) => sameTile(t, tile)));
  });
  for (const facility of facilities)
    assert.ok(!blockedTiles.has(facility.tile.id));
});

test("五边形参与寻路，跨区距离对称，分区不会切断邻接图", () => {
  for (const pentagon of grid.tiles.filter((t) => t.kind === "pentagon")) {
    for (const neighbor of grid.neighbors(pentagon))
      assert.equal(grid.findPath(pentagon, neighbor).length, 2);
  }
  for (const sector of SECTORS) {
    const target = grid.tiles.find((t) => t.sector === sector)!;
    const path = grid.findPath(DEFAULT_START, target);
    assert.ok(path.length > 0);
    assert.equal(path.length - 1, grid.getDistance(target, DEFAULT_START));
  }
});

test("阻挡、同格、非法格子和非法边索引都有明确结果", () => {
  const isolated = new Set(DEFAULT_START.neighborIds);
  assert.deepEqual(
    grid.findPath(DEFAULT_START, DEFAULT_END, { blocked: isolated }),
    [],
  );
  assert.deepEqual(grid.findPath(DEFAULT_START, DEFAULT_START), [
    DEFAULT_START,
  ]);
  assert.deepEqual(
    grid.findPath(DEFAULT_START, DEFAULT_START, {
      blocked: new Set([DEFAULT_START.id]),
    }),
    [],
  );
  assert.throws(() => grid.getTile("T不存在"));
  assert.throws(() => grid.getTilesInRange(DEFAULT_START, -1));
  assert.throws(() => grid.getNeighbor(DEFAULT_START, -1));
  assert.throws(() => grid.getNeighbor(DEFAULT_START, 0.5));
  assert.throws(() => new HexSphereGrid(0));
  assert.throws(() => new HexSphereGrid(2, -1));
  assert.throws(() => grid.nearestTile([0, 0, 0] as Vec3));
});

test("重建相同配置产生稳定格子编号、顶点与邻接关系", () => {
  assert.deepEqual(new HexSphereGrid(6).tiles, grid.tiles);
});
