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
      <!-- 上传自定义图标 -->
      <div class="upload-icon-area">
        <button class="upload-icon-btn" @click="$refs.iconInput.click()">+ 上传图标</button>
        <input ref="iconInput" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp"
          style="display:none" @change="onIconUpload" />
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

        <!-- 折点操作 -->
        <div class="prop-section" style="margin-top:10px">折点</div>
        <div class="waypoint-info">当前 {{ (selectedEl.data.waypoints || []).length }} 个折点</div>
        <button class="tb-btn" style="width:100%;margin-top:4px" @click="addWaypoint">+ 添加折点</button>
        <button class="tb-btn danger" style="width:100%;margin-top:4px"
          :disabled="!(selectedEl.data.waypoints && selectedEl.data.waypoints.length)"
          @click="clearWaypoints">清除全部折点</button>
      </template>
    </aside>

  </div>
</template>

<script>
import * as d3 from 'd3'
import { buildGlowFilter, createAnimLoop, drawFlowArrows, buildPolylinePath } from '@/utils/flowAnimation'

const AUTOSAVE_KEY = 'topology_autosave'
const CUSTOM_ICONS_KEY = 'topology_custom_icons'
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
      canvasBg: '#f0f2f5',
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
    this._restoreCustomIcons()
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
        const strokeW = edge.width || 2

        // 构建折线顶点数组（含 waypoints）
        const points = [
          { x: s.x, y: s.y },
          ...(edge.waypoints || []),
          { x: t.x, y: t.y },
        ]
        const pathD = buildPolylinePath(points)

        const grp = edgeG.append('g')

        // 粗透明 hit 区域（沿折线各段），方便点击
        for (let i = 0; i < points.length - 1; i++) {
          grp.append('line')
            .attr('x1', points[i].x).attr('y1', points[i].y)
            .attr('x2', points[i + 1].x).attr('y2', points[i + 1].y)
            .attr('stroke', 'transparent')
            .attr('stroke-width', 14)
            .style('cursor', 'pointer')
            .on('click', (event) => {
              event.stopPropagation()
              self.selectedEl = { type: 'edge', data: edge }
              self.rerenderD3()
            })
        }

        // 底层轨迹线（折线）
        const track = grp.append('path')
          .attr('d', pathD)
          .attr('stroke', color)
          .attr('stroke-width', strokeW)
          .attr('fill', 'none')
          .attr('opacity', 1)
          .attr('marker-end', edge.arrow !== false ? `url(#${markerId})` : null)
          .style('cursor', 'pointer')

        if (isSelected) {
          track.attr('stroke-width', strokeW + 2)
            .attr('filter', 'drop-shadow(0 0 4px #fff)')
        }

        if (edge.dashed && !edge.animated) track.attr('stroke-dasharray', '6,4')

        // 流动箭头（支持折线，flowGap 已生效）
        if (edge.animated) {
          drawFlowArrows({
            group: grp,
            edge,
            points,
            color,
            glowFilterId: 'ed-glow',
            animArrows: self._anim.animArrows,
            defaults: { flowDash: 5, flowGap: 50, flowSpeed: 1.5 },
          })
        }

        // 标签（显示在折线中间段中点）
        if (edge.label) {
          const mid = points[Math.floor(points.length / 2)]
          const prev = points[Math.floor(points.length / 2) - 1] || points[0]
          grp.append('text')
            .attr('x', (mid.x + prev.x) / 2)
            .attr('y', (mid.y + prev.y) / 2 - 7)
            .attr('text-anchor', 'middle')
            .attr('fill', color)
            .attr('font-size', 11)
            .attr('font-family', 'sans-serif')
            .attr('pointer-events', 'none')
            .text(edge.label)
        }

        // 选中边时显示折点拖拽控制柄
        if (isSelected && edge.waypoints && edge.waypoints.length > 0) {
          edge.waypoints.forEach((wp) => {
            const handle = grp.append('circle')
              .attr('cx', wp.x).attr('cy', wp.y)
              .attr('r', 6)
              .attr('fill', '#ffdd00')
              .attr('stroke', '#fff')
              .attr('stroke-width', 1.5)
              .attr('opacity', 0.9)
              .style('cursor', 'move')
              .attr('pointer-events', 'all')

            const drag = d3.drag()
              .on('drag', function (event) {
                wp.x += event.dx
                wp.y += event.dy
                handle.attr('cx', wp.x).attr('cy', wp.y)
                // 更新折线路径
                const newPoints = [
                  { x: s.x, y: s.y },
                  ...edge.waypoints,
                  { x: t.x, y: t.y },
                ]
                track.attr('d', buildPolylinePath(newPoints))
              })
              .on('end', function () {
                self._pushHistory()
                self.rerenderD3()
              })

            handle.call(drag)
            handle.on('click', (event) => { event.stopPropagation() })
          })
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
    // ══════════════════════════════════════════════════
    //  折点操作
    // ══════════════════════════════════════════════════
    addWaypoint() {
      const edge = this.selectedEl?.data
      if (!edge) return
      const nodeMap = {}
      this.editorNodes.forEach(n => { nodeMap[n.id] = n })
      const s = nodeMap[edge.from]
      const t = nodeMap[edge.to]
      if (!s || !t) return

      if (!edge.waypoints) this.$set(edge, 'waypoints', [])
      const wps = edge.waypoints
      // 在最后一段中点插入
      const prev = wps.length > 0 ? wps[wps.length - 1] : { x: s.x, y: s.y }
      const next = { x: t.x, y: t.y }
      this._pushHistory()
      wps.push({ x: (prev.x + next.x) / 2, y: (prev.y + next.y) / 2 })
      this.rerenderD3()
    },

    clearWaypoints() {
      const edge = this.selectedEl?.data
      if (!edge) return
      this._pushHistory()
      this.$set(edge, 'waypoints', [])
      this.rerenderD3()
    },

    // ══════════════════════════════════════════════════
    //  自定义图标上传
    // ══════════════════════════════════════════════════
    onIconUpload(e) {
      const file = e.target.files[0]
      if (!file) return
      const label = file.name.replace(/\.[^.]+$/, '')
      const reader = new FileReader()
      reader.onload = (ev) => {
        const src = ev.target.result  // base64 data URL
        const type = 'custom_' + Date.now()
        const newDevice = { type, label, src, isCustom: true }
        this.deviceTypes.push(newDevice)
        this._saveCustomIcons()
      }
      reader.readAsDataURL(file)
      e.target.value = ''
    },

    _saveCustomIcons() {
      try {
        const custom = this.deviceTypes
          .filter(d => d.isCustom)
          .map(d => ({ type: d.type, label: d.label, src: d.src }))
        localStorage.setItem(CUSTOM_ICONS_KEY, JSON.stringify(custom))
      } catch (_) { /* 存储不可用时静默忽略 */ }
    },

    _restoreCustomIcons() {
      try {
        const raw = localStorage.getItem(CUSTOM_ICONS_KEY)
        if (!raw) return
        const custom = JSON.parse(raw)
        custom.forEach(d => {
          if (!this.deviceTypes.find(x => x.type === d.type)) {
            this.deviceTypes.push({ ...d, isCustom: true })
          }
        })
      } catch (_) { /* 数据损坏时静默忽略 */ }
    },

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
        nodes: this.editorNodes.map(n => {
          const isCustom = this.deviceTypes.find(d => d.type === n.deviceType && d.isCustom)
          return {
            id: n.id,
            deviceType: n.deviceType,
            x: n.x,
            y: n.y,
            width: n.width,
            height: n.height,
            label: n.label,
            labelColor: n.labelColor,
            // 自定义图标写入 base64 src，便于跨设备还原
            ...(isCustom ? { src: n.src } : {}),
          }
        }),
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
/* ════════════════════════════════════════════
   设计令牌（局部变量）
   ════════════════════════════════════════════ */
/* 颜色规范
   --bg-page:    #f0f2f5   页面底色
   --bg-panel:   #ffffff   面板白底
   --bg-toolbar: #fafafa   工具栏浅底
   --bg-canvas:  #f8f9fb   画布区淡白
   --border:     #e4e8ed   标准边框
   --border-mid: #d0d7de   稍深边框（输入框）
   --text-primary:  #1a2332
   --text-secondary:#5a6a7e
   --text-muted:    #9aa5b4
   --accent:     #2563eb   主蓝色
   --accent-bg:  #eff4ff   蓝色浅底
   --danger:     #ef4444
   --danger-bg:  #fef2f2
   --success:    #16a34a
   --success-bg: #f0fdf4
*/

/* ── 整体布局 ── */
.editor-layout {
  display: flex;
  height: 100%;
  min-height: 680px;
  background: #f0f2f5;
  color: #1a2332;
  font-size: 13px;
}

/* ══════════════════════════════════════════
   左侧设备面板
   ══════════════════════════════════════════ */
.device-panel {
  width: 116px;
  flex-shrink: 0;
  background: #ffffff;
  border-right: 1px solid #e4e8ed;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-title {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: #9aa5b4;
  padding: 10px 8px 6px;
  flex-shrink: 0;
}

.device-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 6px 6px;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
  transition: scrollbar-color 0.2s;
}
.device-list:hover { scrollbar-color: #d0d7de #f5f7fa; }
.device-list::-webkit-scrollbar { width: 4px; }
.device-list::-webkit-scrollbar-track { background: transparent; }
.device-list::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 2px;
  transition: background 0.2s;
}
.device-list:hover::-webkit-scrollbar-thumb { background: #d0d7de; }
.device-list::-webkit-scrollbar-thumb:hover { background: #b0bac6; }

.device-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  border-radius: 8px;
  cursor: grab;
  transition: background 0.12s, box-shadow 0.12s;
  user-select: none;
}
.device-item:hover {
  background: #eff4ff;
  box-shadow: 0 1px 4px rgba(37,99,235,0.08);
}
.device-item:hover .device-icon { transform: scale(1.08); }
.device-item:active { cursor: grabbing; background: #dbeafe; }

.device-icon {
  width: 40px;
  height: 40px;
  object-fit: contain;
  pointer-events: none;
  transition: transform 0.15s ease;
}

.device-label {
  font-size: 10px;
  color: #5a6a7e;
  text-align: center;
  line-height: 1.3;
}

/* ── 上传图标区 ── */
.upload-icon-area {
  flex-shrink: 0;
  padding: 6px 8px 8px;
  border-top: 1px solid #e4e8ed;
}

.upload-icon-btn {
  width: 100%;
  padding: 6px 0;
  border-radius: 6px;
  border: 1.5px dashed #b0bac6;
  background: transparent;
  color: #9aa5b4;
  cursor: pointer;
  font-size: 11px;
  transition: all 0.15s;
}
.upload-icon-btn:hover {
  border-color: #2563eb;
  color: #2563eb;
  background: #eff4ff;
}

/* ══════════════════════════════════════════
   中间画布区
   ══════════════════════════════════════════ */
.canvas-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  position: relative;
  background: #f8f9fb;
}

/* 工具栏 */
.canvas-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  background: #ffffff;
  border-bottom: 1px solid #e4e8ed;
  flex-wrap: wrap;
  flex-shrink: 0;
}

/* 基础按钮 */
.tb-btn {
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid #d0d7de;
  background: #ffffff;
  color: #5a6a7e;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.12s;
  white-space: nowrap;
}
.tb-btn:hover:not(:disabled) {
  background: #f0f2f5;
  border-color: #b0bac6;
  color: #1a2332;
}
.tb-btn:disabled { opacity: 0.38; cursor: not-allowed; }

/* 激活态（连线模式） */
.tb-btn.active {
  background: #eff4ff;
  border-color: #93c5fd;
  color: #2563eb;
  font-weight: 600;
}

/* 危险按钮 */
.tb-btn.danger { color: #ef4444; border-color: #fca5a5; }
.tb-btn.danger:hover:not(:disabled) {
  background: #fef2f2;
  border-color: #ef4444;
}

/* 主操作按钮 */
.tb-btn.primary {
  background: #2563eb;
  border-color: #2563eb;
  color: #ffffff;
  font-weight: 600;
}
.tb-btn.primary:hover:not(:disabled) {
  background: #1d4ed8;
  border-color: #1d4ed8;
}

/* 颜色选择 */
.tb-color {
  width: 28px;
  height: 24px;
  padding: 1px;
  border: 1px solid #d0d7de;
  border-radius: 5px;
  background: #ffffff;
  cursor: pointer;
  vertical-align: middle;
}
.tb-color:disabled { opacity: 0.35; cursor: not-allowed; }

/* 工具栏标签 */
.tb-label {
  font-size: 12px;
  color: #9aa5b4;
  white-space: nowrap;
  font-weight: 500;
}

/* 工具栏分隔线 */
.tb-sep {
  width: 1px;
  height: 18px;
  background: #e4e8ed;
  flex-shrink: 0;
  margin: 0 2px;
}

/* 连线提示文字 */
.hint {
  font-size: 11px;
  color: #d97706;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 4px;
  padding: 2px 8px;
  margin-left: 4px;
}

/* SVG 画布 */
.editor-svg {
  flex: 1;
  display: block;
  width: 100%;
}

/* ══════════════════════════════════════════
   右侧属性面板
   ══════════════════════════════════════════ */
.prop-panel {
  width: 196px;
  flex-shrink: 0;
  background: #ffffff;
  border-left: 1px solid #e4e8ed;
  padding: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
.prop-panel:hover { scrollbar-color: #d0d7de #f5f7fa; }

/* 面板分组标题 */
.prop-section {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: #9aa5b4;
  padding: 12px 12px 4px;
  border-bottom: 1px solid #f0f2f5;
  margin-bottom: 2px;
}

/* 属性标签 */
label {
  font-size: 11px;
  color: #5a6a7e;
  display: block;
  margin: 8px 12px 2px;
  font-weight: 500;
}

/* 文本输入框 */
.prop-input {
  width: calc(100% - 24px);
  margin: 0 12px;
  padding: 5px 8px;
  background: #f8f9fb;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  color: #1a2332;
  font-size: 12px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.12s, box-shadow 0.12s;
}
.prop-input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37,99,235,0.12);
  background: #ffffff;
}
.prop-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 颜色输入框 */
.prop-color {
  width: calc(100% - 24px);
  margin: 0 12px;
  height: 30px;
  padding: 2px;
  background: #f8f9fb;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  cursor: pointer;
  box-sizing: border-box;
}

/* Checkbox 行 */
.row-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #5a6a7e;
  margin: 6px 12px;
  cursor: pointer;
  font-weight: 500;
}
.row-label input[type="checkbox"] { accent-color: #2563eb; cursor: pointer; }

/* 流向按钮组 */
.dir-group {
  display: flex;
  gap: 4px;
  margin: 0 12px 4px;
}

.dir-btn {
  flex: 1;
  padding: 4px 2px;
  font-size: 11px;
  border-radius: 5px;
  border: 1px solid #d0d7de;
  background: #f8f9fb;
  color: #5a6a7e;
  cursor: pointer;
  text-align: center;
  transition: all 0.12s;
  white-space: nowrap;
  font-weight: 500;
}
.dir-btn:hover { background: #f0f2f5; border-color: #b0bac6; color: #1a2332; }
.dir-btn.active {
  background: #eff4ff;
  border-color: #93c5fd;
  color: #2563eb;
  font-weight: 600;
}

/* 滑块行 */
.slider-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 12px 2px;
}
.slider-row input[type="range"] {
  flex: 1;
  accent-color: #2563eb;
  cursor: pointer;
}
.slider-row span {
  min-width: 30px;
  text-align: right;
  font-size: 11px;
  color: #9aa5b4;
  font-weight: 600;
}

/* 无选中提示 */
.hint-text {
  font-size: 12px;
  color: #b0bac6;
  text-align: center;
  margin-top: 40px;
  line-height: 2;
  padding: 0 12px;
}

/* 折点信息 */
.waypoint-info {
  font-size: 11px;
  color: #9aa5b4;
  margin: 2px 12px;
}
</style>
