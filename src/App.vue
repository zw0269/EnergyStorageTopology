<template>
  <div id="app">

    <!-- 顶部 Tab 导航 -->
    <nav class="app-nav">
      <span class="app-title">⚡ 储能通信拓扑图</span>
      <div class="tab-group">
        <button
          :class="['tab-btn', { active: activeTab === 'preview' }]"
          @click="activeTab = 'preview'"
        >▶ 拓扑预览</button>
        <button
          :class="['tab-btn', { active: activeTab === 'editor' }]"
          @click="activeTab = 'editor'"
        >✏ 拓扑配置</button>
      </div>
    </nav>

    <!-- 预览页 -->
    <div v-show="activeTab === 'preview'" class="tab-page preview-page">
      <TopologyCanvas
        :width="canvasW"
        :height="canvasH"
        background="#0d1b2a"
        :nodes="topoNodes"
        :edges="topoEdges"
        @node-click="onNodeClick"
      />
      <div v-if="selectedNode" class="info-bar">
        已选中节点：<strong>{{ selectedNode.label }}</strong>（{{ selectedNode.id }}）
      </div>
      <div v-if="topoNodes.length === 0" class="empty-hint">
        暂无拓扑数据，请前往「拓扑配置」页面绘制并同步。
      </div>
    </div>

    <!-- 配置页 -->
    <div v-show="activeTab === 'editor'" class="tab-page editor-page">
      <TopologyEditor
        ref="editor"
        @sync="onEditorSync"
      />
    </div>

  </div>
</template>

<script>
import TopologyCanvas from './components/TopologyCanvas.vue'
import TopologyEditor from './components/TopologyEditor.vue'

const NAV_HEIGHT = 48
const PADDING = 40

export default {
  name: 'App',
  components: { TopologyCanvas, TopologyEditor },

  data() {
    return {
      activeTab: 'editor',
      selectedNode: null,
      canvasW: 1200,
      canvasH: 680,
      topoNodes: [],
      topoEdges: [],
    }
  },

  mounted() {
    this._onResize = () => {
      this.canvasW = window.innerWidth - PADDING
      this.canvasH = window.innerHeight - NAV_HEIGHT - PADDING
    }
    this._onResize()
    window.addEventListener('resize', this._onResize)
  },

  beforeDestroy() {
    window.removeEventListener('resize', this._onResize)
  },

  methods: {
    onNodeClick(node) {
      this.selectedNode = node
    },

    onEditorSync({ nodes, edges }) {
      this.topoNodes = nodes
      this.topoEdges = edges
      this.activeTab = 'preview'
      this.selectedNode = null
      this.$nextTick(() => { this._onResize() })
    },
  },
}
</script>

<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  height: 100%;
  background: #06101e;
  font-family: 'Segoe UI', Helvetica, Arial, sans-serif;
}

#app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  color: #c8e0f8;
}

/* ── 顶栏 ── */
.app-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  height: 48px;
  background: #0b1a2e;
  border-bottom: 1px solid #1a3a5c;
  flex-shrink: 0;
}

.app-title {
  font-size: 16px;
  font-weight: 600;
  color: #7ecfff;
  letter-spacing: 1px;
  text-shadow: 0 0 8px rgba(0, 180, 255, 0.4);
}

.tab-group { display: flex; gap: 6px; }

.tab-btn {
  padding: 5px 18px;
  border-radius: 5px;
  border: 1px solid #2a4a6c;
  background: #0f2540;
  color: #80a8c8;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s;
}
.tab-btn:hover { background: #1a3a60; color: #b0d8f8; }
.tab-btn.active {
  background: #0a3060;
  border-color: #3388cc;
  color: #7ecfff;
  font-weight: 600;
}

/* ── 页面容器 ── */
.tab-page {
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.preview-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
  overflow: auto;
  background: #06101e;
}

.editor-page {
  display: flex;
  height: 100%;
}
.editor-page > * { flex: 1; min-height: 0; }

/* ── 预览页信息栏 ── */
.info-bar {
  margin-top: 12px;
  font-size: 13px;
  color: #7ecfff;
}

.empty-hint {
  margin-top: 40px;
  font-size: 14px;
  color: #3a6a9a;
  text-align: center;
}
</style>
