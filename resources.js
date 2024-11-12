import { fsSize } from 'systeminformation';
import Prometheus from 'prom-client';

const { hdb_analytics } = databases.system;
const { analytics } = server.config;
const { PrometheusExporterSettings } = tables;
const AGGREGATE_PERIOD_MS = analytics?.aggregatePeriod ? analytics?.aggregatePeriod * 1000 : 600000;

Prometheus.collectDefaultMetrics();
Prometheus.register.setContentType(
	Prometheus.Registry.OPENMETRICS_CONTENT_TYPE,
);
contentTypes.set('application/openmetrics-text', {
	serialize(data) {
		return data.toString();
	},
	q: 1,
});

const puts_gauge = new Prometheus.Gauge({ name: 'harperdb_table_puts_total', help: 'Total number of non-delete writes by table', labelNames: ['database', 'table'] });
const deletes_gauge = new Prometheus.Gauge({ name: 'harperdb_table_deletes_total', help: 'Total number of deletes by table', labelNames: ['database', 'table'] });
const txns_gauge = new Prometheus.Gauge({ name: 'harperdb_table_txns_total', help: 'Total number of transactions by table', labelNames: ['database', 'table'] });
const page_flushes_gauge = new Prometheus.Gauge({ name: 'harperdb_table_page_flushes_total', help: 'Total number of times all pages are flushed by table', labelNames: ['database', 'table'] });
const writes_gauge = new Prometheus.Gauge({ name: 'harperdb_table_writes_total', help: 'Total number of disk write operations by table', labelNames: ['database', 'table'] });
const pages_written_gauge = new Prometheus.Gauge({ name: 'harperdb_table_pages_written_total', help: 'Total number of pages written to disk by table. This is higher than writes because sequential pages can be written in a single write operation.', labelNames: ['database', 'table'] });
const time_during_txns_gauge = new Prometheus.Gauge({ name: 'harperdb_table_time_during_txns_total', help: 'Total time from when transaction was started (lock acquired) until finished and all writes have been made (but not necessarily flushed/synced to disk) by table', labelNames: ['database', 'table'] });
const time_start_txns_gauge = new Prometheus.Gauge({ name: 'harperdb_table_time_start_txns_total', help: 'Total time spent waiting for transaction lock acquisition by table', labelNames: ['database', 'table'] });
const time_page_flushes_gauge = new Prometheus.Gauge({ name: 'harperdb_table_time_page_flushes_total', help: 'Total time spent on write calls by table', labelNames: ['database', 'table'] });
const time_sync_gauge = new Prometheus.Gauge({ name: 'harperdb_table_time_sync_total', help: 'Total time spent waiting for writes to sync/flush to disk by table', labelNames: ['database', 'table'] });

const thread_count_gauge = new Prometheus.Gauge({ name: 'harperdb_process_threads_count', help: 'Number of threads in the HarperDB core process' });
const harperdb_cpu_percentage_gauge = new Prometheus.Gauge({ name: 'harperdb_process_cpu_utilization', help: 'CPU utilization of a HarperDB process', labelNames: ['process_name'] });

const connections_gauge = new Prometheus.Gauge({ name: 'connection', help: 'Number of successful connection attempts by protocol', labelNames: ['protocol', 'type', 'action'] });
const open_connections_gauge = new Prometheus.Gauge({ name: 'open_connections', help: 'Average number of connections across all threads', labelNames: ['protocol'] });
const acl_fail_gauge = new Prometheus.Gauge({ name: 'acl_fail', help: 'Number of failed ACL usages', labelNames: ['topic'] });
const bytes_sent_gauge = new Prometheus.Gauge({ name: 'bytes_sent', help: 'Bytes sent by protocol', labelNames: ['protocol', 'action', 'topic'] });
const messages_sent_gauge = new Prometheus.Gauge({ name: 'messages_sent', help: 'Messages sent by protocol', labelNames: ['protocol', 'action', 'topic'] });
const bytes_received_gauge = new Prometheus.Gauge({ name: 'bytes_received', help: 'Bytes received by protocol', labelNames: ['protocol', 'action', 'topic'] });
const messages_received_gauge = new Prometheus.Gauge({ name: 'messages_received', help: 'Messages received by protocol', labelNames: ['protocol', 'action', 'topic'] });
const cache_hits_gauge = new Prometheus.Gauge({ name: 'cache_hit', help: 'Number of cache hits by table', labelNames: ['table'] });
const cache_miss_gauge = new Prometheus.Gauge({ name: 'cache_miss', help: 'Number of cache misses by table', labelNames: ['table'] });
const success_gauge = new Prometheus.Gauge({ name: 'success', help: 'Number of success requests by endpoint', labelNames: ['path', 'type', 'method', 'label'] });
const response_status_code_gauge = new Prometheus.Gauge({ name: 'response_status_code', help: 'Number of requests by HTTP response status code', labelNames: ['path', 'method', 'status_code'] });

const filesystem_size_bytes = new Prometheus.Gauge({ name: 'filesystem_size_bytes', help: 'Filesystem size in bytes.', labelNames: ['device', 'fstype', 'mountpoint'] });
const filesystem_avail_bytes = new Prometheus.Gauge({ name: 'filesystem_free_bytes', help: 'Filesystem free space in bytes.', labelNames: ['device', 'fstype', 'mountpoint'] });
const filesystem_used_bytes = new Prometheus.Gauge({ name: 'filesystem_used_bytes', help: 'Filesystem space used in bytes.', labelNames: ['device', 'fstype', 'mountpoint'] });

const cluster_ping_gauge = new Prometheus.Gauge({ name: 'cluster_ping', help: 'Cluster ping response time', labelNames: ['node'] });
const replication_backlog_gauge = new Prometheus.Gauge({ name: 'replication_backlog', help: 'Number of pending replication consumers', labelNames: ['origin', 'database', 'table'] });

const thread_heap_total_gauge = new Prometheus.Gauge({ name: 'thread_heap_total', help: 'Total heap space by thread in bytes', labelNames: ['thread_id', 'name'] });
const thread_heap_used_gauge = new Prometheus.Gauge({ name: 'thread_heap_used', help: 'Used heap space by thread in bytes', labelNames: ['thread_id', 'name'] });
const thread_external_memory_gauge = new Prometheus.Gauge({ name: 'thread_external_memory', help: 'External memory by thread in bytes', labelNames: ['thread_id', 'name'] });
const thread_array_buffers_gauge = new Prometheus.Gauge({ name: 'thread_array_buffers', help: 'Array Buffers by thread in bytes', labelNames: ['thread_id', 'name'] });

const thread_idle_gauge = new Prometheus.Gauge({ name: 'thread_idle', help: 'Idle time by thread in ms', labelNames: ['thread_id', 'name'] });
const thread_active_gauge = new Prometheus.Gauge({ name: 'thread_active', help: 'Active time by thread in ms', labelNames: ['thread_id', 'name'] });
const thread_utilization_gauge = new Prometheus.Gauge({ name: 'thread_utilization', help: 'Utilization by thread', labelNames: ['thread_id', 'name'] });

const memory_total_gauge = new Prometheus.Gauge({ name: 'memory_total', help: 'Total memory', labelNames: [] });
const memory_free_gauge = new Prometheus.Gauge({ name: 'memory_free', help: 'Free memory', labelNames: [] });
const memory_used_gauge = new Prometheus.Gauge({ name: 'memory_used', help: 'Used memory', labelNames: [] });
const memory_active_gauge = new Prometheus.Gauge({ name: 'memory_active', help: 'Active memory', labelNames: [] });
const memory_available_gauge = new Prometheus.Gauge({ name: 'memory_available', help: 'Available memory', labelNames: [] });
const memory_swaptotal_gauge = new Prometheus.Gauge({ name: 'memory_swaptotal', help: 'Swap Total memory', labelNames: [] });
const memory_swapused_gauge = new Prometheus.Gauge({ name: 'memory_swapused', help: 'Swap Used memory', labelNames: [] });
const memory_swapfree_gauge = new Prometheus.Gauge({ name: 'memory_swapfree', help: 'Swap Free memory', labelNames: [] });
const memory_writeback_gauge = new Prometheus.Gauge({ name: 'memory_writeback', help: 'writeback memory', labelNames: [] });
const memory_dirty_gauge = new Prometheus.Gauge({ name: 'memory_dirty', help: 'dirty memory', labelNames: [] });
const memory_rss_gauge = new Prometheus.Gauge({ name: 'memory_rss', help: 'rss memory', labelNames: [] });
const memory_heap_total_gauge = new Prometheus.Gauge({ name: 'memory_heap_total', help: 'heap total memory', labelNames: [] });
const memory_heap_used_gauge = new Prometheus.Gauge({ name: 'memory_heap_used', help: 'heap used memory', labelNames: [] });
const memory_external_gauge = new Prometheus.Gauge({ name: 'memory_external', help: 'external memory', labelNames: [] });
const memory_array_buffers_gauge = new Prometheus.Gauge({ name: 'memory_array_buffers', help: 'Array Buffers memory', labelNames: [] });

//logic to create a settings.json file if one does not exist
if (server.workerIndex == 0) {
	(async () => {

		if (PrometheusExporterSettings.getRecordCount({ exactCount: false }).recordCount === 0) {
			PrometheusExporterSettings.put({ name: "forceAuthorization", value: true });
			PrometheusExporterSettings.put({ name: "allowedUsers", value: [] });
			PrometheusExporterSettings.put({ name: "customMetrics", value: [] });
		}
	})();
}

class metrics extends Resource {
	async allowRead(user) {
		let forceAuthorization = (await PrometheusExporterSettings.get('forceAuthorization')).value;

		if (forceAuthorization !== true) {
			return true;
		}

		let allowedUsers = (await PrometheusExporterSettings.get('allowedUsers')).value;
		if (allowedUsers.length > 0) {
			return allowedUsers.some(allow_user => {
				return allow_user === user?.username;
			});
		} else
			return user?.role?.role === 'super_user';
	}

	async get() {
		//reset the gauges, this is due to the values staying "stuck" if there is no system info metric value for the prometheus metric.  If our system info has no metrics we then need the metric to be zero.
		puts_gauge.reset();
		deletes_gauge.reset();
		txns_gauge.reset();
		page_flushes_gauge.reset();
		writes_gauge.reset();
		pages_written_gauge.reset();
		time_during_txns_gauge.reset();
		time_start_txns_gauge.reset();
		time_page_flushes_gauge.reset();
		time_sync_gauge.reset();
		thread_count_gauge.reset();
		harperdb_cpu_percentage_gauge.reset();

		connections_gauge.reset();
		open_connections_gauge.reset();
		acl_fail_gauge.reset();
		bytes_sent_gauge.reset();
		cache_hits_gauge.reset();
		cache_miss_gauge.reset();
		bytes_received_gauge.reset();
		success_gauge.reset();
		response_status_code_gauge.reset();

		filesystem_size_bytes.reset();
		filesystem_avail_bytes.reset();
		filesystem_used_bytes.reset();

		cluster_ping_gauge.reset();
		replication_backlog_gauge.reset();

		thread_heap_total_gauge.reset();
		thread_heap_used_gauge.reset();
		thread_external_memory_gauge.reset();
		thread_array_buffers_gauge.reset();

		thread_idle_gauge.reset();
		thread_active_gauge.reset();
		thread_utilization_gauge.reset();

		memory_total_gauge.reset();
		memory_free_gauge.reset();
		memory_used_gauge.reset();
		memory_active_gauge.reset();
		memory_available_gauge.reset();
		memory_swaptotal_gauge.reset();
		memory_swapused_gauge.reset();
		memory_swapfree_gauge.reset();
		memory_writeback_gauge.reset();
		memory_dirty_gauge.reset();
		memory_rss_gauge.reset();
		memory_heap_total_gauge.reset();
		memory_heap_used_gauge.reset();
		memory_external_gauge.reset();
		memory_array_buffers_gauge.reset();

		const system_info = await hdb_analytics.operation({
			operation: 'system_information',
			attributes: [ 'database_metrics', 'harperdb_processes', 'replication', 'threads', 'memory' ]
		});

		gaugeSet(thread_count_gauge, {}, system_info?.threads?.length);
		if (system_info?.threads?.length && system_info?.threads?.length > 0) {
			system_info.threads.forEach(thread => {
				gaugeSet(thread_heap_total_gauge, { thread_id: thread?.threadId, name: thread?.name },
					thread?.heapTotal);
				gaugeSet(thread_heap_used_gauge, { thread_id: thread?.threadId, name: thread?.name },
					thread?.heapUsed);
				gaugeSet(thread_external_memory_gauge, { thread_id: thread?.threadId, name: thread?.name },
					thread?.externalMemory);
				gaugeSet(thread_array_buffers_gauge, { thread_id: thread?.threadId, name: thread?.name },
					thread?.arrayBuffers);

				gaugeSet(thread_idle_gauge, { thread_id: thread?.threadId, name: thread?.name },
					thread?.idle);
				gaugeSet(thread_active_gauge, { thread_id: thread?.threadId, name: thread?.name },
					thread?.active);
				gaugeSet(thread_utilization_gauge, { thread_id: thread?.threadId, name: thread?.name },
					thread?.utilization);
			});
		}

		if (system_info?.memory) {
			const memory = system_info.memory;
			gaugeSet(memory_total_gauge, {}, memory.total);
			gaugeSet(memory_free_gauge, {}, memory.free);
			gaugeSet(memory_used_gauge, {}, memory.used);
			gaugeSet(memory_active_gauge, {}, memory.active);
			gaugeSet(memory_available_gauge, {}, memory.available);
			gaugeSet(memory_swaptotal_gauge, {}, memory.swaptotal);
			gaugeSet(memory_swapused_gauge, {}, memory.swapused);
			gaugeSet(memory_swapfree_gauge, {}, memory.swapfree);
			gaugeSet(memory_writeback_gauge, {}, memory.writeback);
			gaugeSet(memory_dirty_gauge, {}, memory.dirty);
			gaugeSet(memory_rss_gauge, {}, memory.rss);
			gaugeSet(memory_heap_total_gauge, {}, memory.heapTotal);
			gaugeSet(memory_heap_used_gauge, {}, memory.heapUsed);
			gaugeSet(memory_external_gauge, {}, memory.external);
			gaugeSet(memory_array_buffers_gauge, {}, memory.arrayBuffers);
		}

		if (system_info?.harperdb_processes?.core?.length > 0) {
			gaugeSet(harperdb_cpu_percentage_gauge, { process_name: 'harperdb_core' },
				system_info?.harperdb_processes?.core[0]?.cpu);
		}
		const sizes = await fsSize();

		sizes.forEach(device => {
			gaugeSet(filesystem_size_bytes, { device: device.fs, fstype: device.type, mountpoint: device.mount },
				device.size);
			gaugeSet(filesystem_avail_bytes, { device: device.fs, fstype: device.type, mountpoint: device.mount },
				device.available);
			gaugeSet(filesystem_used_bytes, { device: device.fs, fstype: device.type, mountpoint: device.mount },
				device.use);
		});

		if (system_info.harperdb_processes.clustering?.length > 0) {
			system_info.harperdb_processes.clustering.forEach(process_data => {
				if (process_data?.params?.endsWith('hub.json')) {
					gaugeSet(harperdb_cpu_percentage_gauge, { process_name: 'harperdb_clustering_hub' }, process_data.cpu);
				} else if (process_data?.params?.endsWith('leaf.json')) {
					gaugeSet(harperdb_cpu_percentage_gauge, { process_name: 'harperdb_clustering_leaf' }, process_data.cpu);
				}
			});

			// Launch the cluster_network operation as a background task with 60-second timeout
			Promise.race([
				hdb_analytics.operation({
					operation: 'cluster_network',
					attributes: [ 'response_time' ]
				}),
				new Promise(resolve => {
					setTimeout(() => resolve(), 40000);
				})
			])
			.then(cluster_info => {
				// Set cluster_ping_gauge for each node in the cluster
				if (cluster_info) { // cluster_info will be undefined if the timeout is reached first
					cluster_info?.nodes?.forEach(node => {
						gaugeSet(cluster_ping_gauge, { node: node?.name }, node?.response_time);
					});
				}
			})
			.catch(err => {
				throw err
			});
		}

		if (system_info.replication?.length > 0) {
			system_info.replication?.forEach(repl_item => {
				repl_item.consumers?.forEach(consumer => {
					const { database, table } = repl_item;
					gaugeSet(replication_backlog_gauge, {
						origin: consumer.name,
						database,
						table
					}, consumer.num_pending || 0);
				});
			});
		}

		for (const [ database_name, table_object ] of Object.entries(system_info?.metrics)) {
			for (const [ table_name, table_metrics ] of Object.entries(table_object)) {
				const labels = { database: database_name, table: table_name };
				gaugeSet(puts_gauge, labels, table_metrics?.puts);
				gaugeSet(deletes_gauge, labels, table_metrics?.deletes);
				gaugeSet(txns_gauge, labels, table_metrics?.txns);
				gaugeSet(page_flushes_gauge, labels, table_metrics?.pageFlushes);
				gaugeSet(writes_gauge, labels, table_metrics?.writes);
				gaugeSet(pages_written_gauge, labels, table_metrics?.pagesWritten);
				gaugeSet(time_during_txns_gauge, labels, table_metrics?.timeDuringTxns);
				gaugeSet(time_start_txns_gauge, labels, table_metrics?.timeStartTxns);
				gaugeSet(time_page_flushes_gauge, labels, table_metrics?.timePageFlushes);
				gaugeSet(time_sync_gauge, labels, table_metrics?.timeSync);
			}
		}

		const output = await generateMetricsFromAnalytics();
		const prom_results = await Prometheus.register.metrics();

		if (output.length > 0) {
			return output.join('\n') + '\n' + prom_results;
		} else {
			return prom_results;
		}
	}
}

async function generateMetricsFromAnalytics() {
	const end_at = Date.now();
	const start_at = end_at - (AGGREGATE_PERIOD_MS * 1.5);
	let results = await hdb_analytics.search({
		conditions: [
			{ attribute: 'id', value: [ start_at, end_at ], comparator: 'between' }
		]
	});

	const output = [];
	const customMetrics = (await PrometheusExporterSettings.get('customMetrics')).value;

	for await (let metric of results) {
		if (metric) {
			// HTTP response status code metrics; status code is in metric name, e.g. response_200
			if (typeof metric?.metric === 'string' && metric.metric?.startsWith('response_')) {
				gaugeSet(response_status_code_gauge, {
					path: metric.path, method: metric.method,
					status_code: metric.metric.split('_')[1]
				}, metric.count);
				continue;
			}

			switch (metric?.metric) {
				case 'connection':
					gaugeSet(connections_gauge, { protocol: metric.path, action: metric.method, type: 'total' },
						metric.count);
					gaugeSet(connections_gauge, { protocol: metric.path, action: metric.method, type: 'success' },
						metric.total);
					gaugeSet(connections_gauge, { protocol: metric.path, action: metric.method, type: 'failed' },
						metric?.count - metric?.total);
					break;
				case 'mqtt-connections':
					gaugeSet(open_connections_gauge, { protocol: 'mqtt' }, metric.connections);
					break;
				case 'acl-fail':
					gaugeSet(acl_fail_gauge, { topic: metric.path }, metric.total);
					break;
				case 'connections':
					gaugeSet(open_connections_gauge, { protocol: 'ws' }, metric.connections);
					break;
				case 'bytes-sent':
					gaugeSet(bytes_sent_gauge, { protocol: metric.type, action: metric.method, topic: metric.path },
						metric.count * metric.mean);
					gaugeSet(messages_sent_gauge, { protocol: metric.type, action: metric.method, topic: metric.path },
						metric.count);
					break;
				case 'bytes-received':
					gaugeSet(bytes_received_gauge, { protocol: metric.type, action: metric.method, topic: metric.path },
						metric.count * metric.mean);
					gaugeSet(messages_received_gauge, {
							protocol: metric.type,
							action: metric.method,
							topic: metric.path
						},
						metric.count);
					break;
				case 'TTFB':
				case 'duration':
					output.push(`# HELP ${metric.metric} Time for HarperDB to execute request in ms`);
					output.push(`# TYPE ${metric.metric} summary`);
					output.push(`${metric.metric}{quantile="0.01",type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.p1}`);
					output.push(`${metric.metric}{quantile="0.10",type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.p10}`);
					output.push(`${metric.metric}{quantile="0.25",type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.p25}`);
					output.push(`${metric.metric}{quantile="0.50",type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.median}`);
					output.push(`${metric.metric}{quantile="0.75",type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.p75}`);
					output.push(`${metric.metric}{quantile="0.90",type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.p90}`);
					output.push(`${metric.metric}{quantile="0.95",type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.p95}`);
					output.push(`${metric.metric}{quantile="0.99",type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.p99}`);
					output.push(`${metric.metric}_sum{type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.mean * metric.count}`);
					output.push(`${metric.metric}_count{type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.count}`);
					break;
				case 'cache-resolution':
					//prometheus doesn't like hyphens in metric names
					let metric_name = 'cache_resolution';
					output.push(`# HELP ${metric_name} Time to resolve a cache miss`);
					output.push(`# TYPE ${metric_name} summary`);
					output.push(`${metric_name}{quantile="0.01",type="${metric.type}",table="${metric.path}"} ${metric.p1}`);
					output.push(`${metric_name}{quantile="0.10",type="${metric.type}",table="${metric.path}"} ${metric.p10}`);
					output.push(`${metric_name}{quantile="0.25",type="${metric.type}",table="${metric.path}"} ${metric.p25}`);
					output.push(`${metric_name}{quantile="0.50",type="${metric.type}",table="${metric.path}"} ${metric.median}`);
					output.push(`${metric_name}{quantile="0.75",type="${metric.type}",table="${metric.path}"} ${metric.p75}`);
					output.push(`${metric_name}{quantile="0.90",type="${metric.type}",table="${metric.path}"} ${metric.p90}`);
					output.push(`${metric_name}{quantile="0.95",type="${metric.type}",table="${metric.path}"} ${metric.p95}`);
					output.push(`${metric_name}{quantile="0.99",type="${metric.type}",table="${metric.path}"} ${metric.p99}`);
					output.push(`${metric_name}_sum{type="${metric.type}",table="${metric.path}"} ${metric.mean * metric.count}`);
					output.push(`${metric_name}_count{type="${metric.type}",table="${metric.path}"} ${metric.count}`);
					break;
				case 'cache-hit':
					gaugeSet(cache_hits_gauge, { table: metric.path }, metric.total);
					gaugeSet(cache_miss_gauge, { table: metric.path }, metric.count - metric.total);
					break;
				case 'success':
					gaugeSet(success_gauge, {
							path: metric.path,
							method: metric.method,
							type: metric.type,
							label: 'total'
						},
						metric.total);
					gaugeSet(success_gauge, {
							path: metric.path,
							method: metric.method,
							type: metric.type,
							label: 'success'
						},
						metric.count);
					break;
				case 'transfer':
					output.push(`# HELP ${metric.metric} Time to transfer request (ms)`);
					output.push(`# TYPE ${metric.metric} summary`);
					output.push(`${metric.metric}{quantile="0.01",type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.p1}`);
					output.push(`${metric.metric}{quantile="0.10",type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.p10}`);
					output.push(`${metric.metric}{quantile="0.25",type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.p25}`);
					output.push(`${metric.metric}{quantile="0.50",type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.median}`);
					output.push(`${metric.metric}{quantile="0.75",type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.p75}`);
					output.push(`${metric.metric}{quantile="0.90",type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.p90}`);
					output.push(`${metric.metric}{quantile="0.95",type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.p95}`);
					output.push(`${metric.metric}{quantile="0.99",type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.p99}`);
					output.push(`${metric.metric}_sum{type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.mean * metric.count}`);
					output.push(`${metric.metric}_count{type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.count}`);
					//needs to be a new line after every metric
					break;
				case 'replication-latency':
					let m_name = 'replication_latency';
					// Split by '.' on the path value from the metric to get origin, database and table
					let [ txn, database, table, origin ] = metric.path?.split('.');
					origin = origin.replace('-leaf', '');
					output.push(`# HELP ${m_name} Replication latency`);
					output.push(`# TYPE ${m_name} summary`);
					output.push(`${m_name}{quantile="0.01",origin="${origin}",database="${database}",table="${table}"} ${metric.p1}`);
					output.push(`${m_name}{quantile="0.10",origin="${origin}",database="${database}",table="${table}"} ${metric.p10}`);
					output.push(`${m_name}{quantile="0.25",origin="${origin}",database="${database}",table="${table}"} ${metric.p25}`);
					output.push(`${m_name}{quantile="0.50",origin="${origin}",database="${database}",table="${table}"} ${metric.median}`);
					output.push(`${m_name}{quantile="0.75",origin="${origin}",database="${database}",table="${table}"} ${metric.p75}`);
					output.push(`${m_name}{quantile="0.90",origin="${origin}",database="${database}",table="${table}"} ${metric.p90}`);
					output.push(`${m_name}{quantile="0.95",origin="${origin}",database="${database}",table="${table}"} ${metric.p95}`);
					output.push(`${m_name}{quantile="0.99",origin="${origin}",database="${database}",table="${table}"} ${metric.p99}`);

					// Add sum and count
					output.push(`${m_name}_sum{origin="${origin}",database="${database}",table="${table}"} ${metric.mean * metric.count}`);
					output.push(`${m_name}_count{origin="${origin}",database="${database}",table="${table}"} ${metric.count}`);
					break;
				default:
					await outputCustomMetrics(customMetrics, metric, output);
					break;
			}
		}
	}
	return output;
}

// Call set() function on any gauge object with a default value of 0
const gaugeSet = (gauge, options, value) => gauge?.set(options, value || 0);

async function outputCustomMetrics(customMetrics, metric, output) {
	customMetrics.forEach(custom_metric => {
		const customMetricName = custom_metric.get('name');
		if (metric[custom_metric.get('metricAttribute')] === customMetricName) {
			output.push(`# HELP ${customMetricName} ${custom_metric.help}`);
			output.push(`# TYPE ${customMetricName} summary`);

			const labels = buildCustomLabels(custom_metric, metric);

			output.push(`${customMetricName}{quantile="0.01",${labels}} ${metric.p1 ?? 0}`);
			output.push(`${customMetricName}{quantile="0.10",${labels}} ${metric.p10 ?? 0}`);
			output.push(`${customMetricName}{quantile="0.25",${labels}} ${metric.p25 ?? 0}`);
			output.push(`${customMetricName}{quantile="0.50",${labels}} ${metric.median ?? 0}`);
			output.push(`${customMetricName}{quantile="0.75",${labels}} ${metric.p75 ?? 0}`);
			output.push(`${customMetricName}{quantile="0.90",${labels}} ${metric.p90 ?? 0}`);
			output.push(`${customMetricName}{quantile="0.95",${labels}} ${metric.p95 ?? 0}`);
			output.push(`${customMetricName}{quantile="0.99",${labels}} ${metric.p99 ?? 0}`);
			output.push(`${customMetricName}_sum{${labels}} ${((metric.mean ?? 0) * (metric.count ?? 0))}`);
			output.push(`${customMetricName}_count{${labels}} ${metric.count}`);
		}
	});
}

function buildCustomLabels(custom_metric, metric) {
	let labels = [];
	custom_metric.get('labels').forEach(label => {
		labels.push(`${label.label}="${metric[label.metricAttribute]}"`);
	});
	return labels.join(',');
}

export const prometheus_exporter = {
	metrics,
	PrometheusExporterSettings
};