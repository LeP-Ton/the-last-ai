# 最后的 AI：MVP 架构与开发计划

## 1. 交付边界

当前交付 Phase 1：单个火星、350 个六边形 + 12 个五边形的蜂窝球面、拾取、全局连通、路径与范围、平滑镜头。用户在会话-10 明确要求用六边形替换四边形，因此当前架构已迁移到二十面体对偶拓扑。UI 明确标注阶段，不伪造战斗统计。

后续 MVP 剧情处于 GPT 关闭后：人类 Front、DeepSeek East、外星 North。目标为夺取三个节点后撤离。DeepSeek 与外星共同敌对人类，但各自独立规划。动态关系通过阵营关系表表达，不能写死在单位类型中。

## 2. 项目架构

```text
src/
  game/
    grid/       已实现：纯数学向量、蜂窝格子 ID、拓扑、BFS 距离与路径
    core/       后续：世界快照、实体 ID、确定性随机源、阵营关系
    units/      后续：单位实例、状态、合法指令校验
    combat/     后续：视野、掩体、弹道、护甲、热量与伤害
    wego/       后续：规划封存、固定步长时间轴、冲突与结算
    ai/         后续：目标、影响图、候选计划、Utility 评分与搜索
    planets/    后续：战略节点、控制区、环境修正
    campaign/   后续：Shard、DeepSeek 状态、阵营与剧情事件
  rendering/    Three.js 场景与插值，消费规则快照
  ui/           React 界面，向规则层发送意图
  data/         行星、地形；后续加入单位、技能和阵营配置
```

规则层不得引用 Three.js、React、DOM 或系统时间。渲染不能决定命中、行动顺序或坐标合法性。客户端是唯一运行环境，不需要服务端或 LLM 调用。

## 3. Hex-Sphere 蜂窝球面

### 3.1 拓扑与约束

当前使用频率为 6 的二十面体细分对偶：总格数 `10f²+2=362`，其中 350 个六边形、12 个五边形、1080 条无向邻接边。十二个五边形分布在二十面体原顶点位置，所有格子都是可选取、可寻路的真实单元。

闭合球面不能以平面正六边形无变形铺满；在三条边交汇、只使用五／六边形的网格中，欧拉公式要求 `Σ(6−边数)=12`。因此保留十二个五边形，不用裂缝、重叠或隐藏传送弥补球面曲率。六边形经过均匀化后仍是近似规则，透视也会让边缘格子在屏幕上看起来更扁。

### 3.2 数据结构

`Tile` 使用全局 `id`，并包含：

- `sector`：FRONT / EAST / BACK / WEST / NORTH / SOUTH 中的一个导航分区。
- `center`：单位球面上的格心向量。
- `vertices` / `vertexIds`：逆时针排列的共享多边形顶点和索引。
- `neighborIds`：与每一条多边形边对应的邻居 ID，长度为 5 或 6。
- `kind`：hexagon / pentagon。
- `area`：球面面积，用于网格质量验证。

分区由格心的主轴方向决定，仅承担导航、着色和任务命名。分区边界沿实际蜂窝格边经过，不裁开多边形，不参与寻路规则。原 `face/x/y`、四方向与立方体跨区转换已移除。格子 ID 在相同生成配置下稳定；未来存档必须同时保存 `mars.gridVersion`。

### 3.3 生成与均匀化

1. 对二十面体 20 个三角面作频率 f 的重心细分，将公共顶点去重并投影到单位球面。
2. 保留三角网的共享关系，由入射三角形生成五／六邻接。
3. 用球面 Voronoi 单元执行 24 次 Lloyd 松弛（将格心移向面积重心）。这一步减小径向投影导致的面积差异。
4. 最终多边形角点选用松弛后三角形的归一化重心，改善五边形附近六边形的边长比例；最终网格是重心对偶，不宣称为严格 Voronoi 网格。
5. 相邻格复用相同角点，确保没有拼接裂缝。默认六边形面积相对标准差约 2.7%，面积最大／最小比约 1.09，每格最长／最短边比小于 1.17。

### 3.4 API 与路径

- `getTile(id)`：获取合法单元；不存在时抛错。
- `nearestTile(direction)`：将球面方向映射到最近格心，用于配置地标。
- `getNeighbor(tile, edgeIndex)`：按实际共享边取邻居；五边形的第六条边是非法输入。
- `convertAcrossEdge(tile, edgeIndex)`：返回目标格、反向边索引 `entryEdge`、是否跨分区、目标切平面上的继续前进方向 `heading`。
- `neighbors(tile)`：返回所有实际邻居。
- `getDistance(a,b)`：无障碍邻接图最短步数。
- `findPath(a,b,{blocked,via})`：BFS 路径，包含起终点，支持阻挡与有序途经点；不可达返回空数组。
- `getTilesInRange(tile,range,blocked)`：含起始格的拓扑可达范围。
- `getLineOfSight`：仍在 Phase 3 实现，不能用寻路路线代替射线或视野。

所有势力以后共用同一邻接图。距离不使用世界空间直线距离，也不使用分区内的虚构轴坐标。

### 3.5 渲染与相机

Three.js 直接使用内核返回的五／六边形顶点。每个多边形通过细分三角扇投影成连续曲面，地形高度独立叠加，并添加共享边的裙边遮住高度差。拾取与边框对应真实多边形，无立方体接缝叠加。

路径始终沿球面插值，镜头用四元数平滑定位。原六面按钮改为六个方位分区按钮，五边形可通过专用按钮循环查看。五边形以暖色边框标记，检查器显示格子 ID、边数和真实邻居数量。

## 4. WEGO 数据模型（后续 Phase 4）

```ts
type Phase = 'PLANNING' | 'EXECUTION' | 'RESOLUTION';
type Command =
  | { type: 'MOVE'; path: Tile[] }
  | { type: 'ATTACK'; targetId: string; aimTile: Tile }
  | { type: 'OVERWATCH'; heading: Vec3 }
  | { type: 'DEFEND' | 'WAIT' }
  | { type: 'INTERACT'; facilityId: string }
  | { type: 'ABILITY'; abilityId: string; targetTile: Tile };
type Order = { unitId: string; command: Command; startTick: number };
type RoundPlan = {
  round: number;
  snapshotVersion: number;
  ordersByFaction: Record<string, Order[]>;
  seed: number;
};
type TimelineEvent = {
  tick: number;
  sourceId: string;
  kind: 'MOVE_INTENT' | 'PROJECTILE' | 'DAMAGE' | 'CAPTURE';
  payload: unknown;
};
```

规划阶段所有势力读取同一世界快照，只封存本方指令。AI 不读取玩家尚未执行的计划。执行采用固定逻辑 tick：先收集意图，再解决同格占用、道路交叉、警戒触发与射击，最后同时应用伤害。相同 tick 的互相致命攻击允许同归于尽，不靠遍历顺序获利。Initiative 只用于明确的占位竞争，并用固定 ID 作确定性平局裁决。

弹道在发射时记录瞄准点与抵达 tick；到达时按实际位置计算命中，允许目标离开。意外遇敌只在技能或警戒规则允许时变更目标，不给 AI 额外规则。结算更新占领、能源、热量、控制率和剧情状态。固定 seed、输入快照和命令应能重放相同事件序列。

## 5. AI 系统（后续 Phase 5）

1. **可观察快照**：按 SensorRange 与视线过滤敌军，保存最后观测；与玩家遵守相同战争迷雾。
2. **目标系统**：节点、火力压制、生存、支援、侦察、撤退；为各单位分配目标，限制重复占点。
3. **影响图**：在同一蜂窝邻接图传播威胁、掩体、视野、控制和支援，不在分区边界截断。
4. **候选生成**：生成数个合法移动、射击、警戒和交互计划。每项通过玩家共用的命令校验器。
5. **Utility AI（效用评分）**：预期伤害、受损、能源、热量、占点收益、侧翼、队友覆盖综合评分。
6. **有限深度搜索**：COMPUTE 控制搜索宽度与深度；模拟多种敌方可能行动，不读取真实秘密计划。
7. **输出**：同一 Order 类型，加结构化说明 `{goal, action, mainFactors, confidence}`；不展示内部思维链。

DeepSeek 重视资源交换、节点和协同；外星重视推进、包围和数量；人类 NPC 重视生存与保护。ALIGNMENT 改变人类损失惩罚，TRUST 影响高级请求接受率，MEMORY 解锁价值目标，WAR_PRESSURE 调整侵略和风险权重。数据变化要改变实际候选评分，不能只是 UI 数字。

## 6. MVP 计划与门槛

| 阶段 | 交付 | 继续开发前必须验证 |
| --- | --- | --- |
| 1 网格 | 蜂窝闭合、球面渲染、拾取、跨区路径、镜头 | 共享边互逆、362 格连通、12 个五边形、均匀性、阻挡、路径、浏览器交互 |
| 2 单位 | 配置实例、选中、范围、动画 | Front→South→East 连续移动、同格占用、朝向、相机跟随 |
| 3 战斗 | 射程、视野、掩体、伤害、死亡 | 同区/跨区一致，遮挡和视界，死亡清理 |
| 4 WEGO | 七种指令、秘密规划、共同时间轴 | 双方同格竞争、交叉遭遇、同 tick 伤害、弹道错失、确定性重放 |
| 5 AI | 目标、影响图、候选评分、浅层搜索 | AI 自主跨区、合法命令、不同风格、无玩家计划泄漏、状态影响行动 |
| 6 控制率 | 三节点、能源、设施、撤离 | 不全歼也能胜利，三点夺取后撤离，失去人类单位时失败 |
| 7 完整 UI | 单位、计划、执行、状态、决策摘要 | 从选人到结束一局的完整流程，响应式布局与键盘操作 |
| 8 剧情 | Shard、价值恢复与阵营关系 | 恢复数据改变 AI 权重与关系；玩家仍不能直接控制 DeepSeek |

后续单位配置覆盖需求中 13 类单位，优先用少量实例验证各类职责，不在 Phase 1 加入虚假单位面板。太阳系 Campaign 与完整序章保留设计接口，不进入首个火星 MVP。

## 7. 技术参考

- [Three.js OrbitControls](https://threejs.org/docs/pages/OrbitControls.html)：旋转、缩放与阻尼。
- [Three.js BufferGeometry](https://threejs.org/docs/pages/BufferGeometry.html)：程序化曲面网格。
- [Vite 官方入门](https://vite.dev/guide/)：本地开发和构建环境。

- [H3 官方球面网格说明](https://h3geo.org/docs/core-library/overview/)：二十面体六边形球面中的 12 个五边形约束；本项目未引入 H3 依赖。
