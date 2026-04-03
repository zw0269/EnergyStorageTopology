<template>
  <div id="app">

    <!-- 顶部导航 -->
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
        background="#f0f2f5"
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

const NAV_HEIGHT = 52
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
/* ── 全局重置 ── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  height: 100%;
  background: #f0f2f5;
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}

#app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  color: #1a2332;
}

/* ── 顶部导航栏 ── */
.app-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 52px;
  background: #ffffff;
  border-bottom: 1px solid #e4e8ed;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  flex-shrink: 0;
  z-index: 10;
}

.app-title {
  font-size: 15px;
  font-weight: 600;
  color: #2563eb;
  letter-spacing: 0.5px;
}

/* ── Tab 按钮组 ── */
.tab-group {
  display: flex;
  gap: 4px;
  background: #f0f2f5;
  padding: 3px;
  border-radius: 8px;
}

.tab-btn {
  padding: 5px 20px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: #5a6a7e;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.15s;
}
.tab-btn:hover { color: #1a2332; background: rgba(255,255,255,0.7); }
.tab-btn.active {
  background: #ffffff;
  color: #2563eb;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
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
  background: #f0f2f5;
}

.editor-page {
  display: flex;
  height: 100%;
}
.editor-page > * { flex: 1; min-height: 0; }

/* ── 预览页信息栏 ── */
.info-bar {
  margin-top: 12px;
  padding: 6px 14px;
  background: #ffffff;
  border: 1px solid #e4e8ed;
  border-radius: 6px;
  font-size: 13px;
  color: #2563eb;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.empty-hint {
  margin-top: 60px;
  font-size: 14px;
  color: #9aa5b4;
  text-align: center;
  line-height: 2;
}
</style>
