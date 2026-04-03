# 储能拓扑图项目 — 代码审查与改进方案

> 审查基准：plan-ceo-review 框架（产品思维 + 工程严谨度）  
> 审查日期：2026-04-03  
> 代码范围：`src/App.vue` / `src/components/TopologyCanvas.vue` / `src/components/TopologyEditor.vue`

---

## 一、总体判断

这个项目完成了核心功能——拖拽建图、流动动画、导入导出，视觉设计不错。但它有几个系统性问题会在"下一步"卡住你：数据会丢失、Vue 2 已停止维护、两个组件里有大量重复代码，以及动画参数里有一个从来没生效的字段（`flowGap`）。

下面按优先级拆解。

---

## 二、P0 — 必须修的 Bug

### 2.1 `flowGap`（粒子间距）从未生效

**文件：** `TopologyEditor.vue:114`、`TopologyCanvas.vue`

用户在右侧属性面板可以调节"粒子间距"，数值会存进 `edge.flowGap`。但动画循环里 `count` 硬编码为 `1`，从不读 `flowGap`：

```js
// TopologyEditor.vue:355-363
const r = edge.flowDash ?? 5
const speed = Math.max(0.1, edge.flowSpeed ?? 1.5)
const count = 1   // ← 永远是 1，flowGap 完全没用上
```

修法：根据线段长度和 `flowGap` 算出粒子数量：

```js
const gap = edge.flowGap ?? 50
const count = Math.max(1, Math.round(totalLen / gap))
```

这是 UI 和逻辑脱节的经典问题。用户调了半天没效果，不知道是 bug 还是设计如此。

---

### 2.2 App.vue 的 resize 监听器泄漏

**文件：** `App.vue:70-72`

```js
mounted() {
  this.canvasW = window.innerWidth - 48
  window.addEventListener('resize', () => {   // 匿名函数，无法移除
    this.canvasW = window.innerWidth - 48
  })
},
```

没有 `beforeDestroy` 移除监听器。在单页应用里频繁切换路由会堆积监听器。

修法：

```js
mounted() {
  this._onResize = () => { this.canvasW = window.innerWidth - 48 }
  this._onResize()
  window.addEventListener('resize', this._onResize)
},
beforeDestroy() {
  window.removeEventListener('resize', this._onResize)
},
```

---

### 2.3 JSON 导出后再导入，图标会丢失

**文件：** `TopologyEditor.vue:631-638`（syncToPreview）和 `exportJSON:645-664`

`exportJSON` 正确地不保存 `src`，靠 `deviceType` 还原。但 `syncToPreview` 用的是手动 patch：

```js
nodes.forEach((n, idx) => { n.src = this.editorNodes[idx].src })
```

这个 `idx` 映射假设了深拷贝数组的顺序与原数组完全一致，在极端情况下（过滤/排序后）会错位。

修法：用 id 做映射，不要用下标：

```js
const srcMap = {}
this.editorNodes.forEach(n => { srcMap[n.id] = n.src })
nodes.forEach(n => { n.src = srcMap[n.id] || '' })
```

---

### 2.4 模板里有重复注释

**文件：** `TopologyEditor.vue:4-6`

```html
<!-- ══ 左侧：设备面板 ══ -->
<!-- ══ 左侧：设备面板 ══ -->
<aside class="device-panel">
```

同一个注释出现了两次。低级问题，说明代码没有经过 review。

---

## 三、P1 — 严重的设计问题

### 3.1 两个组件里有 90% 重复的动画代码

`TopologyCanvas.vue` 和 `TopologyEditor.vue` 各自实现了：
- `_arrowPath(r)` — 完全相同的函数
- `_startAnimation()` / `_stopAnimation()` — 逻辑完全相同
- glow 滤镜的 SVG defs 构造 — 只有 filter id 不同（`tc-glow` vs `ed-glow`）
- 边的流动箭头绘制逻辑 — 高度相似

这不是"两个组件各自实现"，这是复制粘贴。现在有一个 bug（`flowGap` 未生效），你要改两处。下次还会有下次。

**修法：** 提取一个 `useFlowAnimation.js` composable（即使是 Vue 2 也可以用 mixin 或普通 JS 模块），统一管理：

```
src/utils/flowAnimation.js   ← _arrowPath, startAnimation, stopAnimation, drawFlowArrows
src/utils/svgGlow.js         ← buildGlowFilter
```

---

### 3.2 页面刷新后数据全丢

画布里的所有节点和连线存在组件 `data()` 里，刷新即清空。用户辛苦画好一张图，没有导出就关掉浏览器，什么都没了。

最低成本的修法是 `localStorage`：

```js
// 每次同步到预览时顺便持久化
syncToPreview() {
  const config = { nodes: this.editorNodes, edges: this.editorEdges }
  localStorage.setItem('topology_autosave', JSON.stringify(config))
  // ... 原有逻辑
},

// mounted 时恢复
mounted() {
  const saved = localStorage.getItem('topology_autosave')
  if (saved) {
    try {
      const { nodes, edges } = JSON.parse(saved)
      this.loadConfig(nodes, edges)
    } catch {}
  }
  // ...
},
```

这是零成本提升用户体验的改动，不需要后端。

---

### 3.3 每次属性变更都触发全量 D3 重绘

**文件：** `TopologyEditor.vue` 属性面板每个 `@input` 都调 `rerenderD3()`

```html
<input v-model="selectedEl.data.label" @input="rerenderD3" />
<input v-model.number="selectedEl.data.x" @input="rerenderD3" />
```

`rerenderD3()` 做的是：`_stopAnimation()` + 全量 `remove()` + 重建所有边 + 重建所有节点 + `_startAnimation()`。

用户拖动一个滑块，每帧都全量重建 DOM。节点少的时候看不出，节点多了会卡。

**修法：** 属性修改只需要更新对应的 D3 元素，不需要全量重绘。节点拖拽时你已经做了 `_refreshEdgesOnly()`，同样的思路应用到属性面板。至少对"标签"、"颜色"等视觉属性做局部更新。

---

### 3.4 Vue 2 已于 2023-12-31 停止维护

`package.json` 使用 `"vue": "^2.6.14"` 和 `vue-cli-service`（`@vue/cli-service ~5.0.0`）。

Vue 2 没有安全更新，Composition API 支持有限，生态在加速迁移到 Vue 3。

当前代码量不大，迁移成本低。建议：
- 升级到 Vue 3 + Vite（告别 webpack + vue-cli）
- `beforeDestroy` → `beforeUnmount`
- Options API 可以不动，或逐步迁移到 `<script setup>`

---

## 四、P2 — 体验提升

### 4.1 没有撤销/重做

用户误删节点，唯一的方法是重新画或重新导入。这是图形编辑器的基础功能。

最简单的实现：维护一个操作历史栈，在 `deleteSelected`、`clearAll`、拖拽结束时推入快照。

```js
data() {
  return {
    _history: [],   // 快照栈 [{nodes, edges}]
    _historyIdx: -1,
    // ...
  }
},
methods: {
  _pushHistory() {
    const snap = {
      nodes: JSON.parse(JSON.stringify(this.editorNodes)),
      edges: JSON.parse(JSON.stringify(this.editorEdges)),
    }
    this._history = this._history.slice(0, this._historyIdx + 1)
    this._history.push(snap)
    this._historyIdx++
  },
  undo() {
    if (this._historyIdx <= 0) return
    this._historyIdx--
    const snap = this._history[this._historyIdx]
    this.loadConfig(snap.nodes, snap.edges)
  },
}
```

Ctrl+Z 绑定：在 `mounted` 里加 `keydown` 监听。

---

### 4.2 设备类型 ID 命名混乱

`deviceTypes` 数组里同时存在：
- 数字类型：`'1'`, `'2'`, `'3'`...`'7'`（通用图标）
- 语义类型：`'pv'`, `'wind'`, `'battery'`, `'ems'`, `'inverter'`, `'grid'`, `'load'`

节点 id 生成逻辑：`` `${device.type}_${this.nodeCounter}` ``

结果：`1_1`、`pv_2` 这样的 id 混在一起。语义没有一致性。

建议统一改为语义化命名，去掉 `'1'`~`'7'` 的数字 type，或者至少给它们起有意义的名字：

```js
{ type: 'solar_array', label: '光伏阵列', src: require('@/assets/1.png') },
{ type: 'wind_turbine', label: '风力发电机', src: require('@/assets/2.png') },
// ...
```

这同时能修复导入时 `deviceType` 还原图标的逻辑，让它更健壮。

---

### 4.3 `confirm()` 阻断主线程

**文件：** `TopologyEditor.vue:621`

```js
clearAll() {
  if (!confirm('确认清空画布？')) return
```

`window.confirm()` 是浏览器原生对话框，无法自定义样式，在某些浏览器环境（iframe 嵌入、Electron）里会被禁用。

换成 Vue 的内联确认状态或一个简单的自定义 Modal 组件。

---

### 4.4 Canvas 高度硬编码为 680

**文件：** `App.vue:23`

```html
<TopologyCanvas :width="canvasW" :height="680" ...>
```

宽度响应式，高度写死。在小屏幕或缩放的情况下布局会出问题。用计算属性动态算高度，或者改用 CSS `height: 100%`，让 SVG 自适应父容器。

---

## 五、P3 — 长期架构

### 5.1 没有类型系统

整个项目是纯 JS。`node` 和 `edge` 的数据结构散落在各处，靠注释维护。

迁移到 TypeScript 或至少加 JSDoc 类型注解：

```js
/**
 * @typedef {Object} TopoNode
 * @property {string} id
 * @property {string} deviceType
 * @property {string} src
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {string} label
 * @property {string} labelColor
 */
```

让工具链（VSCode IntelliSense）能帮你检查属性拼写错误。

---

### 5.2 没有测试

零测试。导出/导入逻辑、节点 id 生成、坐标换算都是可以单测的纯函数，但全都内联在组件 `methods` 里。

把纯函数提取到 `src/utils/`，加 jest 或 vitest 单测，最起码保护导入导出这条核心路径。

---

### 5.3 `loadConfig` 方法暴露了但从未被用

**文件：** `TopologyEditor.vue:822-826`

```js
// 供父组件调用：加载已有配置
loadConfig(nodes, edges) { ... }
```

`App.vue` 有 `ref="editor"` 但从不调用 `this.$refs.editor.loadConfig()`。死代码，删掉或者接上。

---

## 六、改进优先级汇总

| 优先级 | 问题 | 影响 | 改动量 |
|--------|------|------|--------|
| P0 | `flowGap` 未生效 | 功能 bug，UI 欺骗用户 | 小 |
| P0 | resize 监听器泄漏 | 内存泄漏 | 小 |
| P0 | syncToPreview id 映射错误 | 数据丢失风险 | 小 |
| P1 | 动画代码重复 | 维护成本翻倍 | 中 |
| P1 | 数据无持久化 | 用户体验差 | 中 |
| P1 | 全量 D3 重绘性能问题 | 节点多时卡顿 | 中 |
| P1 | Vue 2 EOL | 安全和生态风险 | 大 |
| P2 | 无撤销/重做 | 编辑器基础功能缺失 | 中 |
| P2 | deviceType 命名混乱 | 可维护性差 | 小 |
| P2 | confirm() 阻断 | 嵌入环境兼容性 | 小 |
| P2 | Canvas 高度硬编码 | 响应式布局问题 | 小 |
| P3 | 无类型系统 | 长期维护成本 | 大 |
| P3 | 无测试 | 重构风险高 | 大 |

---

## 七、建议执行顺序

1. **本周**：修 P0 三个 bug（合计改动不超过 20 行），加 localStorage 自动保存（P1）
2. **下周**：提取 `flowAnimation.js` 消灭重复代码，顺手把 `flowGap` 动画逻辑接上
3. **下个迭代**：加撤销栈，统一 deviceType 命名，换掉 `confirm()`
4. **长期**：Vue 3 + Vite 迁移，引入 TypeScript，补单测

P0 的问题今天就能修完。`flowGap` 没生效是你给用户提供了一个假控件，这是最需要立刻处理的。
