<template>
  <div class="topology-wrapper" :style="{ width: width + 'px', height: height + 'px' }">
    <svg ref="svgRef" :width="width" :height="height" class="topology-svg">
      <defs>
        <!-- 箭头 marker -->
        <marker
          v-for="color in arrowColors"
          :key="'arrow-' + color.id"
          :id="'arrow-' + color.id"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L0,6 L8,3 z" :fill="color.value" />
        </marker>
      </defs>
    </svg>
  </div>
</template>

<script>
import * as d3 from 'd3'
import { buildGlowFilter, createAnimLoop, drawFlowArrows, buildPolylinePath } from '@/utils/flowAnimation'

export default {
  name: 'TopologyCanvas',

  props: {
    width:  { type: Number, default: 1200 },
    height: { type: Number, default: 800 },
    background: { type: String, default: '#f0f2f5' },
    nodes: { type: Array, default: () => [] },
    edges: { type: Array, default: () => [] },
    // 全局流动动画默认参数（可被每条边的字段覆盖）
    defaultFlowDash:  { type: Number, default: 5 },
    defaultFlowGap:   { type: Number, default: 50 },
    defaultFlowSpeed: { type: Number, default: 1.5 },
  },

  computed: {
    arrowColors() {
      const seen = new Set()
      return this.edges
        .filter(e => e.arrow !== false)
        .map(e => {
          const color = e.color || '#ffffff'
          const id = color.replace(/[^a-zA-Z0-9]/g, '')
          return { id, value: color }
        })
        .filter(c => {
          if (seen.has(c.id)) return false
          seen.add(c.id)
          return true
        })
    },
  },

  mounted() {
    this.initCanvas()
    this.render()
  },

  watch: {
    nodes: { deep: true, handler() { this.render() } },
    edges: { deep: true, handler() { this.render() } },
  },

  beforeDestroy() {
    this._anim.stop()
  },

  methods: {
    initCanvas() {
      const svg = d3.select(this.$refs.svgRef)
      svg.style('background', this.background)

      // glow 滤镜（使用公共工具）
      const defs = svg.select('defs')
      buildGlowFilter(defs, 'tc-glow', 3.5)

      // zoom/pan 容器
      const g = svg.append('g').attr('class', 'canvas-group')
      const zoom = d3.zoom()
        .scaleExtent([0.2, 5])
        .on('zoom', (event) => { g.attr('transform', event.transform) })
      svg.call(zoom)
      this._g = g

      // 动画控制器（使用公共工具）
      this._anim = createAnimLoop()
    },

    render() {
      if (!this._g) return
      this._anim.stop()
      this._g.selectAll('*').remove()
      this.renderEdges(this._g)
      this.renderNodes(this._g)
      this._anim.start()
    },

    renderEdges(g) {
      const nodeMap = {}
      this.nodes.forEach(n => { nodeMap[n.id] = n })
      const edgeGroup = g.append('g').attr('class', 'edges')

      this.edges.forEach((edge) => {
        const src = nodeMap[edge.from]
        const tgt = nodeMap[edge.to]
        if (!src || !tgt) return

        const color   = edge.color || '#ffffff'
        const strokeW = edge.width || 2
        const colorId = color.replace(/[^a-zA-Z0-9]/g, '')

        // 构建折线顶点数组（含 waypoints）
        const points = [
          { x: src.x, y: src.y },
          ...(edge.waypoints || []),
          { x: tgt.x, y: tgt.y },
        ]
        const pathD = buildPolylinePath(points)

        // 底层轨迹线
        const track = edgeGroup.append('path')
          .attr('d', pathD)
          .attr('stroke', color)
          .attr('stroke-width', strokeW)
          .attr('fill', 'none')
          .attr('opacity', 1)
          .attr('marker-end', edge.arrow !== false ? `url(#arrow-${colorId})` : null)

        if (edge.dashed) track.attr('stroke-dasharray', '6,4')

        // 流动箭头（支持折线，flowGap 已生效）
        if (edge.animated) {
          drawFlowArrows({
            group: edgeGroup,
            edge,
            points,
            color,
            glowFilterId: 'tc-glow',
            animArrows: this._anim.animArrows,
            defaults: {
              flowDash:  this.defaultFlowDash,
              flowGap:   this.defaultFlowGap,
              flowSpeed: this.defaultFlowSpeed,
            },
          })
        }

        // 线段标签（显示在折线中点）
        if (edge.label) {
          const mid = points[Math.floor(points.length / 2)]
          const prev = points[Math.floor(points.length / 2) - 1] || points[0]
          edgeGroup.append('text')
            .attr('x', (mid.x + prev.x) / 2)
            .attr('y', (mid.y + prev.y) / 2 - 8)
            .attr('text-anchor', 'middle')
            .attr('fill', color)
            .attr('font-size', 11)
            .attr('font-family', 'sans-serif')
            .text(edge.label)
        }
      })
    },

    renderNodes(g) {
      const nodeGroup = g.append('g').attr('class', 'nodes')
      this.nodes.forEach(node => {
        const w = node.width  || 60
        const h = node.height || 60
        const group = nodeGroup.append('g')
          .attr('class', 'node')
          .attr('transform', `translate(${node.x - w / 2}, ${node.y - h / 2})`)
          .style('cursor', 'pointer')

        group.append('image')
          .attr('href', node.src)
          .attr('width', w).attr('height', h)

        if (node.label) {
          group.append('text')
            .attr('x', w / 2).attr('y', h + 16)
            .attr('text-anchor', 'middle')
            .attr('fill', node.labelColor || '#e0f0ff')
            .attr('font-size', 12)
            .attr('font-family', 'sans-serif')
            .text(node.label)
        }

        group
          .on('mouseover', function() {
            d3.select(this).select('image')
              .attr('filter', 'brightness(1.4) drop-shadow(0 0 8px rgba(0,220,255,0.9))')
          })
          .on('mouseout', function() {
            d3.select(this).select('image').attr('filter', null)
          })
          .on('click', () => { this.$emit('node-click', node) })
      })
    },
  },
}
</script>

<style scoped>
.topology-wrapper {
  overflow: hidden;
  border-radius: 10px;
  display: inline-block;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  border: 1px solid #e4e8ed;
}
.topology-svg { display: block; }
</style>
