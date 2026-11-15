import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  SECTOR_LABELS,
  CRATER_TILE,
  blockedTiles,
  facilities,
  grid,
  mars,
  terrainAt,
  terrainInfo,
} from "../data/mars";
import {
  SECTORS,
  SECTOR_FRAMES,
  tangentFrame,
  type Vec3,
  tileKey,
  type Sector,
  type Tile,
} from "../game/grid/hexSphere";

type SceneEvents = {
  select: (tile: Tile) => void;
  hover: (tile: Tile | null) => void;
  progress: (step: number, done: boolean) => void;
  sector: (face: Sector) => void;
};
export type SceneOptions = {
  grid: boolean;
  terrain: boolean;
  range: boolean;
  topology: boolean;
  follow: boolean;
};
const PALETTE = [
  "#ac6850",
  "#548b88",
  "#71669b",
  "#9b8560",
  "#738777",
  "#528099",
];
const UP = new THREE.Vector3(0, 1, 0);
const vector = (v: readonly number[]) => new THREE.Vector3(v[0], v[1], v[2]);

function disposeTree(object: THREE.Object3D) {
  object.traverse((child) => {
    if (
      child instanceof THREE.Mesh ||
      child instanceof THREE.Line ||
      child instanceof THREE.Points
    ) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (const material of materials) {
        if ("map" in material && material.map instanceof THREE.Texture)
          material.map.dispose();
        material.dispose();
      }
    }
  });
}

export class PlanetScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(39, 1, 0.1, 160);
  private controls: OrbitControls;
  private observer: ResizeObserver;
  private frameId = 0;
  private disposed = false;
  private meshes: THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshStandardMaterial
  >[] = [];
  private gridLines = new THREE.Group();
  private decorations = new THREE.Group();
  private pathGroup = new THREE.Group();
  private probe = new THREE.Group();
  private raycaster = new THREE.Raycaster();
  private pointerDown: [number, number] = [0, 0];
  private selected: Tile | null = null;
  private hovered: Tile | null = null;
  private start: Tile | null = null;
  private end: Tile | null = null;
  private range = new Set<string>();
  private pathKeys = new Set<string>();
  private path: Tile[] = [];
  private samples: THREE.Vector3[] = [];
  private playing = false;
  private elapsed = 0;
  private lastTime = 0;
  private lastStep = -1;
  private reportedSector: Sector = "FRONT";
  private cameraTarget: THREE.Vector3 | null = null;
  private options: SceneOptions = {
    grid: true,
    terrain: true,
    range: true,
    topology: false,
    follow: false,
  };

  constructor(
    private host: HTMLDivElement,
    private events: SceneEvents,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "可旋转的火星三维网格，点击选择格子，拖动旋转，滚轮缩放",
    );
    this.renderer.domElement.setAttribute("role", "img");
    this.host.appendChild(this.renderer.domElement);
    this.camera.position.set(7.3, 5.5, 11.7);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.enablePan = false;
    this.controls.minDistance = 6.7;
    this.controls.maxDistance = 19;
    this.controls.minPolarAngle = 0.04;
    this.controls.maxPolarAngle = Math.PI - 0.04;
    this.controls.rotateSpeed = 0.55;
    this.controls.addEventListener("start", this.cancelFocus);

    this.scene.add(new THREE.AmbientLight(0x98b5c5, 1.35));
    const key = new THREE.DirectionalLight(0xffcba5, 3.7);
    key.position.set(-5, 8, 9);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x87bdd1, 2.4);
    rim.position.set(6, 2, -5);
    this.scene.add(rim);
    this.buildPlanet();
    this.buildSpace();
    this.buildFacilities();
    this.scene.add(
      this.gridLines,
      this.decorations,
      this.pathGroup,
      this.probe,
    );
    this.buildProbe();
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(host);
    this.resize();
    this.renderer.domElement.addEventListener(
      "pointerdown",
      this.onPointerDown,
    );
    this.renderer.domElement.addEventListener("pointerup", this.onPointerUp);
    this.renderer.domElement.addEventListener(
      "pointermove",
      this.onPointerMove,
    );
    this.renderer.domElement.addEventListener(
      "pointerleave",
      this.onPointerLeave,
    );
    this.frameId = requestAnimationFrame(this.animate);
  }

  private tileGeometry(tile: Tile): THREE.BufferGeometry {
    const radius = mars.radius + terrainInfo[terrainAt(tile)].height;
    const positions: number[] = [];
    const emit = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) =>
      positions.push(...a.toArray(), ...b.toArray(), ...c.toArray());
    const curvedTriangle = (
      a: THREE.Vector3,
      b: THREE.Vector3,
      c: THREE.Vector3,
      depth: number,
    ) => {
      if (!depth) {
        emit(a, b, c);
        return;
      }
      const ab = a.clone().add(b).normalize().multiplyScalar(radius);
      const bc = b.clone().add(c).normalize().multiplyScalar(radius);
      const ca = c.clone().add(a).normalize().multiplyScalar(radius);
      curvedTriangle(a, ab, ca, depth - 1);
      curvedTriangle(ab, b, bc, depth - 1);
      curvedTriangle(ca, bc, c, depth - 1);
      curvedTriangle(ab, bc, ca, depth - 1);
    };
    const center = vector(tile.center).multiplyScalar(radius);
    tile.vertices.forEach((corner, i) => {
      const next = tile.vertices[(i + 1) % tile.vertices.length];
      curvedTriangle(
        center,
        vector(corner).multiplyScalar(radius),
        vector(next).multiplyScalar(radius),
        2,
      );
      // 使用同一组共享边界点生成裙边，五边形也走完全相同的几何流程。
      for (let j = 0; j < 4; j++) {
        const point = (t: number) =>
          vector(corner).lerp(vector(next), t).normalize();
        const a = point(j / 4),
          b = point((j + 1) / 4);
        const topA = a.clone().multiplyScalar(radius),
          topB = b.clone().multiplyScalar(radius);
        const bottomA = a.clone().multiplyScalar(mars.radius - 0.03),
          bottomB = b.clone().multiplyScalar(mars.radius - 0.03);
        emit(topA, bottomA, topB);
        emit(topB, bottomA, bottomB);
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    const frame = tangentFrame(tile.center),
      uv: number[] = [];
    for (let i = 0; i < positions.length; i += 3) {
      const p = new THREE.Vector3(
        positions[i],
        positions[i + 1],
        positions[i + 2],
      );
      uv.push(
        p.dot(vector(frame.right)) * 0.85,
        p.dot(vector(frame.up)) * 0.85,
      );
    }
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geometry.computeVertexNormals();
    return geometry;
  }

  private edgePoints(a: Vec3, b: Vec3, radius: number) {
    return Array.from({ length: 5 }, (_, i) =>
      vector(a)
        .lerp(vector(b), i / 4)
        .normalize()
        .multiplyScalar(radius),
    );
  }

  private makeSurfaceTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#e1dfd8";
    context.fillRect(0, 0, 256, 256);
    // 固定种子的地表颗粒使刷新结果一致，也避免依赖远程贴图。
    let seed = 2077;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 18000; i++) {
      const tone = Math.floor(110 + random() * 130);
      context.fillStyle = `rgba(${tone},${tone},${tone},${0.08 + random() * 0.22})`;
      context.fillRect(
        random() * 256,
        random() * 256,
        0.6 + random() * 1.1,
        0.6 + random() * 1.1,
      );
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(
      8,
      this.renderer.capabilities.getMaxAnisotropy(),
    );
    return texture;
  }

  private buildPlanet() {
    const texture = this.makeSurfaceTexture();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(mars.radius - 0.03, 48, 48),
      new THREE.MeshStandardMaterial({ color: "#573d33", roughness: 1 }),
    );
    this.scene.add(core);
    for (const tile of grid.tiles) {
      const type = terrainAt(tile);
      const variation =
        (Math.sin(
          tile.center[0] * 97.71 +
            tile.center[1] * 139.14 +
            tile.center[2] * 61.3,
        ) +
          1) /
        2;
      const base = new THREE.Color(terrainInfo[type].color).multiplyScalar(
        0.76 + variation * 0.36,
      );
      const material = new THREE.MeshStandardMaterial({
        color: base,
        map: texture,
        roughness: 0.94,
        metalness: 0.12,
        flatShading: false,
        emissive: "#000000",
      });
      const mesh = new THREE.Mesh(this.tileGeometry(tile), material);
      mesh.userData = { tile, base };
      this.meshes.push(mesh);
      this.scene.add(mesh);
      const radius = mars.radius + terrainInfo[type].height + 0.005;
      const points = tile.vertices.flatMap((corner, i) =>
        this.edgePoints(
          corner,
          tile.vertices[(i + 1) % tile.vertices.length],
          radius,
        ).slice(0, -1),
      );
      const border = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({
          color: tile.kind === "pentagon" ? "#e7b07a" : "#dab596",
          transparent: true,
          opacity: tile.kind === "pentagon" ? 0.7 : 0.3,
        }),
      );
      this.gridLines.add(border);
      if (type === "ridge") this.addRocks(tile, variation);
      else if (tile.id === CRATER_TILE.id) this.addCrater(tile);
      else if (variation > 0.72 && type === "plain")
        this.addRocks(tile, variation, true);
    }
  }

  private attachToSurface(object: THREE.Object3D, tile: Tile, extra = 0) {
    const normal = vector(grid.position(tile));
    object.position.copy(
      normal
        .clone()
        .multiplyScalar(
          mars.radius + terrainInfo[terrainAt(tile)].height + extra,
        ),
    );
    object.quaternion.setFromUnitVectors(UP, normal);
    return object;
  }

  private addRocks(tile: Tile, seed: number, small = false) {
    const group = new THREE.Group();
    const count = small ? 2 : 4;
    for (let i = 0; i < count; i++) {
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(
          small ? 0.035 + seed * 0.025 : 0.1 + seed * 0.08,
          0,
        ),
        new THREE.MeshStandardMaterial({
          color: small ? "#795743" : "#544c48",
          roughness: 1,
          flatShading: true,
        }),
      );
      rock.position.set(
        Math.sin(i * 7.3 + seed) * 0.15,
        small ? 0.02 : 0.08,
        Math.cos(i * 5.1) * 0.15,
      );
      rock.scale.set(1.2, small ? 0.8 : 1.5, 0.8);
      rock.rotation.set(seed, i * 0.8, seed * 0.5);
      group.add(rock);
    }
    this.decorations.add(this.attachToSurface(group, tile));
  }

  private addCrater(tile: Tile) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.4, 0.032, 5, 48),
      new THREE.MeshStandardMaterial({ color: "#7b6050", roughness: 1 }),
    );
    ring.rotation.x = -Math.PI / 2;
    const group = new THREE.Group();
    group.add(ring);
    this.decorations.add(this.attachToSurface(group, tile, 0.015));
  }

  private buildFacilities() {
    for (const facility of facilities) {
      const group = new THREE.Group();
      const steel = new THREE.MeshStandardMaterial({
        color: "#9baaa7",
        roughness: 0.6,
        metalness: 0.65,
      });
      const dark = new THREE.MeshStandardMaterial({
        color: "#263b3d",
        roughness: 0.7,
        metalness: 0.6,
      });
      const glow = new THREE.MeshBasicMaterial({ color: "#78ddc5" });
      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.26, 0.045, 6),
        dark,
      );
      group.add(pad);
      for (let i = 0; i < 3; i++) {
        const block = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.1 + i * 0.06, 0.14),
          steel,
        );
        block.position.set((i - 1) * 0.13, 0.07 + i * 0.03, 0);
        group.add(block);
      }
      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(0.016, 0.027, 0.48, 6),
        steel,
      );
      tower.position.set(0, 0.24, -0.12);
      group.add(tower);
      const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.048), glow);
      beacon.position.set(0, 0.51, -0.12);
      group.add(beacon);
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.31, 0.006, 5, 48),
        glow,
      );
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 0.026;
      group.add(halo);
      if (facility.kind === "energy") {
        for (const side of [-1, 1]) {
          const panel = new THREE.Mesh(
            new THREE.BoxGeometry(0.24, 0.012, 0.2),
            new THREE.MeshStandardMaterial({
              color: "#345b65",
              metalness: 0.6,
              roughness: 0.4,
            }),
          );
          panel.position.set(side * 0.32, 0.075, 0.01);
          panel.rotation.z = side * 0.12;
          group.add(panel);
        }
      }
      this.decorations.add(this.attachToSurface(group, facility.tile, 0.01));
    }
  }

  private buildSpace() {
    const stars: number[] = [];
    for (let i = 0; i < 650; i++) {
      const y = 1 - (i / 649) * 2,
        radius = Math.sqrt(1 - y * y),
        theta = i * 2.399963;
      stars.push(
        Math.cos(theta) * radius * 65,
        y * 65,
        Math.sin(theta) * radius * 65,
      );
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(stars, 3),
    );
    this.scene.add(
      new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
          color: "#8caaa9",
          size: 0.042,
          transparent: true,
          opacity: 0.65,
          sizeAttenuation: true,
        }),
      ),
    );
    for (const radius of [4.05, 4.16]) {
      const pts = Array.from(
        { length: 181 },
        (_, i) =>
          new THREE.Vector3(
            Math.cos((i * Math.PI) / 90) * radius,
            0,
            Math.sin((i * Math.PI) / 90) * radius,
          ),
      );
      const orbit = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({
          color: "#7caaa2",
          transparent: true,
          opacity: radius === 4.05 ? 0.22 : 0.08,
        }),
      );
      orbit.rotation.x = 0.18;
      orbit.rotation.z = -0.12;
      this.scene.add(orbit);
    }
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(mars.radius + 0.11, 64, 64),
      new THREE.ShaderMaterial({
        vertexShader:
          "varying vec3 n; varying vec3 p; void main(){n=normalize(normalMatrix*normal); vec4 v=modelViewMatrix*vec4(position,1.0);p=v.xyz;gl_Position=projectionMatrix*v;}",
        fragmentShader:
          "varying vec3 n; varying vec3 p; void main(){float f=pow(1.0-abs(dot(normalize(n),normalize(-p))),4.0);gl_FragColor=vec4(0.8,0.39,0.19,f*0.22);}",
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.scene.add(atmosphere);
  }

  private buildProbe() {
    const point = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 12, 12),
      new THREE.MeshBasicMaterial({ color: "#fff2bc" }),
    );
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 12, 12),
      new THREE.MeshBasicMaterial({
        color: "#f9ad65",
        transparent: true,
        opacity: 0.2,
      }),
    );
    this.probe.add(point, halo);
    this.probe.visible = false;
  }

  setSelection(selected: Tile, start: Tile, end: Tile | null, range: number) {
    this.selected = selected;
    this.start = start;
    this.end = end;
    this.range = new Set(
      grid.getTilesInRange(selected, range, blockedTiles).map(tileKey),
    );
    this.colorTiles();
  }

  setOptions(options: SceneOptions) {
    this.options = options;
    this.gridLines.visible = options.grid;
    this.decorations.visible = options.terrain;
    this.colorTiles();
  }

  private colorTiles() {
    for (const mesh of this.meshes) {
      const tile: Tile = mesh.userData.tile,
        key = tileKey(tile);
      const material = mesh.material;
      material.color.copy(
        this.options.topology
          ? new THREE.Color(PALETTE[SECTORS.indexOf(tile.sector)])
          : mesh.userData.base,
      );
      material.emissive.set("#000000");
      material.emissiveIntensity = 0.2;
      if (this.options.range && this.range.has(key)) {
        material.color.lerp(new THREE.Color("#628c79"), 0.32);
      }
      if (this.pathKeys.has(key)) {
        material.color.lerp(new THREE.Color("#ecb466"), 0.3);
        material.emissive.set("#965c20");
      }
      if (this.start && key === tileKey(this.start)) {
        material.color.set("#5caf9c");
        material.emissive.set("#246b5c");
      }
      if (this.end && key === tileKey(this.end)) {
        material.color.set("#d69753");
        material.emissive.set("#9a5a21");
      }
      if (this.selected && key === tileKey(this.selected)) {
        material.color.lerp(new THREE.Color("#bde8d5"), 0.45);
        material.emissive.set("#4d8c75");
      }
      if (this.hovered && key === tileKey(this.hovered)) {
        material.color.lerp(new THREE.Color("#ffffff"), 0.25);
      }
    }
  }

  setPath(path: Tile[]) {
    this.stop();
    this.path = path;
    this.pathKeys = new Set(path.map(tileKey));
    disposeTree(this.pathGroup);
    this.pathGroup.clear();
    this.samples = [];
    for (let i = 0; i < path.length - 1; i++) {
      const a = vector(grid.position(path[i])),
        b = vector(grid.position(path[i + 1]));
      for (let j = 0; j < 12; j++)
        this.samples.push(
          a
            .clone()
            .lerp(b, j / 12)
            .normalize()
            .multiplyScalar(mars.radius + 0.25),
        );
    }
    if (path.length)
      this.samples.push(
        vector(grid.position(path[path.length - 1], mars.radius + 0.25)),
      );
    if (this.samples.length > 1) {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(this.samples),
        new THREE.LineBasicMaterial({ color: "#f8cf83" }),
      );
      this.pathGroup.add(line);
      path.forEach((tile, i) => {
        const node = new THREE.Mesh(
          new THREE.SphereGeometry(
            i === 0 || i === path.length - 1 ? 0.058 : 0.022,
            8,
            8,
          ),
          new THREE.MeshBasicMaterial({
            color: i === 0 ? "#9ffce0" : "#ffe3a9",
          }),
        );
        node.position.copy(vector(grid.position(tile, mars.radius + 0.25)));
        this.pathGroup.add(node);
      });
    }
    this.colorTiles();
  }

  play() {
    if (this.path.length < 2) return;
    this.playing = true;
    this.elapsed = 0;
    this.lastStep = -1;
    this.probe.visible = true;
  }

  stop() {
    this.playing = false;
    this.probe.visible = false;
  }

  focusSector(face: Sector) {
    const normal = vector(SECTOR_FRAMES[face].normal);
    if (face === "NORTH" || face === "SOUTH") normal.z = 0.2;
    else normal.y += 0.12;
    this.cameraTarget = normal
      .normalize()
      .multiplyScalar(this.camera.position.length());
  }

  focusTile(tile: Tile) {
    const direction = vector(grid.position(tile));
    if (Math.abs(direction.y) > 0.98) direction.z += 0.1;
    this.cameraTarget = direction
      .normalize()
      .multiplyScalar(this.camera.position.length());
  }

  resetCamera() {
    this.cameraTarget = new THREE.Vector3(7.3, 5.5, 11.7);
  }
  zoom(amount: number) {
    const distance = THREE.MathUtils.clamp(
      this.camera.position.length() + amount,
      this.controls.minDistance,
      this.controls.maxDistance,
    );
    this.cameraTarget = this.camera.position
      .clone()
      .normalize()
      .multiplyScalar(distance);
  }

  private cancelFocus = () => {
    this.cameraTarget = null;
  };
  private resize = () => {
    const { width, height } = this.host.getBoundingClientRect();
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private pick(event: PointerEvent): Tile | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(mouse, this.camera);
    const intersection = this.raycaster.intersectObjects(this.meshes, false)[0];
    return intersection ? (intersection.object.userData.tile as Tile) : null;
  }

  private onPointerDown = (e: PointerEvent) => {
    this.pointerDown = [e.clientX, e.clientY];
  };
  private onPointerUp = (e: PointerEvent) => {
    if (
      e.button !== 0 ||
      Math.hypot(
        e.clientX - this.pointerDown[0],
        e.clientY - this.pointerDown[1],
      ) > 5
    )
      return;
    const tile = this.pick(e);
    if (tile) this.events.select(tile);
  };
  private onPointerMove = (e: PointerEvent) => {
    if (e.buttons) return;
    const tile = this.pick(e);
    if (
      (tile ? tileKey(tile) : "") ===
      (this.hovered ? tileKey(this.hovered) : "")
    )
      return;
    this.hovered = tile;
    this.events.hover(tile);
    this.colorTiles();
    this.renderer.domElement.style.cursor = tile ? "pointer" : "grab";
  };
  private onPointerLeave = () => {
    this.hovered = null;
    this.events.hover(null);
    this.colorTiles();
  };

  private animate = (now: number) => {
    if (this.disposed) return;
    const delta = Math.min((now - (this.lastTime || now)) / 1000, 0.05);
    this.lastTime = now;
    if (this.playing && this.samples.length > 1) {
      this.elapsed += delta;
      const progress = Math.min(
        this.elapsed / ((this.path.length - 1) * 0.3),
        1,
      );
      const index = progress * (this.samples.length - 1),
        lower = Math.floor(index);
      this.probe.position
        .copy(this.samples[lower])
        .lerp(
          this.samples[Math.min(lower + 1, this.samples.length - 1)],
          index - lower,
        );
      const step = Math.min(
        Math.floor(progress * (this.path.length - 1)),
        this.path.length - 1,
      );
      if (step !== this.lastStep || progress === 1) {
        this.events.progress(step, progress === 1);
        this.lastStep = step;
      }
      if (this.options.follow)
        this.cameraTarget = this.probe.position
          .clone()
          .normalize()
          .multiplyScalar(this.camera.position.length());
      if (progress === 1) this.playing = false;
    }
    if (this.cameraTarget) {
      const current = this.camera.position.clone().normalize();
      const target = this.cameraTarget.clone().normalize();
      const rotation = new THREE.Quaternion().setFromUnitVectors(
        current,
        target,
      );
      const fraction = 1 - Math.exp(-delta * 4);
      current.applyQuaternion(new THREE.Quaternion().slerp(rotation, fraction));
      const distance = THREE.MathUtils.lerp(
        this.camera.position.length(),
        this.cameraTarget.length(),
        fraction,
      );
      this.camera.position.copy(current.multiplyScalar(distance));
      if (this.camera.position.distanceTo(this.cameraTarget) < 0.008)
        this.cameraTarget = null;
    }
    this.controls.update();
    const view = this.camera.position.clone().normalize();
    let bestSector: Sector = "FRONT",
      bestDot = -Infinity;
    for (const face of SECTORS) {
      const dot = view.dot(vector(SECTOR_FRAMES[face].normal));
      if (dot > bestDot) {
        bestDot = dot;
        bestSector = face;
      }
    }
    if (bestSector !== this.reportedSector) {
      this.reportedSector = bestSector;
      this.events.sector(bestSector);
    }
    this.updateLabels();
    this.renderer.render(this.scene, this.camera);
    this.frameId = requestAnimationFrame(this.animate);
  };

  private updateLabels() {
    for (const facility of facilities) {
      const element = this.host.parentElement?.querySelector<HTMLElement>(
        `[data-facility="${facility.id}"]`,
      );
      if (!element) continue;
      const world = vector(grid.position(facility.tile, mars.radius + 0.55));
      const visible =
        world
          .clone()
          .normalize()
          .dot(this.camera.position.clone().sub(world).normalize()) > 0.08;
      const point = world.project(this.camera);
      const screenX =
        this.host.offsetLeft + ((point.x + 1) / 2) * this.host.clientWidth;
      const screenY =
        this.host.offsetTop + ((-point.y + 1) / 2) * this.host.clientHeight;
      const inViewport =
        screenY > 100 && screenY < this.host.parentElement!.clientHeight - 200;
      const show = visible && inViewport && this.options.terrain;
      element.style.opacity = show ? "1" : "0";
      element.style.pointerEvents = show ? "auto" : "none";
      element.style.left = `${screenX}px`;
      element.style.top = `${screenY}px`;
    }
    this.host.dataset.sector = SECTOR_LABELS[this.reportedSector];
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.observer.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    canvas.removeEventListener("pointerup", this.onPointerUp);
    canvas.removeEventListener("pointermove", this.onPointerMove);
    canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.controls.removeEventListener("start", this.cancelFocus);
    this.controls.dispose();
    disposeTree(this.scene);
    this.renderer.dispose();
    canvas.remove();
  }
}
