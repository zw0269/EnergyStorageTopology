<template>
  <div class="editor-layout">

    <!-- ══ 左侧：设备面板 ══ -->
    <aside class="device-panel">
      <div class="panel-title">设备库</div>
      <div class="device-list">
        <div v-for="device in deviceTypes" :key="device.type" class="device-item" draggable="true"
          @dragstart="onPaletteDragStart($event, device)">
          <img :src="device.src" class="device-icon" />
          <span class="device-label">{{ device.label }}</span>
        </div>
      </div>
    </aside>

    <!-- ══ 中间：SVG 画布 ══ -->
    <main class="canvas-area" ref="canvasWrapper" @dragover.prevent @drop="onCanvasDrop">
      <div class="canvas-toolbar">
        <button :class="['tb-btn', { active: connectMode }]" @click="toggleConnectMode">
          {{ connectMode ? '⚡ 连线中…' : '🔗 连线模式' }}
        </button>
        <button class="tb-btn danger" :disabled="!selectedEl" @click="deleteSelected">
          🗑 删除选中
        </button>

        <!-- 清空画布：普通态 / 确认态 -->
        <template v-if="!clearConfirming">
          <button class="tb-btn" @click="clearConfirming = true">清空画布</button>
        </template>
        <template v-else>
          <span class="hint" style="color:#ffaaaa">确认清空？</span>
          <button class="tb-btn danger" @click="confirmClearAll">确认</button>
          <button class="tb-btn" @click="clearConfirming = false">取消</button>
        </template>

        <div class="tb-sep"></div>
        <!-- 撤销 / 重做 -->
        <button class="tb-btn" :disabled="historyIdx <= 0" @click="undo" title="撤销 Ctrl+Z">↩ 撤销</button>
        <button class="tb-btn" :disabled="historyIdx >= history.length - 1" @click="redo" title="重做 Ctrl+Y">↪ 重做</button>
        <div class="tb-sep"></div>
        <button class="tb-btn" @click="$refs.importInput.click()">📥 导入</button>
        <button class="tb-btn" :disabled="editorNodes.length === 0" @click="exportJSON">📤 导出 JSON</button>
        <button class="tb-btn" :disabled="editorNodes.length === 0" @click="exportSVG">🖼 导出 SVG</button>
        <button class="tb-btn" :disabled="editorNodes.length === 0" @click="exportPNG">🖼 导出 PNG</button>
        <div class="tb-sep"></div>
        <label class="tb-label">背景</label>
        <input type="color" v-model="canvasBg" :disabled="bgTransparent" class="tb-color" @input="_applyBackground" />
        <label class="row-label">
          <input type="checkbox" v-model="bgTransparent" @change="_applyBackground" />
          透明
        </label>
        <div class="tb-sep"></div>
        <button class="tb-btn primary" @click="syncToPreview">▶ 同步到预览</button>
        <span v-if="connectMode && connectSource" class="hint">
          已选「{{ connectSource.label }}」，点击目标节点完成连线
        </span>
      </div>
      <!-- 隐藏文件选择器 -->
      <input ref="importInput" type="file" accept=".json" style="display:none" @change="importJSON" />

      <svg ref="svgRef" class="editor-svg" :width="svgW" :height="svgH" />
    </main>

    <!-- ══ 右侧：属性面板 ══ -->
    <aside class="prop-panel">
      <div class="panel-title">属性编辑</div>

      <!-- 无选中 -->
      <div v-if="!selectedEl" class="hint-text">点击节点或连线查看属性</div>

      <!-- 节点属性 -->
      <template v-if="selectedEl && selectedEl.type === 'node'">
        <div class="prop-section">节点属性</div>
        <label>ID</label>
        <input v-model="selectedEl.data.id" disabled class="prop-input" />
        <label>标签</label>
        <input v-model="selectedEl.data.label" class="prop-input" @input="rerenderD3" />
        <label>X 坐标</label>
        <input v-model.number="selectedEl.data.x" type="number" class="prop-input" @input="rerenderD3" />
        <label>Y 坐标</label>
        <input v-model.number="selectedEl.data.y" type="number" class="prop-input" @input="rerenderD3" />
        <label>宽度</label>
        <input v-model.number="selectedEl.data.width" type="number" class="prop-input" @input="rerenderD3" />
        <label>高度</label>
        <input v-model.number="selectedEl.data.height" type="number" class="prop-input" @input="rerenderD3" />
        <label>标签颜色</label>
        <input v-model="selectedEl.data.labelColor" type="color" class="prop-color" @input="rerenderD3" />
      </template>

      <!-- 边属性 -->
      <template v-if="selectedEl && selectedEl.type === 'edge'">
        <div class="prop-section">连线属性</div>
        <label>起点 ID</label>
        <input v-model="selectedEl.data.from" disabled class="prop-input" />
        <label>终点 ID</label>
        <input v-model="selectedEl.data.to" disabled class="prop-input" />
        <label>标签</label>
        <input v-model="selectedEl.data.label" class="prop-input" @input="rerenderD3" />
        <label>颜色</label>
        <input v-model="selectedEl.data.color" type="color" class="prop-color" @input="rerenderD3" />
        <label>线宽</label>
        <input v-model.number="selectedEl.data.width" type="number" min="1" max="8" class="prop-input"
          @input="rerenderD3" />
        <label class="row-label">
          <input v-model="selectedEl.data.dashed" type="checkbox" @change="rerenderD3" />
          虚线
        </label>
        <label class="row-label">
          <input v-model="selectedEl.data.animated" type="checkbox" @change="rerenderD3" />
          流动动画
        </label>
        <template v-if="selectedEl.data.animated">
          <label>流动方向</label>
          <div class="dir-group">
            <button v-for="opt in flowDirOptions" :key="opt.value"
              :class="['dir-btn', { active: (selectedEl.data.flowDirection || 'forward') === opt.value }]"
              @click="setFlowDir(opt.value)">{{ opt.label }}</button>
          </div>
          <label>粒子大小</label>
          <div class="slider-row">
            <input type="range" v-model.number="selectedEl.data.flowDash" min="2" max="14" step="1"
              @input="rerenderD3" />
            <span>{{ selectedEl.data.flowDash ?? 5 }}</span>
          </div>
          <label>粒子间距</label>
          <div class="slider-row">
            <input type="range" v-model.number="selectedEl.data.flowGap" min="10" max="120" step="5"
              @input="rerenderD3" />
            <span>{{ selectedEl.data.flowGap ?? 50 }}</span>
          </div>
          <label>流速 (秒/次)</label>
          <div class="slider-row">
            <input type="range" v-model.number="selectedEl.data.flowSpeed" min="0.5" max="6" step="0.5"
              @input="rerenderD3" />
            <span>{{ selectedEl.data.flowSpeed ?? 1.5 }}s</span>
          </div>
        </template>
        <label class="row-label">
          <input v-model="selectedEl.data.arrow" type="checkbox" @change="rerenderD3" />
          显示箭头
        </label>
      </template>
    </aside>

  </div>
</template>

<script>
import * as d3 from 'd3'
import { buildGlowFilter, createAnimLoop, drawFlowArrows } from '@/utils/flowAnimation'

const AUTOSAVE_KEY = 'topology_autosave'
const HISTORY_LIMIT = 30

export default {
  name: 'TopologyEditor',

  data() {
    return {
      svgW: 900,
      svgH: 640,

      // ── 画布状态 ──
      editorNodes: [],
      editorEdges: [],
      selectedEl: null,    // { type: 'node'|'edge', data: ref to object }
      connectMode: false,
      connectSource: null, // node object

      nodeCounter: 0,
      currentTransform: { x: 0, y: 0, k: 1 },

      // ── 背景设置 ──
      canvasBg: '#0d1b2a',
      bgTransparent: false,

      // ── 清空确认状态（替代 window.confirm）──
      clearConfirming: false,

      // ── 撤销/重做历史栈 ──
      history: [],      // 快照数组 [{nodes, edges}]
      historyIdx: -1,   // 当前位置

      flowDirOptions: [
        { value: 'forward', label: '▶ 正向' },
        { value: 'stop',    label: '⏸ 停止' },
        { value: 'reverse', label: '◀ 反向' },
      ],

      // ── 设备面板（语义化 type 命名）──
      deviceTypes: [
        { type: 'ess_cabinet',   label: '储能柜',       src: require('@/assets/储能柜.png') },
        { type: 'ev_charger',    label: '充电桩',       src: require('@/assets/充电桩.png') },
        { type: 'pv_panel',      label: '光伏',         src: require('@/assets/光伏.png') },
        { type: 'diesel_gen',    label: '柴发',         src: require('@/assets/柴发.png') },
        { type: 'load_unit',     label: '负载',         src: require('@/assets/负载.png') },
        { type: 'grid_unit',     label: '电网',         src: require('@/assets/电网.png') },
        { type: 'pv_array',      label: '光伏阵列',     src: require('@/assets/1.png') },
        { type: 'wind_turbine',  label: '风力发电机',   src: require('@/assets/2.png') },
        { type: 'combiner',      label: '汇流箱',       src: require('@/assets/3.png') },
        { type: 'battery',       label: '储能电池',     src: require('@/assets/4.png') },
        { type: 'ems',           label: '能量管理 EMS', src: require('@/assets/5.png') },
        { type: 'inverter',      label: '逆变器 PCS',   src: require('@/assets/6.png') },
        { type: 'grid',          label: '公共电网',     src: require('@/assets/7.png') },
        { type: 'load',          label: '本地负载',     src: require('@/assets/download.png') },
      ],
    }
  },

  watch: {
    canvasBg() { this._applyBackground() },
    bgTransparent() { this._applyBackground() },
  },

  mounted() {
    this.initSVG()
    this._tryRestoreAutosave()
    this.rerenderD3()
    window.addEventListener('resize', this.onResize)
    window.addEventListener('keydown', this._onKeydown)
    this.onResize()
  },

  beforeDestroy() {
    this._anim.stop()
    window.removeEventListener('resize', this.onResize)
    window.removeEventListener('keydown', this._onKeydown)
  },

  methods: {

    // ══════════════════════════════════════════════════
    //  画布初始化
    // ══════════════════════════════════════════════════
    _applyBackground() {
      const bg = this.bgTransparent ? 'transparent' : this.canvasBg
      d3.select(this.$refs.svgRef).style('background', bg)
    },

    initSVG() {
      const svg = d3.select(this.$refs.svgRef)
        .style('background', this.bgTransparent ? 'transparent' : this.canvasBg)

      const defs = svg.append('defs')

      // glow 滤镜（使用公共工具）
      buildGlowFilter(defs, 'ed-glow', 3)
      this._defs = defs

      // zoom 容器
      const g = svg.append('g').attr('class', 'editor-group')
      this._g = g

      const zoom = d3.zoom()
        .scaleExtent([0.1, 5])
        .on('zoom', (event) => {
          const t = event.transform
          this.currentTransform = { x: t.x, y: t.y, k: t.k }
          g.attr('transform', event.transform)
        })

      svg.call(zoom)
      this._zoom = zoom

      // 动画控制器（使用公共工具）
      this._anim = createAnimLoop()

      // 点击画布空白 → 取消选中
      svg.on('click', (event) => {
        if (event.target === this.$refs.svgRef) {
          this.selectedEl = null
          this.rerenderD3()
        }
      })
    },

    // ══════════════════════════════════════════════════
    //  D3 全量重绘
    // ══════════════════════════════════════════════════
    rerenderD3() {
      if (!this._g) return
      this._anim.stop()
      this._g.selectAll('*').remove()
      this._rebuildArrowMarkers()
      this._drawEdges()
      this._drawNodes()
      this._anim.start()
    },

    _rebuildArrowMarkers() {
      this._defs.selectAll('marker.dyn').remove()
      const seen = new Set()
      this.editorEdges.forEach(e => {
        const color = e.color || '#aaaaaa'
        const id = 'ea-' + color.replace(/[^a-zA-Z0-9]/g, '')
        if (seen.has(id)) return
        seen.add(id)
        this._defs.append('marker')
          .attr('class', 'dyn')
          .attr('id', id)
          .attr('markerWidth', 8).attr('markerHeight', 8)
          .attr('refX', 6).attr('refY', 3)
          .attr('orient', 'auto')
          .append('path').attr('d', 'M0,0 L0,6 L8,3 z').attr('fill', color)
      })
    },

    _drawEdges() {
      const nodeMap = {}
      this.editorNodes.forEach(n => { nodeMap[n.id] = n })
      const edgeG = this._g.append('g').attr('class', 'ed-edges')
      const self = this

      this.editorEdges.forEach((edge) => {
        const s = nodeMap[edge.from]
        const t = nodeMap[edge.to]
        if (!s || !t) return

        const color = edge.color || '#aaaaaa'
        const markerId = 'ea-' + color.replace(/[^a-zA-Z0-9]/g, '')
        const isSelected = self.selectedEl?.type === 'edge' && self.selectedEl?.data === edge
        const x1 = s.x, y1 = s.y, x2 = t.x, y2 = t.y
        const strokeW = edge.width || 2
        const motionPath = `M${x1},${y1} L${x2},${y2}`

        const grp = edgeG.append('g')

        // 粗透明 hit 区域，方便点击
        grp.append('line')
          .attr('x1', x1).attr('y1', y1)
          .attr('x2', x2).attr('y2', y2)
          .attr('stroke', 'transparent')
          .attr('stroke-width', 14)
          .style('cursor', 'pointer')
          .on('click', (event) => {
            event.stopPropagation()
            self.selectedEl = { type: 'edge', data: edge }
            self.rerenderD3()
          })

        // 底层轨迹线
        const track = grp.append('path')
          .attr('d', motionPath)
          .attr('stroke', color)
          .attr('stroke-width', strokeW)
          .attr('fill', 'none')
          .attr('opacity', edge.animated ? 0.2 : 1)
          .attr('marker-end', edge.arrow !== false ? `url(#${markerId})` : null)
          .style('cursor', 'pointer')

        if (isSelected) {
          track.attr('stroke-width', strokeW + 2)
            .attr('opacity', edge.animated ? 0.5 : 1)
            .attr('filter', 'drop-shadow(0 0 4px #fff)')
        }

        if (edge.dashed && !edge.animated) track.attr('stroke-dasharray', '6,4')

        // 流动箭头（使用公共工具，flowGap 已生效）
        if (edge.animated) {
          drawFlowArrows({
            group: grp,
            edge,
            x1, y1, x2, y2,
            color,
            glowFilterId: 'ed-glow',
            animArrows: self._anim.animArrows,
            defaults: { flowDash: 5, flowGap: 50, flowSpeed: 1.5 },
          })
        }

        // 标签
        if (edge.label) {
          grp.append('text')
            .attr('x', (s.x + t.x) / 2)
            .attr('y', (s.y + t.y) / 2 - 7)
            .attr('text-anchor', 'middle')
            .attr('fill', color)
            .attr('font-size', 11)
            .attr('font-family', 'sans-serif')
            .attr('pointer-events', 'none')
            .text(edge.label)
        }
      })
    },

    _drawNodes() {
      const nodeG = this._g.append('g').attr('class', 'ed-nodes')
      const self = this

      this.editorNodes.forEach(node => {
        const w = node.width || 60
        const h = node.height || 60
        const isSelected = self.selectedEl?.type === 'node' && self.selectedEl?.data === node
        const isConnSrc = self.connectSource === node

        const grp = nodeG.append('g')
          .attr('class', 'ed-node')
          .attr('transform', `translate(${node.x - w / 2},${node.y - h / 2})`)
          .style('cursor', self.connectMode ? 'crosshair' : 'grab')

        // 选中/连线源高亮框
        if (isSelected || isConnSrc) {
          grp.append('rect')
            .attr('x', -4).attr('y', -4)
            .attr('width', w + 8).attr('height', h + 8)
            .attr('rx', 6)
            .attr('fill', 'none')
            .attr('stroke', isConnSrc ? '#ffdd00' : '#00cfff')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '4,3')
        }

        grp.append('image')
          .attr('href', node.src)
          .attr('width', w).attr('height', h)

        if (node.label) {
          grp.append('text')
            .attr('x', w / 2).attr('y', h + 15)
            .attr('text-anchor', 'middle')
            .attr('fill', node.labelColor || '#e0f0ff')
            .attr('font-size', 12)
            .attr('font-family', 'sans-serif')
            .attr('pointer-events', 'none')
            .text(node.label)
        }

        // 点击事件
        grp.on('click', (event) => {
          event.stopPropagation()
          if (self.connectMode) {
            self._handleConnectClick(node)
          } else {
            self.selectedEl = { type: 'node', data: node }
            self.rerenderD3()
          }
        })

        // 拖拽移动（非连线模式）
        const drag = d3.drag()
          .on('start', function () {
            if (self.connectMode) return
            d3.select(this).style('cursor', 'grabbing')
          })
          .on('drag', function (event) {
            if (self.connectMode) return
            node.x += event.dx
            node.y += event.dy
            d3.select(this)
              .attr('transform', `translate(${node.x - w / 2},${node.y - h / 2})`)
            self._refreshEdgesOnly()
          })
          .on('end', function () {
            if (self.connectMode) return
            d3.select(this).style('cursor', 'grab')
            self._pushHistory()   // 拖拽结束后记录历史
          })

        grp.call(drag)
      })
    },

    // 只刷新连线（拖拽节点时性能优化）
    _refreshEdgesOnly() {
      this._anim.stop()
      this._g.select('g.ed-edges').remove()
      this._g.select('g.ed-nodes').lower()
      this._rebuildArrowMarkers()
      this._drawEdges()
      this._g.select('g.ed-nodes').raise()
      this._anim.start()
    },

    // ══════════════════════════════════════════════════
    //  连线逻辑
    // ══════════════════════════════════════════════════
    toggleConnectMode() {
      this.connectMode = !this.connectMode
      this.connectSource = null
      this.selectedEl = null
      this.rerenderD3()
    },

    _handleConnectClick(node) {
      if (!this.connectSource) {
        this.connectSource = node
        this.rerenderD3()
      } else {
        if (this.connectSource === node) {
          this.connectSource = null
          this.rerenderD3()
          return
        }
        const newEdge = {
          from: this.connectSource.id,
          to: node.id,
          color: '#00e5ff',
          width: 2,
          dashed: false,
          animated: true,
          arrow: true,
          label: '',
          flowDash: 5,
          flowGap: 50,
          flowSpeed: 1.5,
          flowDirection: 'forward',
        }
        this._pushHistory()
        this.editorEdges.push(newEdge)
        this.connectSource = null
        this.connectMode = false
        this.selectedEl = { type: 'edge', data: newEdge }
        this.rerenderD3()
      }
    },

    // ══════════════════════════════════════════════════
    //  从设备面板拖入画布
    // ══════════════════════════════════════════════════
    onPaletteDragStart(e, device) {
      e.dataTransfer.setData('device', JSON.stringify(device))
    },

    onCanvasDrop(e) {
      e.preventDefault()
      const device = JSON.parse(e.dataTransfer.getData('device'))
      if (!device) return

      const rect = this.$refs.canvasWrapper.getBoundingClientRect()
      const t = this.currentTransform
      const x = (e.clientX - rect.left - t.x) / t.k
      const y = (e.clientY - rect.top - t.y) / t.k

      this._pushHistory()
      this.nodeCounter++
      const newNode = {
        id: `${device.type}_${this.nodeCounter}`,
        deviceType: device.type,
        src: device.src,
        x,
        y,
        width: 64,
        height: 64,
        label: `${device.label} ${this.nodeCounter}`,
        labelColor: '#e0f0ff',
      }
      this.editorNodes.push(newNode)
      this.rerenderD3()
    },

    // ══════════════════════════════════════════════════
    //  工具栏操作
    // ══════════════════════════════════════════════════
    setFlowDir(dir) {
      if (this.selectedEl?.type === 'edge') {
        this.selectedEl.data.flowDirection = dir
        this.rerenderD3()
      }
    },

    deleteSelected() {
      if (!this.selectedEl) return
      this._pushHistory()
      if (this.selectedEl.type === 'node') {
        const id = this.selectedEl.data.id
        this.editorNodes = this.editorNodes.filter(n => n.id !== id)
        this.editorEdges = this.editorEdges.filter(e => e.from !== id && e.to !== id)
      } else {
        this.editorEdges = this.editorEdges.filter(e => e !== this.selectedEl.data)
      }
      this.selectedEl = null
      this.rerenderD3()
    },

    // 内联确认后执行清空
    confirmClearAll() {
      this._pushHistory()
      this.editorNodes = []
      this.editorEdges = []
      this.selectedEl = null
      this.connectSource = null
      this.connectMode = false
      this.nodeCounter = 0
      this.clearConfirming = false
      this.rerenderD3()
    },

    syncToPreview() {
      const nodes = JSON.parse(JSON.stringify(this.editorNodes))
      const edges = JSON.parse(JSON.stringify(this.editorEdges))

      // 用 id 映射还原 src（修复原下标映射 bug）
      const srcMap = {}
      this.editorNodes.forEach(n => { srcMap[n.id] = n.src })
      nodes.forEach(n => { n.src = srcMap[n.id] || '' })

      // localStorage 自动保存
      this._autosave()

      this.$emit('sync', { nodes, edges })
    },

    // ══════════════════════════════════════════════════
    //  撤销 / 重做
    // ══════════════════════════════════════════════════
    _pushHistory() {
      const snap = {
        nodes: JSON.parse(JSON.stringify(this.editorNodes)),
        edges: JSON.parse(JSON.stringify(this.editorEdges)),
      }
      // 截断重做分支
      this.history = this.history.slice(0, this.historyIdx + 1)
      this.history.push(snap)
      // 限制历史栈长度
      if (this.history.length > HISTORY_LIMIT) {
        this.history.shift()
      } else {
        this.historyIdx++
      }
    },

    undo() {
      if (this.historyIdx <= 0) return
      this.historyIdx--
      this._restoreSnap(this.history[this.historyIdx])
    },

    redo() {
      if (this.historyIdx >= this.history.length - 1) return
      this.historyIdx++
      this._restoreSnap(this.history[this.historyIdx])
    },

    _restoreSnap(snap) {
      const typeMap = {}
      this.deviceTypes.forEach(d => { typeMap[d.type] = d.src })
      this.editorNodes = snap.nodes.map(n => ({ ...n, src: typeMap[n.deviceType] || n.src || '' }))
      this.editorEdges = snap.edges.map(e => ({ ...e }))
      this.selectedEl = null
      this.rerenderD3()
    },

    _onKeydown(e) {
      const ctrl = e.ctrlKey || e.metaKey
      if (!ctrl) return
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault()
        if (e.shiftKey) { this.redo() } else { this.undo() }
      } else if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault()
        this.redo()
      }
    },

    // ══════════════════════════════════════════════════
    //  localStorage 自动保存 / 恢复
    // ══════════════════════════════════════════════════
    _autosave() {
      try {
        const payload = {
          nodes: this.editorNodes.map(n => ({
            id: n.id, deviceType: n.deviceType,
            x: n.x, y: n.y, width: n.width, height: n.height,
            label: n.label, labelColor: n.labelColor,
          })),
          edges: this.editorEdges.map(e => ({ ...e })),
          nodeCounter: this.nodeCounter,
        }
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload))
      } catch (_) { /* 存储不可用时静默忽略 */ }
    },

    _tryRestoreAutosave() {
      try {
        const raw = localStorage.getItem(AUTOSAVE_KEY)
        if (!raw) return
        const payload = JSON.parse(raw)
        if (!payload.nodes || !payload.edges) return
        this.loadConfig(payload.nodes, payload.edges)
        if (payload.nodeCounter) this.nodeCounter = payload.nodeCounter
      } catch (_) { /* 数据损坏时静默忽略 */ }
    },

    // ══════════════════════════════════════════════════
    //  导出 / 导入
    // ══════════════════════════════════════════════════
    exportJSON() {
      const config = {
        version: '1.0',
        nodes: this.editorNodes.map(n => ({
          id: n.id,
          deviceType: n.deviceType,
          x: n.x,
          y: n.y,
          width: n.width,
          height: n.height,
          label: n.label,
          labelColor: n.labelColor,
        })),
        edges: this.editorEdges.map(e => ({ ...e })),
      }
      const blob = new Blob(
        [JSON.stringify(config, null, 2)],
        { type: 'application/json' }
      )
      this._triggerDownload(blob, `topology-${Date.now()}.json`)
    },

    importJSON(e) {
      const file = e.target.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          const config = JSON.parse(ev.target.result)
          if (!config.nodes || !config.edges) throw new Error('格式错误')
          this._pushHistory()
          this.loadConfig(config.nodes, config.edges)
          const nums = this.editorNodes
            .map(n => { const m = n.id.match(/_(\d+)$/); return m ? parseInt(m[1]) : 0 })
          this.nodeCounter = nums.length ? Math.max(...nums) : 0
          this._autosave()
        } catch {
          alert('配置文件格式不正确，请检查后重试。')
        }
      }
      reader.readAsText(file)
      e.target.value = ''
    },

    exportSVG() {
      const svgEl = this.$refs.svgRef
      const clone = svgEl.cloneNode(true)
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')

      if (!this.bgTransparent) {
        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
        bg.setAttribute('width', svgEl.getAttribute('width'))
        bg.setAttribute('height', svgEl.getAttribute('height'))
        bg.setAttribute('fill', this.canvasBg)
        clone.insertBefore(bg, clone.firstChild)
      }

      const svgStr = new XMLSerializer().serializeToString(clone)
      const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
      this._triggerDownload(blob, `topology-${Date.now()}.svg`)
    },

    async exportPNG() {
      const svgEl = this.$refs.svgRef
      const width = this.svgW
      const height = this.svgH

      const toDataURL = (src) => new Promise((resolve) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          const c = document.createElement('canvas')
          c.width = img.naturalWidth || 64
          c.height = img.naturalHeight || 64
          c.getContext('2d').drawImage(img, 0, 0)
          try { resolve(c.toDataURL()) } catch (_) { resolve(src) }
        }
        img.onerror = () => resolve(src)
        img.src = src
      })

      const hrefs = new Set()
      svgEl.querySelectorAll('image').forEach(el => {
        const h = el.getAttribute('href') || el.getAttribute('xlink:href')
        if (h) hrefs.add(h)
      })

      const dataMap = {}
      await Promise.all([...hrefs].map(async (h) => { dataMap[h] = await toDataURL(h) }))

      const clone = svgEl.cloneNode(true)
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
      clone.querySelectorAll('image').forEach(el => {
        const h = el.getAttribute('href') || el.getAttribute('xlink:href')
        if (h && dataMap[h]) el.setAttribute('href', dataMap[h])
      })

      if (!this.bgTransparent) {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
        rect.setAttribute('width', width)
        rect.setAttribute('height', height)
        rect.setAttribute('fill', this.canvasBg)
        clone.insertBefore(rect, clone.firstChild)
      }

      const svgStr = new XMLSerializer().serializeToString(clone)
      const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
      const svgUrl = URL.createObjectURL(svgBlob)

      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!this.bgTransparent) {
          ctx.fillStyle = this.canvasBg
          ctx.fillRect(0, 0, width, height)
        }
        ctx.drawImage(img, 0, 0)
        URL.revokeObjectURL(svgUrl)
        canvas.toBlob(blob => {
          this._triggerDownload(blob, `topology-${Date.now()}.png`)
        }, 'image/png')
      }
      img.onerror = () => {
        URL.revokeObjectURL(svgUrl)
        alert('PNG 导出失败，请尝试导出 SVG 格式。')
      }
      img.src = svgUrl
    },

    _triggerDownload(blob, filename) {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    },

    // ══════════════════════════════════════════════════
    //  响应式布局
    // ══════════════════════════════════════════════════
    onResize() {
      const wrapper = this.$refs.canvasWrapper
      if (!wrapper) return
      this.svgW = wrapper.clientWidth
      this.svgH = wrapper.clientHeight
    },

    // ══════════════════════════════════════════════════
    //  加载配置（供父组件调用 / 内部导入恢复使用）
    // ══════════════════════════════════════════════════
    loadConfig(nodes, edges) {
      const typeMap = {}
      this.deviceTypes.forEach(d => { typeMap[d.type] = d.src })
      this.editorNodes = nodes.map(n => ({
        ...n,
        src: typeMap[n.deviceType] || n.src || '',
      }))
      this.editorEdges = edges.map(e => ({ ...e }))
      this.selectedEl = null
      this.rerenderD3()
    },
  },
}
</script>

<style scoped>
/* ── 整体布局 ── */
.editor-layout {
  display: flex;
  height: 100%;
  min-height: 680px;
  background: #06101e;
  color: #c8e0f8;
  font-size: 13px;
}

/* ── 左侧设备面板 ── */
.device-panel {
  width: 110px;
  flex-shrink: 0;
  background: #0b1a2e;
  border-right: 1px solid #1a3a5c;
  padding: 8px 6px 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.device-list {
  flex: 1;
  overflow-y: overlay;
  overflow-x: hidden;
  padding-right: 2px;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
  transition: scrollbar-color 0.3s;
}
.device-list:hover {
  scrollbar-color: #2a5a8a #0b1a2e;
}

/* ── Webkit 自定义滚动条 ── */
.device-list::-webkit-scrollbar { width: 4px; }
.device-list::-webkit-scrollbar-track { background: transparent; border-radius: 2px; }
.device-list::-webkit-scrollbar-thumb { background: transparent; border-radius: 2px; transition: background 0.3s; }
.device-list:hover::-webkit-scrollbar-thumb { background: #2a5a8a; }
.device-list::-webkit-scrollbar-thumb:hover { background: #3a7aaa; }

.panel-title {
  font-size: 11px;
  letter-spacing: 1px;
  color: #6699bb;
  text-transform: uppercase;
  margin-bottom: 10px;
  text-align: center;
  flex-shrink: 0;
}

.device-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  border-radius: 6px;
  cursor: grab;
  transition: background 0.15s;
  user-select: none;
}
.device-item:hover { background: #1a3050; }
.device-item:hover .device-icon { transform: scale(1.1); }
.device-item:active { cursor: grabbing; }

.device-icon {
  width: 40px;
  height: 40px;
  object-fit: contain;
  pointer-events: none;
  transition: transform 0.15s ease;
}

.device-label {
  font-size: 10px;
  color: #8ab4cc;
  text-align: center;
  line-height: 1.2;
}

/* ── 中间画布区 ── */
.canvas-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  position: relative;
}

.canvas-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #0b1a2e;
  border-bottom: 1px solid #1a3a5c;
  flex-wrap: wrap;
}

.tb-btn {
  padding: 4px 12px;
  border-radius: 4px;
  border: 1px solid #2a4a6c;
  background: #0f2540;
  color: #b0d0f0;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s;
}
.tb-btn:hover:not(:disabled) { background: #1a3a60; border-color: #4488aa; }
.tb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.tb-btn.active { background: #1a4a30; border-color: #00cc88; color: #00ffaa; }
.tb-btn.danger:hover:not(:disabled) { background: #4a1a1a; border-color: #cc4444; }
.tb-btn.primary { background: #0a3060; border-color: #2266aa; color: #66bbff; }
.tb-btn.primary:hover { background: #1a4a80; }

.tb-label { font-size: 12px; color: #8ab4cc; white-space: nowrap; }

.tb-color {
  width: 28px;
  height: 24px;
  padding: 1px 2px;
  border: 1px solid #2a4a6c;
  border-radius: 4px;
  background: #0f2540;
  cursor: pointer;
  vertical-align: middle;
}
.tb-color:disabled { opacity: 0.35; cursor: not-allowed; }

.tb-sep { width: 1px; height: 20px; background: #2a4a6c; flex-shrink: 0; }

.hint { font-size: 11px; color: #ffdd88; margin-left: 8px; }

.editor-svg { flex: 1; display: block; width: 100%; }

/* ── 右侧属性面板 ── */
.prop-panel {
  width: 190px;
  flex-shrink: 0;
  background: #0b1a2e;
  border-left: 1px solid #1a3a5c;
  padding: 10px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.prop-section {
  font-size: 11px;
  color: #6699bb;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-top: 4px;
  margin-bottom: 2px;
}

label {
  font-size: 11px;
  color: #7aa0bb;
  display: block;
  margin-top: 6px;
  margin-bottom: 2px;
}

.prop-input {
  width: 100%;
  padding: 4px 6px;
  background: #06101e;
  border: 1px solid #2a4a6c;
  border-radius: 4px;
  color: #c8e0f8;
  font-size: 12px;
  outline: none;
  box-sizing: border-box;
}
.prop-input:focus { border-color: #3a7aaa; }
.prop-input:disabled { opacity: 0.5; }

.prop-color {
  width: 100%;
  height: 28px;
  padding: 2px;
  background: #06101e;
  border: 1px solid #2a4a6c;
  border-radius: 4px;
  cursor: pointer;
  box-sizing: border-box;
}

.row-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #a0c0d8;
  margin-top: 6px;
  cursor: pointer;
}

.dir-group { display: flex; gap: 4px; margin-bottom: 4px; }

.dir-btn {
  flex: 1;
  padding: 4px 2px;
  font-size: 11px;
  border-radius: 4px;
  border: 1px solid #2a4a6c;
  background: #06101e;
  color: #7aa0bb;
  cursor: pointer;
  text-align: center;
  transition: all 0.15s;
  white-space: nowrap;
}
.dir-btn:hover { background: #1a3050; color: #b0d0f0; }
.dir-btn.active { background: #0a3060; border-color: #3a88cc; color: #66ccff; font-weight: 600; }

.slider-row { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
.slider-row input[type="range"] { flex: 1; accent-color: #3a8aaa; cursor: pointer; }
.slider-row span { min-width: 28px; text-align: right; font-size: 11px; color: #88bbdd; }

.hint-text {
  font-size: 11px;
  color: #446688;
  text-align: center;
  margin-top: 20px;
  line-height: 1.6;
}
</style>
