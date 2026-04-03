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
 * 将 points 数组构建为 SVG path d 字符串（折线）
 * @param {{x:number,y:number}[]} points
 * @returns {string}
 */
export function buildPolylinePath(points) {
  if (!points || points.length < 2) return ''
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
}

/**
 * 计算折线各段的累积长度信息
 * 返回 { segments, totalLen }
 * segments[i] = { x1, y1, x2, y2, len, cumLen, angle }
 * @param {{x:number,y:number}[]} points
 */
function buildSegments(points) {
  const segments = []
  let totalLen = 0
  for (let i = 0; i < points.length - 1; i++) {
    const x1 = points[i].x, y1 = points[i].y
    const x2 = points[i + 1].x, y2 = points[i + 1].y
    const len = Math.hypot(x2 - x1, y2 - y1)
    const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI
    segments.push({ x1, y1, x2, y2, len, cumLen: totalLen, angle })
    totalLen += len
  }
  return { segments, totalLen }
}

/**
 * 沿折线按 frac(0..1) 计算当前点坐标和角度
 * @param {{ segments, totalLen }} segInfo
 * @param {number} frac - 0..1 沿总长的比例
 * @returns {{ x: number, y: number, angle: number }}
 */
function pointAlongPolyline(segInfo, frac) {
  const { segments, totalLen } = segInfo
  if (totalLen === 0) return { x: segments[0].x1, y: segments[0].y1, angle: 0 }
  const dist = frac * totalLen
  for (const seg of segments) {
    if (dist <= seg.cumLen + seg.len) {
      const t = (dist - seg.cumLen) / seg.len
      return {
        x: seg.x1 + t * (seg.x2 - seg.x1),
        y: seg.y1 + t * (seg.y2 - seg.y1),
        angle: seg.angle,
      }
    }
  }
  // 末端
  const last = segments[segments.length - 1]
  return { x: last.x2, y: last.y2, angle: last.angle }
}

/**
 * 创建一个独立的 rAF 动画循环控制器
 * 返回 { animArrows, start, stop }
 *
 * animArrows 每项结构：
 *   { haloEl, arrowEl, segInfo, phase, speed }
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
          const pos = pointAlongPolyline(a.segInfo, frac)
          const tf = `translate(${pos.x},${pos.y}) rotate(${pos.angle})`
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
 * 支持直线（points 长度为 2）和折线（points 长度 > 2）
 *
 * @param {object} params
 * @param {import('d3').Selection} params.group - 要追加元素的 d3 group
 * @param {object} params.edge - 边数据对象
 * @param {{x:number,y:number}[]} params.points - 折线顶点数组（至少 2 个）
 * @param {string} params.color - 颜色
 * @param {string} params.glowFilterId - glow 滤镜 id
 * @param {Array}  params.animArrows - 动画项数组（由 createAnimLoop 返回）
 * @param {object} params.defaults - 全局默认值 { flowDash, flowGap, flowSpeed }
 */
export function drawFlowArrows({ group, edge, points, color, glowFilterId, animArrows, defaults }) {
  if (!points || points.length < 2) return

  const flowDir = edge.flowDirection || 'forward'
  if (flowDir === 'stop') return

  // 方向决定顶点顺序
  const orderedPoints = flowDir === 'reverse' ? [...points].reverse() : points

  const segInfo = buildSegments(orderedPoints)
  if (segInfo.totalLen < 1) return

  const r     = edge.flowDash  ?? defaults.flowDash  ?? 5
  const gap   = edge.flowGap   ?? defaults.flowGap   ?? 50
  const speed = Math.max(0.1, edge.flowSpeed ?? defaults.flowSpeed ?? 1.5)
  const count = Math.max(1, Math.round(segInfo.totalLen / gap))

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

    animArrows.push({ haloEl, arrowEl, segInfo, phase, speed })
  }
}
