/**
 * flowAnimation.js
 * 共享的流动箭头动画工具
 * 被 TopologyCanvas.vue 和 TopologyEditor.vue 共同使用
 */

/**
 * 生成箭头形 SVG 路径字符串，尖端朝 +x 方向，带缺口尾部
 * @param {number} r - 箭头半径
 * @returns {string}
 */
export function arrowPath(r) {
  return `M ${r},0 L ${-r * 0.6},${-r * 0.5} L ${-r * 0.15},0 L ${-r * 0.6},${r * 0.5} Z`
}

/**
 * 在 SVG defs 中构建 glow 滤镜
 * @param {import('d3').Selection} defs - d3 select 的 <defs> 节点
 * @param {string} filterId - 滤镜 id（需在页面内唯一）
 * @param {number} [stdDeviation=3.5] - 模糊半径
 */
export function buildGlowFilter(defs, filterId, stdDeviation = 3.5) {
  const glow = defs.append('filter')
    .attr('id', filterId)
    .attr('x', '-80%').attr('y', '-80%')
    .attr('width', '260%').attr('height', '260%')
  glow.append('feGaussianBlur')
    .attr('in', 'SourceGraphic')
    .attr('stdDeviation', String(stdDeviation))
    .attr('result', 'blur')
  const merge = glow.append('feMerge')
  merge.append('feMergeNode').attr('in', 'blur')
  merge.append('feMergeNode').attr('in', 'blur')
  merge.append('feMergeNode').attr('in', 'SourceGraphic')
}

/**
 * 创建一个独立的 rAF 动画循环控制器
 * 返回 { animArrows, start, stop }
 *
 * animArrows: 动画元素数组，每项结构：
 *   { haloEl, arrowEl, ax1, ay1, ax2, ay2, angle, phase, speed }
 *
 * @returns {{ animArrows: Array, start: Function, stop: Function }}
 */
export function createAnimLoop() {
  const animArrows = []
  let rafId = null

  function start() {
    if (rafId || animArrows.length === 0) return
    const loop = (ts) => {
      const t = ts / 1000
      animArrows.forEach(a => {
        try {
          const frac = ((t / a.speed) + a.phase) % 1
          const x = a.ax1 + frac * (a.ax2 - a.ax1)
          const y = a.ay1 + frac * (a.ay2 - a.ay1)
          const tf = `translate(${x},${y}) rotate(${a.angle})`
          a.haloEl.attr('transform', tf)
          a.arrowEl.attr('transform', tf)
        } catch (_) { /* 元素已被移除，静默跳过 */ }
      })
      rafId = requestAnimationFrame(loop)
    }
    rafId = requestAnimationFrame(loop)
  }

  function stop() {
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    animArrows.length = 0
  }

  return { animArrows, start, stop }
}

/**
 * 在 d3 group 中绘制一条边的流动箭头，并将动画项推入 animArrows
 *
 * @param {object} params
 * @param {import('d3').Selection} params.group - 要追加元素的 d3 group
 * @param {object} params.edge - 边数据对象
 * @param {number} params.x1 - 起点 x
 * @param {number} params.y1 - 起点 y
 * @param {number} params.x2 - 终点 x
 * @param {number} params.y2 - 终点 y
 * @param {string} params.color - 颜色
 * @param {string} params.glowFilterId - glow 滤镜 id
 * @param {Array}  params.animArrows - 动画项数组（由 createAnimLoop 返回）
 * @param {object} params.defaults - 全局默认值 { flowDash, flowGap, flowSpeed }
 */
export function drawFlowArrows({ group, edge, x1, y1, x2, y2, color, glowFilterId, animArrows, defaults }) {
  const totalLen = Math.hypot(x2 - x1, y2 - y1)
  if (totalLen < 1) return

  const flowDir = edge.flowDirection || 'forward'
  if (flowDir === 'stop') return

  const r     = edge.flowDash  ?? defaults.flowDash  ?? 5
  const gap   = edge.flowGap   ?? defaults.flowGap   ?? 50
  const speed = Math.max(0.1, edge.flowSpeed ?? defaults.flowSpeed ?? 1.5)
  const count = Math.max(1, Math.round(totalLen / gap))

  const [ax1, ay1, ax2, ay2] = flowDir === 'reverse'
    ? [x2, y2, x1, y1]
    : [x1, y1, x2, y2]

  const angle = Math.atan2(ay2 - ay1, ax2 - ax1) * 180 / Math.PI

  for (let k = 0; k < count; k++) {
    const phase = k / count

    const haloEl = group.append('path')
      .attr('d', arrowPath(r * 1.8))
      .attr('fill', color)
      .attr('opacity', 0.25)
      .attr('filter', `url(#${glowFilterId})`)
      .attr('pointer-events', 'none')

    const arrowEl = group.append('path')
      .attr('d', arrowPath(r))
      .attr('fill', color)
      .attr('opacity', 1)
      .attr('pointer-events', 'none')

    animArrows.push({ haloEl, arrowEl, ax1, ay1, ax2, ay2, angle, phase, speed })
  }
}
