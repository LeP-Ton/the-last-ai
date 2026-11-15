# 最后的 AI / The Last AI

GameX 纯 Web 3D 科幻战棋原型。当前交付 **Phase 1：Hex-Sphere 蜂窝网格沙盘**。

已实现真正连通的火星蜂窝网格（350 个六边形 + 12 个五边形）、格子拾取、带地形阻挡的跨区寻路、范围查询、路径预演、自由旋转与平滑定位。这里的路径探针用于验证拓扑，尚未包含单位战斗、WEGO 或自主 AI。

在线体验：[最后的 AI · 火星沙盘](https://lep-ton.github.io/the-last-ai/)。

源码仓库：[LeP-Ton/the-last-ai](https://github.com/LeP-Ton/the-last-ai)。

## 运行

需要 Node.js 20.19+ 或 22.12+，以及支持 WebGL 2 的浏览器。

```sh
npm install
npm run dev
```

打开终端输出的本地地址，默认端口 5173；端口占用时 Vite 会自动递增。项目的 `.npmrc` 只为当前目录指定官方 npm 源，不修改全局配置。运行时不需要后端、API 密钥或远程素材。

```sh
npm test        # 纯 TypeScript 规则验证
npm run build  # 类型检查与生产构建
npm run preview
```

## GitHub Pages 发布

推送代码或配置到 `main` 后，[发布工作流](https://github.com/LeP-Ton/the-last-ai/actions/workflows/deploy-pages.yml)会使用 Node.js 22 执行 `npm ci`、`npm test` 和 `npm run build`，测试与构建通过后将 `dist/` 发布到 GitHub Pages。仅修改 Markdown 文档时跳过发布，也可在 Actions 页面手动运行工作流。

仓库 Pages 的发布来源使用 **GitHub Actions**。工作流使用 GitHub 内置令牌，不需要配置额外密钥。Vite 使用相对资源路径，脚本、样式和图标都兼容 `/the-last-ai/` 子目录。

首次配置和发布验收记录见 [GitHub Pages 部署需求](.agentdocs/workflow/REQ-20261115171415-github-pages-deploy/README.md)。

## 操作

| 操作 | 方式 |
| --- | --- |
| 旋转 / 缩放 | 拖动行星 / 滚轮，触屏可拖动和双指缩放 |
| 查看格子 | 点击球面上的格子，或点击右侧五／六个实际邻居 |
| 指定起终点 | 点击下方“选择起点 / 终点”后点格子，或使用检查器中的按钮 |
| 对准方位分区 | 左侧方位导航，或按 1–6（Front、East、Back、West、North、South） |
| 镜头定位 | 点击设施、检查器定位图标或恢复镜头 |
| 比较路线 | 切换“途经南区”，比较最短路和指定途经点的路径 |
| 预演 / 停止 | 点击“预演路线”，或在页面非输入控件处按空格 |
| 网格图层 | 工具栏开关，或按 G |
| 关闭弹窗 | 关闭按钮或 Esc |

默认路线从正区 `T137` 经南区 `T219` 到东区 `T299`，共 8 步、2 次跨区，避开正区山脊。探针沿球面连续移动，打开“镜头跟随路径”可观察面间转换。

山脊不可设为起点或终点。所有路径均遵守阻挡规则。可达范围默认 3 步，包含起始格。关闭途经点后，起终点相同时返回零步路线，不播放动画。

## 结构

- `src/game/grid/hexSphere.ts`：不依赖渲染的二十面体对偶、球面均匀化、全局 ID、五／六邻接、跨区朝向、BFS、距离与范围。
- `src/data/mars.ts`：固定火星地形、三处设施、面标签与默认路线。
- `src/rendering/PlanetScene.ts`：Three.js 几何、射线拾取、相机、地形与路径动画。
- `src/ui/App.tsx`、`styles.css`：指挥界面、状态、路线交互与响应式布局。

详细的蜂窝拓扑方案、WEGO 数据模型、AI 设计和八阶段计划见 [.agentdocs/architecture.md](.agentdocs/architecture.md)。变更和验证记录见 [.agentdocs/index.md](.agentdocs/index.md)。

## 网格规则

- 原立方体四边形方案已替换；六个方位分区只用于导航，蜂窝不会在分区边缘断开。
- 球面闭合需要保留 12 个五边形；点击“查看五边形单元”可依次检查。其余格子都是六边形，经过均匀化但不宣称为完全相同的平面正六边形。
- 检查器显示稳定的格子编号和边数；相邻格列表自动适配五／六条边。
- 网格均匀性由自动测试约束：六边形面积相对标准差小于 3%，单格最长／最短边之比小于 1.17。

## 阶段边界

当前可验证蜂窝球面闭合、无边界寻路和连续相机。设施没有占领逻辑，范围不是单位实际移动力。射线拾取只用于交互；战斗视线、跨区攻击与地形遮挡规则将在 Phase 3 单独实现。

Phase 2 将引入配置驱动的单位、朝向、占位、行动范围与跨区移动。后续阶段依次实现战斗、WEGO、自主 AI、星球控制、完整战斗 UI 和阵营剧情。每阶段需要通过规则测试和实际运行验证。
