# 储能通信拓扑图

基于 Vue 2 + D3.js 的储能领域通信及能量流动拓扑图可视化工具，支持拖拽建图、流动动画、导入导出。

---

## 快速开始

```bash
npm install
npm run serve     # 开发服务器
npm run build     # 生产构建
npm run lint      # 代码检查
```

---

## 功能概览

| 功能 | 说明 |
|------|------|
| 拖拽建图 | 从左侧设备库拖拽节点到画布 |
| 连线模式 | 点击「连线模式」后依次点击两个节点建立连线 |
| 流动动画 | 边可设置流动动画、方向、粒子大小、粒子间距、流速 |
| 属性编辑 | 右侧面板实时编辑节点/边属性 |
| 撤销/重做 | Ctrl+Z 撤销，Ctrl+Y / Ctrl+Shift+Z 重做（最多 30 步） |
| 自动保存 | 同步到预览或导入时自动写入 localStorage，刷新后自动恢复 |
| 导入/导出 | 支持 JSON 配置、SVG、PNG 三种格式导出 |
| 缩放平移 | 画布支持鼠标滚轮缩放（0.1x–5x）和拖拽平移 |

---

## 项目结构

```
src/
  App.vue                    # 根组件，Tab 切换（预览/编辑）
  components/
    TopologyCanvas.vue       # 只读预览画布
    TopologyEditor.vue       # 可编辑画布 + 工具栏 + 属性面板
  utils/
    flowAnimation.js         # 共享动画工具
  assets/
    储能柜.png  充电桩.png  光伏.png  柴发.png  负载.png  电网.png
    1.png ~ 7.png  download.png
```

---

## AI 操作记录

> 以下变更由 **Claude Code (claude-sonnet-4-6)** 于 **2026-04-03** 自动完成。
> 分析依据：`CODE_REVIEW.md`（plan-ceo-review 框架）。

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/utils/flowAnimation.js` | 两个组件共用的动画工具模块 |
| `CODE_REVIEW.md` | AI 代码审查报告（12 个问题分级 + 修复方案） |
| `README.md` | 本文件 |

---

### P0 — Bug 修复（4 项）

#### 1. flowGap 粒子间距未生效

**文件：** `TopologyEditor.vue`、`TopologyCanvas.vue`（现统一通过 `src/utils/flowAnimation.js` 处理）

**问题：** `count` 硬编码为 `1`，用户在属性面板调节「粒子间距」没有任何效果。

```js
// 修复前
const count = 1

// 修复后（src/utils/flowAnimation.js: drawFlowArrows）
const count = Math.max(1, Math.round(totalLen / gap))
```

---

#### 2. App.vue resize 监听器内存泄漏

**文件：** `App.vue`

**问题：** `mounted` 使用匿名函数注册 `resize`，无法在 `beforeDestroy` 中移除。

```js
// 修复前：匿名函数，永久泄漏
window.addEventListener('resize', () => { this.canvasW = ... })

// 修复后：命名引用，beforeDestroy 正确清理
mounted() {
  this._onResize = () => { ... }
  window.addEventListener('resize', this._onResize)
},
beforeDestroy() {
  window.removeEventListener('resize', this._onResize)
},
```

---

#### 3. syncToPreview src 映射用下标而非 id

**文件：** `TopologyEditor.vue:syncToPreview`

**问题：** 深拷贝后用数组下标 `nodes[idx].src` 还原图标路径，顺序不一致时图标错位。

```js
// 修复前（下标映射，不安全）
nodes.forEach((n, idx) => { n.src = this.editorNodes[idx].src })

// 修复后（id 映射，健壮）
const srcMap = {}
this.editorNodes.forEach(n => { srcMap[n.id] = n.src })
nodes.forEach(n => { n.src = srcMap[n.id] || '' })
```

---

#### 4. 模板重复注释

**文件：** `TopologyEditor.vue` 模板头部

**问题：** `<!-- ══ 左侧：设备面板 ══ -->` 连续出现两次。

**修复：** 删除重复行，保留一行。

---

### P1 — 系统性改进（2 项）

#### 5. 提取公共动画工具，消灭重复代码

**新增文件：** `src/utils/flowAnimation.js`

**问题：** 两个组件各自实现了 90% 相同的动画代码，同一 bug 需要改两处。

**修复：** 提取四个导出函数：

| 函数 | 说明 |
|------|------|
| `arrowPath(r)` | 生成箭头形 SVG 路径字符串 |
| `buildGlowFilter(defs, id, blur)` | 在 SVG defs 中构建 glow 滤镜 |
| `createAnimLoop()` | 返回 `{ animArrows, start, stop }` rAF 动画控制器 |
| `drawFlowArrows(params)` | 绘制流动箭头并注册到 animArrows（含 flowGap 修复） |

两个组件均改为 import 使用，内部重复方法全部删除。

---

#### 6. localStorage 自动保存与恢复

**文件：** `TopologyEditor.vue`

**问题：** 画布数据仅存在组件内存，刷新即丢失。

**修复：** 新增：
- `_autosave()` — 在 `syncToPreview`、`importJSON` 时序列化写入 `localStorage['topology_autosave']`
- `_tryRestoreAutosave()` — 在 `mounted` 时尝试读取恢复，失败静默忽略

---

### P2 — 体验改进（4 项）

#### 7. 撤销/重做（Ctrl+Z / Ctrl+Y）

**文件：** `TopologyEditor.vue`

**新增功能：** 快照式历史栈，上限 30 步。

- `_pushHistory()` — 在删除、清空、拖拽结束、新建连线、拖入节点、导入时推入快照
- `undo()` / `redo()` — 还原/前进操作
- `_onKeydown()` — 键盘快捷键监听（`Ctrl+Z`、`Ctrl+Y`、`Ctrl+Shift+Z`）
- 工具栏新增「↩ 撤销」「↪ 重做」按钮，按历史位置自动 disabled

---

#### 8. deviceType 统一为语义化命名

**文件：** `TopologyEditor.vue:deviceTypes`

**问题：** 原 `'1'`~`'6'` 数字类型无语义。

| 旧 type | 新 type | 设备 |
|---------|---------|------|
| `'1'` | `'ess_cabinet'` | 储能柜 |
| `'2'` | `'ev_charger'` | 充电桩 |
| `'3'` | `'pv_panel'` | 光伏 |
| `'4'` | `'diesel_gen'` | 柴发 |
| `'5'` | `'load_unit'` | 负载 |
| `'6'` | `'grid_unit'` | 电网 |
| `'pv'` | `'pv_array'` | 光伏阵列 |
| `'wind'` | `'wind_turbine'` | 风力发电机 |

`loadConfig` 中的 `typeMap` 自动从 `deviceTypes` 构建，无需额外同步。

---

#### 9. 替换 window.confirm() 为内联确认

**文件：** `TopologyEditor.vue`

**问题：** `window.confirm()` 在 iframe/Electron 环境会被禁用。

**修复：** 新增 `clearConfirming` 布尔状态：
- 点击「清空画布」→ `clearConfirming = true`，工具栏内联显示「确认清空？确认 / 取消」
- 确认后调 `confirmClearAll()`，取消后复位

---

#### 10. Canvas 高度响应式

**文件：** `App.vue`

**问题：** `<TopologyCanvas :height="680">` 高度写死，小屏下布局异常。

**修复：** 新增 `canvasH` 数据属性，在 `_onResize` 中动态计算：
```js
this.canvasH = window.innerHeight - 48 - 40  // 导航栏高度 + 内边距
```

---

### P1（附）— loadConfig 死代码修复

**文件：** `TopologyEditor.vue`

**问题：** `loadConfig` 方法暴露但从未被调用。

**修复：** 现在被 `_tryRestoreAutosave`（localStorage 恢复）、`_restoreSnap`（撤销/重做）、`importJSON`（文件导入）三处内部调用，同时保持外部接口不变。

---

## 已知局限

- **Vue 2 EOL（2023-12-31）**：建议后续迁移至 Vue 3 + Vite
- **无单元测试**：导入导出、坐标换算等纯函数可独立测试，待补充
- **无 TypeScript**：node/edge 数据结构靠注释维护，建议后续加 JSDoc 或迁移 TS
