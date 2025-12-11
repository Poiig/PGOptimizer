<template>
  <div class="app-container">
    <header class="header">
      <h1>PostgreSQL 性能参数优化工具</h1>
      <p class="subtitle">根据您的服务器配置自动生成优化的 PostgreSQL 参数</p>
    </header>

    <div class="main-content">
      <div class="input-section">
        <h2>服务器配置</h2>
        <form @submit.prevent="generateConfig" class="config-form">
          <div class="form-row">
            <div class="form-group">
              <label for="dbVersion">PostgreSQL 版本</label>
              <select id="dbVersion" v-model="config.dbVersion" required>
                <option value="13">PostgreSQL 13</option>
                <!-- <option value="14">PostgreSQL 14</option>
                <option value="15">PostgreSQL 15</option>
                <option value="16">PostgreSQL 16</option> -->
              </select>
            </div>

            <div class="form-group">
              <label for="cpuCores">CPU 核心数</label>
              <input
                id="cpuCores"
                type="number"
                v-model.number="config.cpuCores"
                min="1"
                max="256"
                required
                placeholder="例如: 8"
              />
            </div>

            <div class="form-group">
              <label for="memoryGB">内存 (GB)</label>
              <input
                id="memoryGB"
                type="number"
                v-model.number="config.memoryGB"
                min="1"
                max="1024"
                required
                placeholder="例如: 32"
              />
            </div>

            <div class="form-group">
              <label for="storageType">存储类型</label>
              <select id="storageType" v-model="config.storageType" required>
                <option value="ssd">SSD</option>
                <option value="hdd">机械硬盘 (HDD)</option>
              </select>
            </div>
          </div>

          <button type="submit" class="generate-btn">生成配置</button>
        </form>
      </div>

      <div class="result-section" v-if="generatedParams.length > 0">
        <div class="result-header">
          <h2>生成的配置参数</h2>
          <div class="action-buttons">
            <button @click="copyToClipboard" class="btn-secondary" id="copyBtn">复制配置</button>
            <button @click="showAlterSystemSQL" class="btn-secondary" id="copySQLBtn">生成并预览 ALTER SYSTEM SQL</button>
          </div>
        </div>
        <div class="params-container">
          <table class="params-table">
            <thead>
              <tr>
                <th>参数名</th>
                <th>参数值</th>
                <th>是否需要重启</th>
                <th>描述</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="(group, category) in groupedParams" :key="category">
                <tr class="category-header">
                  <td colspan="4" class="category-title">{{ category }}</td>
                </tr>
                <tr v-for="(param, index) in group" :key="`${category}-${index}`">
                  <td class="param-name">
                    <div class="param-name-wrapper">
                      <span>{{ param.name }}</span>
                      <a 
                        :href="getParamDocUrl(param.name, config.dbVersion)"
                        target="_blank"
                        class="param-doc-link"
                        :title="`查看 ${param.name} 的官方文档`"
                        @click.stop
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                          <polyline points="15 3 21 3 21 9"></polyline>
                          <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                      </a>
                    </div>
                  </td>
                  <td class="param-value">
                    <div class="param-value-wrapper">
                      <input
                        type="text"
                        v-model="param.value"
                        class="param-input"
                        @blur="updateParamByCategory(category, index, $event.target.value)"
                      />
                      <span 
                        class="param-help-icon"
                        :title="getParamDescription(param.name)"
                        @mouseenter="showTooltip($event, param.name)"
                        @mouseleave="hideTooltip"
                      >?</span>
                    </div>
                    <div 
                      v-if="tooltip.visible && tooltip.paramName === param.name"
                      class="param-tooltip"
                      :style="{ top: tooltip.top + 'px', left: tooltip.left + 'px' }"
                      @mouseenter="keepTooltipVisible(param.name)"
                      @mouseleave="hideTooltip"
                    >
                      <div class="tooltip-content">
                        <div class="tooltip-text">{{ getParamDescription(param.name) }}</div>
                        <a 
                          :href="getParamDocUrl(param.name, config.dbVersion)"
                          target="_blank"
                          class="tooltip-link"
                          @click.stop
                        >
                          查看官方文档 →
                        </a>
                      </div>
                    </div>
                  </td>
                  <td class="param-restart">
                    <span :class="['restart-badge', isRestartRequired(param.name) ? 'restart-yes' : 'restart-no']">
                      {{ getRestartRequiredText(param.name) }}
                    </span>
                  </td>
                  <td class="param-description">
                    {{ getParamDescription(param.name) || '该参数的详细说明请参考 PostgreSQL 官方文档' }}
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ALTER SYSTEM SQL 预览弹窗 -->
    <div v-if="sqlModal.visible" class="modal-overlay" @click="closeSQLModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>ALTER SYSTEM SQL 语句</h3>
          <button class="modal-close" @click="closeSQLModal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="sql-actions">
            <button @click="copySQLFromModal" class="btn-copy-sql">复制 SQL</button>
          </div>
          <pre class="sql-preview">{{ sqlModal.sqlText }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, computed } from 'vue'
import { calculateParams } from './utils/paramCalculator'
import { getParamDescription, getParamDocUrl } from './utils/paramDescriptions'
import { isRestartRequired, getRestartRequiredText } from './utils/paramRestartInfo'

export default {
  name: 'App',
  setup() {
    const config = reactive({
      dbVersion: '13',
      cpuCores: 8,
      memoryGB: 32,
      storageType: 'ssd'
    })

    const generatedParams = ref([])
    const groupedParams = computed(() => {
      const groups = {}
      generatedParams.value.forEach(param => {
        const category = param.category || '其他参数'
        if (!groups[category]) {
          groups[category] = []
        }
        groups[category].push(param)
      })
      // 按固定顺序排序
      const categoryOrder = ['性能相关参数', '自动清理相关配置', '超时相关', '日志记录相关', '其他参数']
      const orderedGroups = {}
      categoryOrder.forEach(category => {
        if (groups[category]) {
          orderedGroups[category] = groups[category]
        }
      })
      // 添加其他未分类的
      Object.keys(groups).forEach(category => {
        if (!categoryOrder.includes(category)) {
          orderedGroups[category] = groups[category]
        }
      })
      return orderedGroups
    })
    const tooltip = reactive({
      visible: false,
      paramName: '',
      top: 0,
      left: 0
    })
    let tooltipTimeout = null
    
    // SQL 弹窗状态
    const sqlModal = reactive({
      visible: false,
      sqlText: ''
    })
    
    // 存储按钮的原始文本
    const buttonOriginalTexts = {
      copyBtn: '复制配置',
      copySQLBtn: '生成并预览 ALTER SYSTEM SQL'
    }
    
    // 重置所有按钮到原始状态
    const resetAllButtons = () => {
      const buttons = [
        document.getElementById('copyBtn'),
        document.getElementById('copySQLBtn')
      ]
      
      buttons.forEach(btn => {
        if (btn) {
          // 恢复原始文本
          if (btn.id === 'copyBtn') {
            btn.textContent = buttonOriginalTexts.copyBtn
          } else if (btn.id === 'copySQLBtn') {
            btn.textContent = buttonOriginalTexts.copySQLBtn
          }
          // 恢复原始样式
          btn.style.background = ''
          btn.style.color = ''
        }
      })
    }

    const generateConfig = () => {
      generatedParams.value = calculateParams(config)
    }

    const showTooltip = (event, paramName) => {
      const rect = event.target.getBoundingClientRect()
      
      tooltip.visible = true
      tooltip.paramName = paramName
      tooltip.top = rect.bottom + 5
      tooltip.left = rect.left
      
      // 确保 tooltip 不会超出屏幕右边界
      setTimeout(() => {
        const tooltipEl = document.querySelector('.param-tooltip')
        if (tooltipEl) {
          const tooltipRect = tooltipEl.getBoundingClientRect()
          if (tooltipRect.right > window.innerWidth - 10) {
            tooltip.left = window.innerWidth - tooltipRect.width - 10
          }
          if (tooltipRect.left < 10) {
            tooltip.left = 10
          }
        }
      }, 0)
    }

    const keepTooltipVisible = (paramName) => {
      // 保持tooltip可见，当鼠标移到tooltip上时
      if (tooltipTimeout) {
        clearTimeout(tooltipTimeout)
        tooltipTimeout = null
      }
      tooltip.visible = true
      tooltip.paramName = paramName
    }

    const hideTooltip = () => {
      // 延迟隐藏，给鼠标移动到tooltip的时间
      if (tooltipTimeout) {
        clearTimeout(tooltipTimeout)
      }
      tooltipTimeout = setTimeout(() => {
        tooltip.visible = false
        tooltipTimeout = null
      }, 200)
    }

    const updateParam = (index, value) => {
      if (generatedParams.value[index]) {
        generatedParams.value[index].value = value
      }
    }

    const updateParamByCategory = (category, index, value) => {
      const group = groupedParams.value[category]
      if (group && group[index]) {
        group[index].value = value
        // 同步更新 generatedParams
        const param = group[index]
        const globalIndex = generatedParams.value.findIndex(p => p.name === param.name)
        if (globalIndex !== -1) {
          generatedParams.value[globalIndex].value = value
        }
      }
    }

    const copyToClipboard = (event) => {
      if (!generatedParams.value || generatedParams.value.length === 0) {
        alert('没有可复制的配置参数，请先生成配置')
        return
      }
      
      // 先重置所有按钮
      resetAllButtons()
      
      const configText = generatedParams.value
        .map(param => `${param.name} = ${param.value}`)
        .join('\n')
      
      const btn = event?.currentTarget || event?.target || document.getElementById('copyBtn')
      
      navigator.clipboard.writeText(configText).then(() => {
        // 使用更友好的提示方式
        if (btn) {
          btn.textContent = '已复制！'
          btn.style.background = '#28a745'
          btn.style.color = 'white'
          setTimeout(() => {
            btn.textContent = buttonOriginalTexts.copyBtn
            btn.style.background = ''
            btn.style.color = ''
          }, 2000)
        } else {
          alert('配置已复制到剪贴板！')
        }
      }).catch(err => {
        console.error('复制失败:', err)
        if (btn) {
          btn.style.background = '#dc3545'
          btn.style.color = 'white'
          setTimeout(() => {
            btn.textContent = buttonOriginalTexts.copyBtn
            btn.style.background = ''
            btn.style.color = ''
          }, 2000)
        }
        alert('复制失败，请手动复制')
      })
    }

    // 生成 ALTER SYSTEM SQL 文本
    const generateAlterSystemSQL = () => {
      if (!generatedParams.value || generatedParams.value.length === 0) {
        return ''
      }
      
      // 生成 ALTER SYSTEM SET 的 SQL 语句
      // 对于字符串值需要加引号，对于数字和布尔值不需要
      const escapeValue = (value) => {
        const str = String(value).trim()
        // 如果是 on/off/true/false，不需要引号
        if (str.toLowerCase() === 'on' || str.toLowerCase() === 'off' || 
            str.toLowerCase() === 'true' || str.toLowerCase() === 'false') {
          return str.toLowerCase()
        }
        // 如果是纯数字，不需要引号
        if (/^-?\d+$/.test(str)) {
          return str
        }
        // 其他情况需要加单引号，并转义单引号
        return `'${str.replace(/'/g, "''")}'`
      }

      // 按分组组织参数
      const groupedParams = {}
      generatedParams.value.forEach(param => {
        const category = param.category || '其他参数'
        if (!groupedParams[category]) {
          groupedParams[category] = []
        }
        groupedParams[category].push(param)
      })

      // 生成带注释分组的 SQL
      const sqlStatements = []
      const categoryOrder = ['性能相关参数', '自动清理相关配置', '超时相关', '日志记录相关', '其他参数']
      
      categoryOrder.forEach(category => {
        if (groupedParams[category] && groupedParams[category].length > 0) {
          sqlStatements.push(`-- ======================${category}=====================`)
          groupedParams[category].forEach(param => {
            sqlStatements.push(`ALTER SYSTEM SET ${param.name} = ${escapeValue(param.value)};`)
          })
          sqlStatements.push('') // 空行分隔
        }
      })

      return sqlStatements.join('\n')
    }

    // 显示 ALTER SYSTEM SQL 弹窗
    const showAlterSystemSQL = () => {
      if (!generatedParams.value || generatedParams.value.length === 0) {
        alert('没有可生成的配置参数，请先生成配置')
        return
      }
      
      const sqlText = generateAlterSystemSQL()
      sqlModal.sqlText = sqlText
      sqlModal.visible = true
    }

    // 关闭 SQL 弹窗
    const closeSQLModal = () => {
      sqlModal.visible = false
      sqlModal.sqlText = ''
    }

    // 从弹窗复制 SQL
    const copySQLFromModal = () => {
      if (!sqlModal.sqlText) {
        return
      }
      
      navigator.clipboard.writeText(sqlModal.sqlText).then(() => {
        const btn = document.querySelector('.btn-copy-sql')
        if (btn) {
          const originalText = btn.textContent
          btn.textContent = '已复制！'
          btn.style.background = '#28a745'
          btn.style.color = 'white'
          setTimeout(() => {
            btn.textContent = originalText
            btn.style.background = ''
            btn.style.color = ''
          }, 2000)
        } else {
          alert('ALTER SYSTEM SQL 已复制到剪贴板！')
        }
      }).catch(err => {
        console.error('复制失败:', err)
        alert('复制失败，请手动复制')
      })
    }

    // 初始化时生成一次配置
    generateConfig()

    return {
      config,
      generatedParams,
      groupedParams,
      tooltip,
      generateConfig,
      updateParam,
      updateParamByCategory,
      copyToClipboard,
      showAlterSystemSQL,
      closeSQLModal,
      copySQLFromModal,
      sqlModal,
      getParamDescription,
      getParamDocUrl,
      isRestartRequired,
      getRestartRequiredText,
      showTooltip,
      keepTooltipVisible,
      hideTooltip
    }
  }
}
</script>

<style scoped>
.app-container {
  background: white;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 40px;
  text-align: center;
}

.header h1 {
  font-size: 2.5rem;
  margin-bottom: 10px;
  font-weight: 700;
}

.subtitle {
  font-size: 1.1rem;
  opacity: 0.9;
}

.main-content {
  display: flex;
  flex-direction: column;
  gap: 30px;
  padding: 30px;
}

.input-section {
  background: #f8f9fa;
  padding: 30px;
  border-radius: 12px;
}

.input-section h2 {
  margin-bottom: 20px;
  color: #333;
  font-size: 1.5rem;
}

.config-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-weight: 600;
  color: #555;
  font-size: 0.95rem;
}

.form-group input,
.form-group select {
  padding: 12px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 1rem;
  transition: border-color 0.3s;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #667eea;
}

.generate-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 14px;
  border-radius: 8px;
  font-size: 1.1rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  margin-top: 10px;
}

.generate-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
}

.generate-btn:active {
  transform: translateY(0);
}

.result-section {
  background: white;
  border-radius: 12px;
  padding: 30px;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 15px;
}

.result-header h2 {
  color: #333;
  font-size: 1.5rem;
}

.action-buttons {
  display: flex;
  gap: 10px;
}

.btn-secondary {
  background: #6c757d;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.3s ease;
  font-weight: 500;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.btn-secondary:hover {
  background: #5a6268;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

.btn-secondary:active {
  transform: translateY(0);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.params-container {
  max-height: 600px;
  overflow-y: auto;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
}

.params-table {
  width: 100%;
  border-collapse: collapse;
}

.params-table thead {
  background: #f8f9fa;
  position: sticky;
  top: 0;
  z-index: 10;
}

.params-table th {
  padding: 15px;
  text-align: left;
  font-weight: 600;
  color: #333;
  border-bottom: 2px solid #dee2e6;
  white-space: nowrap;
}

.params-table th:nth-child(1) {
  width: 25%;
}

.params-table th:nth-child(2) {
  width: 20%;
}

.params-table th:nth-child(3) {
  width: 12%;
  text-align: center;
}

.params-table th:nth-child(4) {
  width: 43%;
}

.params-table td {
  padding: 12px 15px;
  border-bottom: 1px solid #e9ecef;
}

.params-table tbody tr:hover {
  background: #f8f9fa;
}

.category-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.category-title {
  font-weight: 700;
  font-size: 1.1rem;
  color: white;
  padding: 15px;
  text-align: center;
  border-bottom: 2px solid rgba(255, 255, 255, 0.3);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.param-restart {
  padding: 12px 15px;
  text-align: center;
  vertical-align: middle;
}

.restart-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 0.85rem;
  font-weight: 600;
}

.restart-yes {
  background: #ff6b6b;
  color: white;
}

.restart-no {
  background: #51cf66;
  color: white;
}

.param-description {
  padding: 12px 15px;
  color: #6c757d;
  font-size: 0.9rem;
  line-height: 1.5;
  max-width: 300px;
}

.param-name {
  font-weight: 600;
  color: #495057;
  font-family: 'Courier New', monospace;
  font-size: 0.9rem;
  width: 25%;
  min-width: 200px;
}

.param-name-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.param-doc-link {
  display: inline-flex;
  align-items: center;
  color: #667eea;
  text-decoration: none;
  opacity: 0.6;
  transition: opacity 0.2s, transform 0.2s;
  flex-shrink: 0;
}

.param-doc-link:hover {
  opacity: 1;
  transform: scale(1.1);
}

.param-doc-link svg {
  display: block;
}

.param-value {
  padding: 0;
  position: relative;
}

.param-value-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.param-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 0.9rem;
  color: #212529;
  background: white;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.param-input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.1);
}

.param-input:hover {
  border-color: #ccc;
}

.param-help-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #667eea;
  color: white;
  font-size: 12px;
  font-weight: bold;
  cursor: help;
  flex-shrink: 0;
  transition: background 0.2s, transform 0.2s;
  user-select: none;
}

.param-help-icon:hover {
  background: #5568d3;
  transform: scale(1.1);
}

.param-tooltip {
  position: fixed;
  background: #333;
  color: white;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 0.85rem;
  max-width: 320px;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  pointer-events: auto;
  line-height: 1.4;
  word-wrap: break-word;
  margin-top: 5px;
}

.param-tooltip::before {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 10px;
  border: 5px solid transparent;
  border-bottom-color: #333;
}

.tooltip-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tooltip-text {
  margin: 0;
}

.tooltip-link {
  color: #8ab4f8;
  text-decoration: none;
  font-size: 0.8rem;
  margin-top: 4px;
  display: inline-block;
  transition: color 0.2s;
}

.tooltip-link:hover {
  color: #a8c8ff;
  text-decoration: underline;
}

/* SQL 预览弹窗样式 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal-content {
  background: white;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  max-width: 900px;
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e9ecef;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.3rem;
  font-weight: 600;
}

.modal-close {
  background: none;
  border: none;
  color: white;
  font-size: 2rem;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background 0.2s;
}

.modal-close:hover {
  background: rgba(255, 255, 255, 0.2);
}

.modal-body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
}

.sql-actions {
  margin-bottom: 16px;
  display: flex;
  justify-content: flex-end;
}

.btn-copy-sql {
  background: #667eea;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.3s ease;
  font-weight: 500;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.btn-copy-sql:hover {
  background: #5568d3;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

.btn-copy-sql:active {
  transform: translateY(0);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.sql-preview {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 20px;
  font-family: 'Courier New', 'Consolas', 'Monaco', monospace;
  font-size: 0.9rem;
  line-height: 1.6;
  color: #212529;
  overflow-x: auto;
  white-space: pre;
  margin: 0;
  max-height: 60vh;
  overflow-y: auto;
}

.sql-preview::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.sql-preview::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

.sql-preview::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 4px;
}

.sql-preview::-webkit-scrollbar-thumb:hover {
  background: #555;
}

@media (max-width: 768px) {
  .form-row {
    grid-template-columns: 1fr;
  }
  
  .modal-content {
    max-width: 100%;
    max-height: 95vh;
    margin: 10px;
  }
  
  .modal-header {
    padding: 16px 20px;
  }
  
  .modal-body {
    padding: 16px;
  }
  
  .sql-preview {
    font-size: 0.8rem;
    padding: 16px;
  }
}
</style>

