# 通信拓扑图组件设计文档

## 目标

基于 D3.js + Vue 2，实现一个可配置的储能领域**通信及能量流动拓扑图**组件。

---

## 组件架构

```
src/components/
  TopologyCanvas.vue     ← 核心组件（SVG 幕布 + D3 渲染）
src/assets/
  1.png ~ 7.png          ← 设备图标（光伏、储能、逆变器、电网等）
  download.png
  logo.png
```

---

## 组件 API

### Props

| Prop | 类型 | 说明 |
|------|------|------|
| `width` | Number | 画布宽度，默认 1200 |
| `height` | Number | 画布高度，默认 800 |
| `nodes` | Array | 节点配置列表，见下方结构 |
| `edges` | Array | 连线配置列表，见下方结构 |
| `background` | String | 画布背景色，默认 `#0d1b2a` |

### Node 结构

```js
{
  id: 'pv1',           // 唯一标识
  src: require('@/assets/1.png'),  // 图片路径
  x: 200,             // 中心点 X 坐标
  y: 150,             // 中心点 Y 坐标
  width: 60,          // 图片宽度
  height: 60,         // 图片高度
  label: '光伏阵列',   // 节点标签（可选）
  labelColor: '#fff', // 标签颜色（可选）
}
```

### Edge 结构

```js
{
  from: 'pv1',         // 起始节点 id
  to: 'inverter1',     // 目标节点 id
  color: '#00e5ff',    // 线条颜色
  width: 2,            // 线宽
  dashed: false,       // 是否虚线
  animated: true,      // 是否流动动画
  label: 'DC',         // 线标签（可选）
  arrow: true,         // 是否显示箭头
}
```

---

## 示例拓扑图（储能系统）

```
  [光伏阵列]  [风机]
       \        /
      [直流汇流箱]
           |
       [储能电池]
           |
       [逆变器]
       /       \
  [电网]      [负载]
```

---

## 技术要点

1. **SVG 幕布**：使用 D3 创建 SVG，支持 zoom/pan 交互
2. **图片节点**：D3 `image` 元素，以 x/y 为中心点定位
3. **连线**：D3 `line` 或 `path`，支持直线/折线/曲线
4. **流动动画**：CSS `stroke-dashoffset` 动画模拟能量流向
5. **箭头**：SVG `marker` 定义箭头装饰
6. **标签**：SVG `text` 元素附加在节点/线段上

---

## 文件变更清单

- `package.json` → 添加 d3 依赖
- `src/components/TopologyCanvas.vue` → 核心组件
- `src/App.vue` → 集成示例展示
