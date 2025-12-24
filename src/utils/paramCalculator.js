/**
 * PostgreSQL 参数计算工具
 * 根据CPU核心数、内存大小和存储类型计算优化的PostgreSQL参数
 */
import { getParamCategory } from './paramCategories.js'

/**
 * 智能选择内存单位（GB/MB/KB），优先使用整数单位
 * @param {number} bytes - 字节数
 * @returns {string} 格式化的值，如 "16GB", "512MB", "8192kB"
 */
function formatMemorySize(bytes) {
	const gb = bytes / 1024 / 1024 / 1024
	if (gb >= 1 && gb % 1 === 0) {
		return `${gb}GB`
	}

	const mb = bytes / 1024 / 1024
	if (mb >= 1 && mb % 1 === 0) {
		return `${mb}MB`
	}

	const kb = bytes / 1024
	if (kb >= 1 && kb % 1 === 0) {
		return `${kb}kB`
	}

	// 如果都不是整数，使用KB并保留2位小数
	return `${kb.toFixed(2)}kB`
}

/**
 * 智能选择内存单位（从KB开始）
 * @param {number} kb - KB数
 * @returns {string} 格式化的值，如 "16GB", "512MB", "8192kB"
 */
function formatMemorySizeFromKB(kb) {
	const gb = kb / 1024 / 1024
	if (gb >= 1 && gb % 1 === 0) {
		return `${gb}GB`
	}

	const mb = kb / 1024
	if (mb >= 1 && mb % 1 === 0) {
		return `${mb}MB`
	}

	if (kb % 1 === 0) {
		return `${kb}kB`
	}

	return `${kb.toFixed(2)}kB`
}

/**
 * 智能选择内存单位（从MB开始）
 * @param {number} mb - MB数
 * @returns {string} 格式化的值，如 "16GB", "512MB"
 */
function formatMemorySizeFromMB(mb) {
	const gb = mb / 1024
	if (gb >= 1 && gb % 1 === 0) {
		return `${gb}GB`
	}

	if (mb % 1 === 0) {
		return `${mb}MB`
	}

	return `${mb.toFixed(2)}MB`
}

/**
 * 计算所有PostgreSQL参数
 * @param {Object} config - 配置对象
 * @param {string} config.dbVersion - PostgreSQL版本
 * @param {number} config.cpuCores - CPU核心数
 * @param {number} config.memoryGB - 内存大小(GB)
 * @param {string} config.storageType - 存储类型 ('ssd' 或 'hdd')
 * @returns {Array} 参数数组，每个元素包含 {name, value}
 */
export function calculateParams(config) {
	const { cpuCores, memoryGB, storageType } = config
	// DBInstanceClassMemory = 内存GB * 1024 * 1024 * 1024 (转换为字节)
	const DBInstanceClassMemory = memoryGB * 1024 * 1024 * 1024
	const memoryMB = memoryGB * 1024 // 转换为MB

	const params = []

	// 参数分组定义
	const addParam = (name, value, category) => {
		params.push({ name, value, category })
	}

	// ====================== 自动清理相关配置 ======================
	const autovacuumCategory = '自动清理相关配置'
	addParam('autovacuum', 'on', autovacuumCategory)
	addParam('autovacuum_analyze_scale_factor', '0.05', autovacuumCategory)
	addParam('autovacuum_analyze_threshold', '50', autovacuumCategory)
	addParam('autovacuum_naptime', '15', autovacuumCategory)
	addParam('autovacuum_vacuum_cost_delay', '2', autovacuumCategory)
	addParam('autovacuum_vacuum_cost_limit', '200', autovacuumCategory)
	addParam('autovacuum_vacuum_scale_factor', '0.05', autovacuumCategory)
	addParam('autovacuum_vacuum_threshold', '50', autovacuumCategory)
	addParam('log_autovacuum_min_duration', '10000', autovacuumCategory)
	addParam('autovacuum_freeze_max_age', '200000000', autovacuumCategory)
	addParam('autovacuum_multixact_freeze_max_age', '400000000', autovacuumCategory)

	// autovacuum_max_workers = LEAST(GREATEST(DBInstanceClassMemory/17179869184, 3), 10)
	// DBInstanceClassMemory 是字节，17179869184 = 16GB
	const autovacuumMaxWorkers = Math.min(Math.max(Math.floor(DBInstanceClassMemory / 17179869184), 3), 10)
	addParam('autovacuum_max_workers', autovacuumMaxWorkers.toString(), autovacuumCategory)

	// autovacuum_work_mem = GREATEST(DBInstanceClassMemory/65536, 131072)
	// DBInstanceClassMemory 是字节，除以65536后结果单位就是KB
	const autovacuumWorkMemKB = Math.max(Math.floor(DBInstanceClassMemory / 65536), 131072)
	addParam('autovacuum_work_mem', formatMemorySizeFromKB(autovacuumWorkMemKB), autovacuumCategory)

	// Vacuum 相关参数
	addParam('vacuum_cleanup_index_scale_factor', '0.1', autovacuumCategory)
	addParam('vacuum_cost_limit', '10000', autovacuumCategory)
	addParam('vacuum_cost_delay', '0', autovacuumCategory)
	addParam('vacuum_cost_page_dirty', '20', autovacuumCategory)
	addParam('vacuum_cost_page_hit', '1', autovacuumCategory)
	addParam('vacuum_cost_page_miss', '2', autovacuumCategory)
	addParam('vacuum_defer_cleanup_age', '0', autovacuumCategory)
	addParam('vacuum_freeze_min_age', '50000000', autovacuumCategory)
	addParam('vacuum_freeze_table_age', '200000000', autovacuumCategory)
	addParam('vacuum_multixact_freeze_min_age', '5000000', autovacuumCategory)
	addParam('vacuum_multixact_freeze_table_age', '200000000', autovacuumCategory)

	// ====================== 性能相关参数 ======================
	const performanceCategory = '性能相关参数'
	addParam('wal_sender_timeout', '5min', performanceCategory)
	addParam('wal_compression', 'on', performanceCategory)
	addParam('jit', 'off', performanceCategory)

	// max_connections = 核心数 * 200
	const maxConnections = cpuCores * 200
	addParam('max_connections', maxConnections.toString(), performanceCategory)

	// shared_buffers = 内存四分之一
	const sharedBuffersBytes = DBInstanceClassMemory / 4
	addParam('shared_buffers', formatMemorySize(sharedBuffersBytes), performanceCategory)

	// effective_cache_size = 总内存的 3/4
	const effectiveCacheSizeBytes = DBInstanceClassMemory * 3 / 4
	addParam('effective_cache_size', formatMemorySize(effectiveCacheSizeBytes), performanceCategory)

	// maintenance_work_mem = LEAST(DBInstanceClassMemory/65536, 4194304)
	// DBInstanceClassMemory 是字节，除以65536后结果单位就是KB
	// 32GB * 1024^3 / 65536 = 524288 kB
	const maintenanceWorkMemKB = Math.min(Math.floor(DBInstanceClassMemory / 65536), 4194304)
	addParam('maintenance_work_mem', formatMemorySizeFromKB(maintenanceWorkMemKB), performanceCategory)

	addParam('checkpoint_completion_target', '0.9', performanceCategory)

	// wal_buffers = min(2047MB, shared_buffers/32)
	// 例如：shared_buffers是16GB，则 wal_buffers = min(2047MB, 16GB/32) = min(2047MB, 512MB) = 512MB
	const walBuffersFromShared = sharedBuffersBytes / 32
	const maxWalBuffersBytes = 2047 * 1024 * 1024 // 2047MB in bytes
	const walBuffersBytes = Math.min(walBuffersFromShared, maxWalBuffersBytes)
	addParam('wal_buffers', formatMemorySize(walBuffersBytes), performanceCategory)

	addParam('checkpoint_timeout', '15min', performanceCategory)
	addParam('default_statistics_target', '100', performanceCategory)

	// random_page_cost 和 effective_io_concurrency 根据存储类型
	// 参考文章https://www.cnblogs.com/xibuhaohao/articles/19254482 
	// effective_io_concurrency 默认值统一设置为 1
	// 建议值：虚拟机使用默认值 1，物理磁盘 SSD 200，物理磁盘 HDD 4
	if (storageType === 'ssd') {
		addParam('random_page_cost', '1.1', performanceCategory)
		addParam('effective_io_concurrency', '1', performanceCategory)
	} else {
		addParam('random_page_cost', '4', performanceCategory)
		addParam('effective_io_concurrency', '1', performanceCategory)
	}

	// work_mem = GREATEST(DBInstanceClassMemory/4194304, 4096)
	// DBInstanceClassMemory 是字节，除以4194304后结果单位就是KB
	// 32GB * 1024^3 / 4194304 = 8192 kB
	const workMemKB = Math.max(Math.floor(DBInstanceClassMemory / 4194304), 4096)
	addParam('work_mem', formatMemorySizeFromKB(workMemKB), performanceCategory)

	addParam('huge_pages', 'try', performanceCategory)

	// min_wal_size = LEAST(GREATEST(DBInstanceClassMemory/8388608, 256), 8192)
	// DBInstanceClassMemory 是字节，除以8388608后结果单位就是MB
	// 32GB * 1024^3 / 8388608 = 4096 MB
	// 公式中的256和8192都是MB单位
	const minWalSizeMB = Math.min(Math.max(Math.floor(DBInstanceClassMemory / 8388608), 256), 8192)
	addParam('min_wal_size', formatMemorySizeFromMB(minWalSizeMB), performanceCategory)

	// max_wal_size = LEAST(GREATEST(DBInstanceClassMemory/2097152, 2048), 16384)
	// DBInstanceClassMemory 是字节，除以2097152后结果单位就是MB
	// 32GB * 1024^3 / 2097152 = 16384 MB
	// 公式中的2048和16384都是MB单位
	const maxWalSizeMB = Math.min(Math.max(Math.floor(DBInstanceClassMemory / 2097152), 2048), 16384)
	addParam('max_wal_size', formatMemorySizeFromMB(maxWalSizeMB), performanceCategory)

	// 并行处理相关参数
	// max_worker_processes = 核心数 * 2
	const maxWorkerProcesses = cpuCores * 2
	addParam('max_worker_processes', maxWorkerProcesses.toString(), performanceCategory)

	// max_parallel_workers_per_gather = GREATEST(DBInstanceClassCPU/2, 2)
	const maxParallelWorkersPerGather = Math.max(Math.floor(cpuCores / 2), 2)
	addParam('max_parallel_workers_per_gather', maxParallelWorkersPerGather.toString(), performanceCategory)

	// max_parallel_workers = GREATEST(DBInstanceClassCPU*3/4, 8)
	const maxParallelWorkers = Math.max(Math.floor(cpuCores * 3 / 4), 8)
	addParam('max_parallel_workers', maxParallelWorkers.toString(), performanceCategory)

	// max_parallel_maintenance_workers = GREATEST(DBInstanceClassCPU/2, 2)
	const maxParallelMaintenanceWorkers = Math.max(Math.floor(cpuCores / 2), 2)
	addParam('max_parallel_maintenance_workers', maxParallelMaintenanceWorkers.toString(), performanceCategory)

	// Background writer 相关参数
	addParam('bgwriter_lru_maxpages', '1000', performanceCategory)
	addParam('bgwriter_lru_multiplier', '2', performanceCategory)

	// 其他优化参数
	addParam('enable_partitionwise_aggregate', 'on', performanceCategory)
	addParam('enable_partitionwise_join', 'on', performanceCategory)
	addParam('extra_float_digits', '3', performanceCategory)

	// temp_file_limit = DBInstanceClassMemory/1024 (结果单位就是KB)
	// 32GB * 1024^3 / 1024 = 33554432 kB
	const tempFileLimitKB = Math.floor(DBInstanceClassMemory / 1024)
	addParam('temp_file_limit', formatMemorySizeFromKB(tempFileLimitKB), performanceCategory)

	addParam('track_io_timing', 'on', performanceCategory)

	// ====================== 超时相关 ======================
	const timeoutCategory = '超时相关'
	addParam('idle_in_transaction_session_timeout', '6min', timeoutCategory)
	addParam('statement_timeout', '5min', timeoutCategory)
	addParam('tcp_keepalives_count', '10', timeoutCategory)
	addParam('tcp_keepalives_idle', '45', timeoutCategory)
	addParam('tcp_keepalives_interval', '10', timeoutCategory)

	// ====================== 日志记录相关 ======================
	const loggingCategory = '日志记录相关'
	addParam('log_destination', 'stderr', loggingCategory)
	addParam('logging_collector', 'on', loggingCategory)
	addParam('log_directory', 'pg_log', loggingCategory)
	addParam('log_filename', 'postgresql-%m-%d.log', loggingCategory)
	addParam('log_truncate_on_rotation', 'on', loggingCategory)
	addParam('log_min_messages', 'NOTICE', loggingCategory)
	addParam('log_checkpoints', 'on', loggingCategory)
	addParam('log_lock_waits', 'on', loggingCategory)
	addParam('log_connections', 'off', loggingCategory)
	addParam('log_disconnections', 'off', loggingCategory)
	addParam('log_line_prefix', '%m [%p][%a] %u %d %r ', loggingCategory)
	addParam('log_timezone', 'Asia/Shanghai', loggingCategory)
	addParam('log_min_duration_statement', '5000ms', loggingCategory)
	addParam('log_temp_files', '131072', loggingCategory)
	addParam('log_min_duration_sample', '500ms', loggingCategory)
	addParam('log_statement_sample_rate', '0.2', loggingCategory)
	addParam('lc_messages', 'en_US.UTF-8', loggingCategory)

	// ====================== 其他参数 ======================
	const otherCategory = '其他参数'

	return params
}

