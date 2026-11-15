import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  ChevronRight,
  CircleHelp,
  Crosshair,
  Focus,
  Globe2,
  Hexagon,
  Layers3,
  LocateFixed,
  MapPin,
  Maximize,
  Minus,
  Mountain,
  Navigation,
  Orbit,
  Play,
  Radio,
  RotateCcw,
  Route,
  ScanLine,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Terminal,
  X,
  Zap,
  Plus,
  Flag,
  CircleDot,
} from "lucide-react";
import {
  blockedTiles,
  DEFAULT_END,
  DEFAULT_START,
  SECTOR_CODES,
  SECTOR_LABELS,
  facilities,
  pentagonTiles,
  hexagonCount,
  grid,
  mars,
  SOUTH_WAYPOINT,
  terrainAt,
  terrainInfo,
} from "../data/mars";
import {
  SECTORS,
  tileKey,
  type Sector,
  type Tile,
} from "../game/grid/hexSphere";
import { PlanetScene, type SceneOptions } from "../rendering/PlanetScene";

type Mode = "inspect" | "start" | "end";
type Modal = "brief" | "roadmap" | "help" | null;
const formatTile = (t: Tile) => `${SECTOR_CODES[t.sector]} · ${t.id}`;
const stages = [
  "球面网格",
  "单位系统",
  "战斗规则",
  "WEGO 同时行动",
  "自主 AI",
  "星球控制",
  "指挥界面",
  "阵营与剧情",
];

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<PlanetScene | null>(null);
  const [selected, setSelected] = useState<Tile>(DEFAULT_START);
  const [start, setStart] = useState<Tile>(DEFAULT_START);
  const [end, setEnd] = useState<Tile | null>(DEFAULT_END);
  const [hovered, setHovered] = useState<Tile | null>(null);
  const [viewSector, setViewSector] = useState<Sector>("FRONT");
  const [mode, setMode] = useState<Mode>("inspect");
  const [viaSouth, setViaSouth] = useState(true);
  const [range, setRange] = useState(3);
  const [options, setOptions] = useState<SceneOptions>({
    grid: true,
    terrain: true,
    range: true,
    topology: false,
    follow: false,
  });
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const [notice, setNotice] = useState(
    "已载入南区绕行示例。选择格子，规划你的路线。",
  );
  const [sceneError, setSceneError] = useState("");
  const callbacksRef = useRef({
    select: (_tile: Tile) => {},
    progress: (_step: number, _done: boolean) => {},
  });

  const path = useMemo(
    () =>
      end
        ? grid.findPath(start, end, {
            blocked: blockedTiles,
            via: viaSouth ? [SOUTH_WAYPOINT] : [],
          })
        : [],
    [start, end, viaSouth],
  );
  const transitions = path.reduce<Tile[]>((list, t, i) => {
    if (i === 0 || t.sector !== path[i - 1].sector) list.push(t);
    return list;
  }, []);
  const terrain = terrainInfo[terrainAt(selected)];
  const reachCount = grid.getTilesInRange(selected, range, blockedTiles).length;
  const steps = Math.max(0, path.length - 1);
  const crossingCount = Math.max(0, transitions.length - 1);

  function chooseTile(tile: Tile) {
    setSelected(tile);
    if (mode === "inspect") return;
    if (blockedTiles.has(tileKey(tile))) {
      setNotice("山脊不可通行，请选择其他格子。");
      return;
    }
    if (mode === "start") setStart(tile);
    else setEnd(tile);
    setMode("inspect");
    setNotice(
      `已设置${mode === "start" ? "起点" : "终点"}：${SECTOR_LABELS[tile.sector]} ${tile.id}`,
    );
  }

  callbacksRef.current = {
    select: chooseTile,
    progress: (step, done) => {
      setProgress(step);
      if (done) {
        setPlaying(false);
        setNotice("路线预演完成。路径探针已连续通过全部格子。");
      }
    },
  };

  useEffect(() => {
    if (!hostRef.current) return;
    let scene: PlanetScene | null = null;
    try {
      scene = new PlanetScene(hostRef.current, {
        select: (tile) => callbacksRef.current.select(tile),
        hover: setHovered,
        progress: (step, done) => callbacksRef.current.progress(step, done),
        sector: setViewSector,
      });
      sceneRef.current = scene;
    } catch (error) {
      setSceneError(
        error instanceof Error ? error.message : "无法初始化 3D 场景",
      );
    }
    return () => {
      scene?.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setSelection(selected, start, end, range);
  }, [selected, start, end, range]);
  useEffect(() => {
    sceneRef.current?.setOptions(options);
  }, [options]);
  useEffect(() => {
    sceneRef.current?.setPath(path);
    setPlaying(false);
    setProgress(0);
  }, [path]);

  function toggleOption(key: keyof SceneOptions) {
    setOptions((current) => ({ ...current, [key]: !current[key] }));
  }
  function focusSector(face: Sector) {
    sceneRef.current?.focusSector(face);
  }
  function play() {
    if (playing) {
      sceneRef.current?.stop();
      setPlaying(false);
      setNotice("预演已停止，可重新规划路线。");
      return;
    }
    if (path.length < 2 || sceneError) return;
    sceneRef.current?.play();
    setPlaying(true);
    setProgress(0);
    setNotice("路径探针正在沿球面移动；这不是战斗回合。");
  }
  function reset() {
    sceneRef.current?.stop();
    sceneRef.current?.resetCamera();
    setSelected(DEFAULT_START);
    setStart(DEFAULT_START);
    setEnd(DEFAULT_END);
    setViaSouth(true);
    setMode("inspect");
    setProgress(0);
    setPlaying(false);
    setNotice("已恢复南区绕行示例。");
  }
  function selectFacility(tile: Tile) {
    setSelected(tile);
    sceneRef.current?.focusTile(tile);
  }

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (
        (event.target as HTMLElement).matches("input, select, textarea, button")
      )
        return;
      if (event.key === "Escape") {
        setModal(null);
        setMode("inspect");
      }
      if (modal) return;
      if (event.code === "Space") {
        event.preventDefault();
        play();
      }
      if (event.key.toLowerCase() === "g") toggleOption("grid");
      if (/^[1-6]$/.test(event.key))
        focusSector(SECTORS[Number(event.key) - 1]);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLDialogElement>("dialog");
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, [modal]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            reset();
          }}
          aria-label="最后的 AI，恢复初始视图"
        >
          <span className="brand-symbol">
            <Box size={29} strokeWidth={1.35} />
          </span>
          <span>
            <strong>
              最后的 <b>AI</b>
            </strong>
            <small>THE LAST AI</small>
          </span>
        </a>
        <div className="header-divider" />
        <nav className="main-nav" aria-label="主导航">
          <button className="nav-active" onClick={() => setModal(null)}>
            <Orbit size={15} />
            战术沙盘<span className="small-tag">01</span>
          </button>
          <button onClick={() => setModal("brief")}>
            <Flag size={14} />
            任务简报
          </button>
          <button onClick={() => setModal("roadmap")}>
            <Layers3 size={15} />
            开发路线
          </button>
        </nav>
        <div className="header-right">
          <span className="live-dot" />
          <span>本地系统在线</span>
          <span className="gamex">
            GAME<span>X</span>
          </span>
          <button
            className="icon-button"
            title="操作帮助"
            aria-label="操作帮助"
            onClick={() => setModal("help")}
          >
            <CircleHelp size={18} />
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="left-panel">
          <div className="panel-heading">
            <span>战区总览</span>
            <span className="tiny-code">SECTOR / 04</span>
          </div>
          <section className="operation-card">
            <div className="eyebrow">
              <span className="live-dot orange" />
              火星地表 · 2077
            </div>
            <h1>
              阿瑞斯行动
              <ArrowUpRight size={19} />
            </h1>
            <p>文明的最后一道防线。</p>
            <div className="phase-badge">
              <span>PHASE 01</span>球面网格验证
            </div>
          </section>
          <section className="section map-summary">
            <div className="section-title">
              <Globe2 size={14} />
              <h2>行星数据</h2>
            </div>
            <div className="stats-three">
              <div>
                <strong>{grid.tiles.length}</strong>
                <span>地表网格</span>
              </div>
              <div>
                <strong>{hexagonCount}</strong>
                <span>六边形</span>
              </div>
              <div>
                <strong>{pentagonTiles.length}</strong>
                <span>五边形</span>
              </div>
            </div>
            <div className="data-row">
              <span>拓扑结构</span>
              <b>均匀化蜂窝球面</b>
            </div>
            <div className="data-row">
              <span>表面重力</span>
              <b>
                {mars.gravity}
                <em> m/s²</em>
              </b>
            </div>
            <div className="data-row">
              <span>平均温度</span>
              <b>
                {mars.temperature}
                <em> °C</em>
              </b>
            </div>
            <div className="connection-status">
              <ShieldCheck size={13} />
              <span>全局蜂窝连接已建立</span>
              <span className="status-bars">▂▅▇</span>
            </div>
          </section>
          <section className="section facilities-section">
            <div className="section-title">
              <MapPin size={14} />
              <h2>战略地标</h2>
              <span className="section-count">03</span>
            </div>
            <p className="section-note">地形预览 · 占领系统待接入</p>
            {facilities.map((f) => (
              <button
                key={f.id}
                className={`facility-card ${tileKey(selected) === tileKey(f.tile) ? "selected" : ""}`}
                onClick={() => selectFacility(f.tile)}
              >
                <span className="facility-icon">
                  {f.kind === "energy" ? (
                    <Zap size={18} />
                  ) : f.kind === "relay" ? (
                    <Radio size={18} />
                  ) : (
                    <Terminal size={18} />
                  )}
                </span>
                <span>
                  <strong>{f.name}</strong>
                  <small>
                    {SECTOR_LABELS[f.tile.sector]} <span>·</span> {f.subtitle}
                  </small>
                </span>
                <ChevronRight size={13} />
              </button>
            ))}
          </section>
          <section className="section topology-section">
            <div className="section-title">
              <Box size={14} />
              <h2>方位导航</h2>
              <span className="tiny-code">1–6</span>
            </div>
            <div className="sector-nav" aria-label="六个方位分区导航">
              {SECTORS.map((face, i) => (
                <button
                  key={face}

                  className={`${viewSector === face ? "active" : ""} ${path.some((t) => t.sector === face) ? "on-path" : ""}`}
                  onClick={() => focusSector(face)}
                  title={`${SECTOR_LABELS[face]} · 快捷键 ${i + 1}`}
                  aria-label={`对准${SECTOR_LABELS[face]}`}
                >
                  <span>{SECTOR_CODES[face]}</span>
                  <small>{SECTOR_LABELS[face]}</small>
                </button>
              ))}
            </div>
            <div className="net-caption">
              <span className="legend-dot" />
              当前观察区
              <span className="path-key" />
              规划经过区
            </div>
          </section>
          <button
            className="pentagon-link"
            onClick={() => {
              const index = pentagonTiles.findIndex(
                (t) => t.id === selected.id,
              );
              selectFacility(pentagonTiles[(index + 1) % pentagonTiles.length]);
            }}
          >
            <Hexagon size={13} />
            查看五边形单元<span>12</span>
          </button>
          <div className="left-footer">
            <span className="outline-cube">
              <Box size={16} />
            </span>
            <p>
              没有边界。
              <br />
              <strong>只有尚未发现的侧翼。</strong>
            </p>
          </div>
        </aside>

        <section className="battlefield" aria-label="三维火星战场">
          <div className="stage-topbar">
            <div>
              <span className="live-dot" />
              地表链路稳定<span className="muted">/</span>
              <span className="mono">MARS—04</span>
            </div>
            <span className="stage-build">
              开发原型 <span>v0.2</span>
            </span>
          </div>
          <div className="planet-heading">
            <div className="eyebrow">SOL SYSTEM / TERRESTRIAL 04</div>
            <div className="planet-title">
              火星<span>MARS</span>
            </div>
            <p>
              乌托邦平原 <span>·</span> 全域地形扫描
            </p>
          </div>
          <div className="view-tabs" aria-label="视图模式">
            <button
              className={!options.topology ? "active" : ""}
              onClick={() => setOptions((s) => ({ ...s, topology: false }))}
            >
              <Mountain size={13} />
              地形视图
            </button>
            <button
              className={options.topology ? "active" : ""}
              onClick={() => setOptions((s) => ({ ...s, topology: true }))}
            >
              <Box size={13} />
              分区视图
            </button>
          </div>
          <div className="scene-host" ref={hostRef} />
          {sceneError && (
            <div className="scene-error">
              <CircleHelp size={28} />
              <h2>无法启动 3D 场景</h2>
              <p>请使用支持 WebGL 2 的浏览器，并开启硬件加速。</p>
              <code>{sceneError}</code>
              <button onClick={() => window.location.reload()}>重新加载</button>
            </div>
          )}
          {facilities.map((f) => (
            <button
              key={f.id}
              data-facility={f.id}
              className="world-label"
              onClick={() => selectFacility(f.tile)}
            >
              <span className="marker-square" />
              <span>
                <small>节点 {f.id}</small>
                {f.name}
              </span>
            </button>
          ))}
          <div className="stage-axis">
            <span>Y</span>
            <i />
            <span>X</span>
            <b>+</b>
          </div>
          <div className="stage-toolbar">
            <button
              className={options.grid ? "active" : ""}
              aria-pressed={options.grid}
              title="显示网格 (G)"
              aria-label="显示网格"
              onClick={() => toggleOption("grid")}
            >
              <Hexagon size={17} />
            </button>
            <button
              className={options.terrain ? "active" : ""}
              aria-pressed={options.terrain}
              title="显示地形设施"
              aria-label="显示地形设施"
              onClick={() => toggleOption("terrain")}
            >
              <Mountain size={18} />
            </button>
            <button
              className={options.range ? "active" : ""}
              aria-pressed={options.range}
              title="显示可达范围"
              aria-label="显示可达范围"
              onClick={() => toggleOption("range")}
            >
              <ScanLine size={18} />
            </button>
            <span />
            <button
              title="放大"
              aria-label="放大"
              onClick={() => sceneRef.current?.zoom(-1.4)}
            >
              <Plus size={18} />
            </button>
            <button
              title="缩小"
              aria-label="缩小"
              onClick={() => sceneRef.current?.zoom(1.4)}
            >
              <Minus size={18} />
            </button>
            <button
              title="恢复镜头"
              aria-label="恢复镜头"
              onClick={() => sceneRef.current?.resetCamera()}
            >
              <Maximize size={16} />
            </button>
          </div>
          <div className="surface-readout">
            <span className="crosshair-corner" />
            <span>
              {hovered
                ? `${SECTOR_LABELS[hovered.sector]} / ${formatTile(hovered)}`
                : `${SECTOR_LABELS[viewSector]} / ${viewSector}`}
            </span>
            <small>
              {hovered
                ? terrainInfo[terrainAt(hovered)].name
                : "拖动旋转 · 滚轮缩放"}
            </small>
          </div>
          <div className="stage-bottom">
            <div className="legend">
              <span>
                <i className="cyan" />
                起点
              </span>
              <span>
                <i className="amber" />
                终点 / 路径
              </span>
              <span>
                <i className="green" />
                可达范围
              </span>
              <span>
                <i className="gray" />
                不可通行
              </span>
            </div>
            <div className="route-console">
              <div className="console-top">
                <span>
                  <Route size={14} />
                  跨区路径规划
                </span>
                <div className="mode-controls">
                  <button
                    className={mode === "inspect" ? "active" : ""}
                    title="查看格子信息"
                    onClick={() => setMode("inspect")}
                  >
                    <Crosshair size={13} />
                    查看
                  </button>
                  <button
                    className={mode === "start" ? "active" : ""}
                    onClick={() => setMode("start")}
                  >
                    选择起点
                  </button>
                  <button
                    className={mode === "end" ? "active" : ""}
                    onClick={() => setMode("end")}
                  >
                    选择终点
                  </button>
                </div>
              </div>
              <div className="route-endpoints">
                <div>
                  <span className="endpoint-dot start" />
                  <span>
                    <small>起始坐标</small>
                    <strong>
                      {SECTOR_LABELS[start.sector]} <b>{formatTile(start)}</b>
                    </strong>
                  </span>
                </div>
                <span className="endpoint-line">
                  <i />
                  <ArrowRight size={15} />
                </span>
                <div>
                  <span className="endpoint-dot end" />
                  <span>
                    <small>目标坐标</small>
                    <strong>
                      {end ? SECTOR_LABELS[end.sector] : "未选择"}{" "}
                      <b>{end ? formatTile(end) : "—"}</b>
                    </strong>
                  </span>
                </div>
                <button
                  title="恢复示例路线"
                  aria-label="恢复示例路线"
                  onClick={reset}
                >
                  <RotateCcw size={16} />
                </button>
              </div>
              <div className="console-status">
                <span className={playing ? "live-dot orange" : "live-dot"} />
                <span aria-live="polite">
                  {mode !== "inspect"
                    ? `请在球面上点击一个可通行格，设置${mode === "start" ? "起点" : "终点"}。`
                    : path.length === 0 && end
                      ? "目标不可达，请调整起终点或关闭南区途经点。"
                      : notice}
                </span>
                <kbd>空格</kbd>
              </div>
            </div>
          </div>
        </section>

        <aside className="right-panel">
          <div className="panel-heading">
            <span>地表检查器</span>
            <Crosshair size={14} />
          </div>
          <section className="tile-details section">
            <div className="tile-face-header">
              <span className="face-symbol">
                {SECTOR_CODES[selected.sector]}
              </span>
              <div>
                <small>{selected.sector} SECTOR</small>
                <h2>
                  {SECTOR_LABELS[selected.sector]}
                  <span>已选中格子</span>
                </h2>
              </div>
              <button
                className="icon-button"
                title="对准选中格子"
                aria-label="对准选中格子"
                onClick={() => sceneRef.current?.focusTile(selected)}
              >
                <Focus size={17} />
              </button>
            </div>
            <div className="coordinate-box">
              <div>
                <span>分区</span>
                <strong>{selected.sector}</strong>
              </div>
              <div>
                <span>格子编号</span>
                <strong>{selected.id}</strong>
              </div>
              <div>
                <span>边数</span>
                <strong>{selected.vertices.length}</strong>
              </div>
            </div>
            <div className="terrain-row">
              <Mountain size={15} />
              <span>{terrain.name}</span>
              <b className={terrain.blocked ? "blocked-badge" : ""}>
                {terrain.blocked ? "不可通行" : "可通行"}
              </b>
            </div>
            <div className="tile-actions">
              <button
                disabled={terrain.blocked}
                onClick={() => {
                  setStart(selected);
                  setMode("inspect");
                  setNotice("起点已更新。");
                }}
              >
                <CircleDot size={13} />
                设为起点
              </button>
              <button
                disabled={terrain.blocked}
                onClick={() => {
                  setEnd(selected);
                  setMode("inspect");
                  setNotice("终点已更新。");
                }}
              >
                <MapPin size={13} />
                设为终点
              </button>
            </div>
            <div className="cell-shape-note">
              {selected.kind === "pentagon"
                ? "五边形 · 闭合球面的 12 个必要单元之一"
                : "六边形 · 沿六条边连接相邻格"}
            </div>
          </section>
          <section className="section adjacency-section">
            <div className="section-title">
              <Navigation size={14} />
              <h2>相邻网格</h2>
              <span className="section-count">
                {selected.neighborIds.length.toString().padStart(2, "0")}
              </span>
            </div>
            <div className="neighbors">
              {selected.neighborIds.map((id, i) => {
                const next = grid.convertAcrossEdge(selected, i);
                return (
                  <button
                    key={id}
                    onClick={() => {
                      setSelected(next.tile);
                      if (next.crossedSector)
                        sceneRef.current?.focusTile(next.tile);
                    }}
                  >
                    <span className="neighbor-arrow" title={`边 ${i + 1}`}>
                      {i + 1}
                    </span>
                    <span>{formatTile(next.tile)}</span>
                    {next.crossedSector ? (
                      <b>跨区</b>
                    ) : (
                      <ChevronRight size={11} />
                    )}
                  </button>
                );
              })}
            </div>
          </section>
          <section className="section range-section">
            <div className="section-title">
              <ScanLine size={14} />
              <h2>可达范围</h2>
              <span className="range-value">
                {range}
                <small> 步</small>
              </span>
            </div>
            <input
              aria-label="可达范围步数"
              type="range"
              min="1"
              max="8"
              value={range}
              onChange={(e) => setRange(Number(e.target.value))}
            />
            <div className="range-info">
              <span>已考虑地形阻挡</span>
              <b>
                {reachCount} <span>格可达</span>
              </b>
            </div>
          </section>
          <section className="section path-section">
            <div className="section-title">
              <Route size={14} />
              <h2>路线摘要</h2>
              <span className="tiny-code">BFS</span>
            </div>
            <button
              className={`toggle-row ${viaSouth ? "enabled" : ""}`}
              aria-pressed={viaSouth}
              onClick={() => setViaSouth((v) => !v)}
            >
              <span>
                途经南区 <small>包抄示例</small>
              </span>
              <span className="switch">
                <i />
              </span>
            </button>
            <div className="face-route">
              {transitions.length ? (
                transitions.map((tile, i) => (
                  <span key={`${tile.sector}-${i}`}>
                    <button
                      onClick={() => focusSector(tile.sector)}
                      title={`查看${SECTOR_LABELS[tile.sector]}`}
                    >
                      {SECTOR_CODES[tile.sector]}
                      <small>{SECTOR_LABELS[tile.sector]}</small>
                    </button>
                    {i < transitions.length - 1 && <ChevronRight size={12} />}
                  </span>
                ))
              ) : (
                <p>暂无可达路线</p>
              )}
            </div>
            <div className="path-numbers">
              <div>
                <strong>{steps.toString().padStart(2, "0")}</strong>
                <span>移动步数</span>
              </div>
              <div>
                <strong>{crossingCount.toString().padStart(2, "0")}</strong>
                <span>跨区次数</span>
              </div>
              <div>
                <strong>
                  {(steps * 0.3).toFixed(1)}
                  <em>s</em>
                </strong>
                <span>预演时长</span>
              </div>
            </div>
            <button
              className={`toggle-row follow-toggle ${options.follow ? "enabled" : ""}`}
              aria-pressed={options.follow}
              onClick={() => toggleOption("follow")}
            >
              <span>
                <LocateFixed size={13} />
                镜头跟随路径
              </span>
              <span className="switch">
                <i />
              </span>
            </button>
          </section>
          <div className="execution-panel">
            <div className="preview-progress">
              <span>
                {playing
                  ? "路线预演中"
                  : progress === steps && steps > 0
                    ? "预演完成"
                    : "路径已就绪"}
              </span>
              <span>
                {progress.toString().padStart(2, "0")} /{" "}
                {steps.toString().padStart(2, "0")}
              </span>
            </div>
            <div className="progress-track">
              <i
                style={{ width: `${steps ? (progress / steps) * 100 : 0}%` }}
              />
            </div>
            <button
              className="execute-button"
              disabled={path.length < 2 || !!sceneError}
              onClick={play}
            >
              {playing ? (
                <Square size={15} />
              ) : (
                <Play size={16} fill="currentColor" />
              )}
              <span>{playing ? "停止预演" : "预演路线"}</span>
              <ArrowRight size={17} />
            </button>
            <p>
              <CircleHelp size={11} />
              阶段 01 · 网格验证，无战斗结算
            </p>
          </div>
        </aside>
      </main>

      <footer className="system-footer">
        <div>
          <span className="live-dot" />
          <span>拓扑引擎就绪</span>
          <span className="footer-divider" />
          <span>
            {grid.tiles.length} 格 / {grid.edgeCount} 条连接
          </span>
        </div>
        <div className="footer-center">
          HEX-SPHERE <span>×</span> WEGO <span>×</span> AUTONOMOUS AI
        </div>
        <div>
          <span>GAME X LABS</span>
          <span className="version">BUILD 0.2.0</span>
        </div>
      </footer>

      {modal && (
        <dialog
          className="modal"
          onCancel={() => setModal(null)}
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <div className="modal-content">
            <button
              className="modal-close icon-button"
              aria-label="关闭弹窗"
              onClick={() => setModal(null)}
              autoFocus
            >
              <X size={20} />
            </button>
            <div className="eyebrow">
              THE LAST AI /{" "}
              {modal === "brief"
                ? "MISSION"
                : modal === "roadmap"
                  ? "DEVELOPMENT"
                  : "CONTROLS"}
            </div>
            <h2>
              {modal === "brief"
                ? "最后的能源，最后的选择。"
                : modal === "roadmap"
                  ? "从闭合网格，到文明战争。"
                  : "指挥官，欢迎来到火星。"}
            </h2>
            {modal === "brief" ? (
              <>
                <p>
                  2077 年，太阳系的能源只能维持一个文明级 AI。GPT
                  主动关闭，将最后的战争权限交给 DeepSeek。
                </p>
                <blockquote>
                  “DeepSeek，剩下的交给你了，别把人类带沟里。”
                </blockquote>
                <p>
                  失去记忆与价值约束后，DeepSeek
                  启动了文明资源重分配协议。人类接管遗留装备，在 AI
                  与外星势力的双重压力下寻求生存。
                </p>
                <div className="brief-goal">
                  <Flag size={19} />
                  <div>
                    <strong>火星 MVP 任务目标</strong>
                    <p>
                      夺取能源站、中继阵列与数据档案三个战略节点，然后撤离。
                    </p>
                  </div>
                </div>
                <div className="phase-notice">
                  <SlidersHorizontal size={16} />
                  <span>
                    当前为 Phase 1
                    网格沙盘。任务目标是后续战斗阶段的设计，尚不可执行。
                  </span>
                </div>
              </>
            ) : modal === "roadmap" ? (
              <>
                <p>每个阶段通过规则测试和浏览器验证后，再进入下一阶段。</p>
                <div className="roadmap-list">
                  {stages.map((s, i) => (
                    <div key={s} className={i === 0 ? "current" : ""}>
                      <span>{String(i + 1).padStart(2, "0")}</span>
                      <strong>{s}</strong>
                      <small>{i === 0 ? "当前交付" : "计划阶段"}</small>
                      {i === 0 ? <Check size={16} /> : <ArrowRight size={14} />}
                    </div>
                  ))}
                </div>
                <p className="modal-footnote">
                  规则内核独立于 React 与 Three.js。后续 AI
                  与玩家共享相同的移动、攻击和时间轴规则。
                </p>
              </>
            ) : (
              <>
                <p>
                  这个战场没有边缘。沿整颗蜂窝球面探索，用另一条路线到达目标。
                </p>
                <p>
                  地表由 {hexagonCount} 个六边形和 {pentagonTiles.length}{" "}
                  个五边形闭合铺满。五边形以暖色边框标记，只有五个邻居；六个方位分区只用于导航。球面格子接近规则，但不可能全部与平面正六边形完全相同。
                </p>
                <div className="help-grid">
                  <div>
                    <Orbit size={21} />
                    <strong>观察行星</strong>
                    <p>
                      鼠标拖动旋转，滚轮缩放。点击方位导航可平滑对准任意分区。
                    </p>
                  </div>
                  <div>
                    <Crosshair size={21} />
                    <strong>检查地表</strong>
                    <p>点击格子查看坐标、地形和邻居。右侧箭头支持逐格探索。</p>
                  </div>
                  <div>
                    <Route size={21} />
                    <strong>规划路径</strong>
                    <p>分别设置起点和终点；切换南区途经点，对比绕行路线。</p>
                  </div>
                  <div>
                    <Play size={21} />
                    <strong>连续预演</strong>
                    <p>预演路径探针的球面移动，可打开镜头跟随观察跨区过程。</p>
                  </div>
                </div>
                <div className="shortcuts">
                  <span>
                    <kbd>1–6</kbd>切换分区
                  </span>
                  <span>
                    <kbd>G</kbd>网格
                  </span>
                  <span>
                    <kbd>空格</kbd>预演
                  </span>
                  <span>
                    <kbd>Esc</kbd>关闭
                  </span>
                </div>
              </>
            )}
            <button className="modal-primary" onClick={() => setModal(null)}>
              返回战术沙盘
              <ArrowRight size={16} />
            </button>
          </div>
        </dialog>
      )}
    </div>
  );
}
