'use strict';
const {hdb_analytics} = databases.system;
const { analytics } = server.config;
const AGGREGATE_PERIOD_MS = analytics?.aggregatePeriod ? analytics?.aggregatePeriod * 1000 : 600000;

const Prometheus = require('prom-client');

Prometheus.collectDefaultMetrics();

const puts_gauge = new Prometheus.Gauge({name: 'harperdb_table_puts_total', help: 'Total number of non-delete writes by table', labelNames: ['database', 'table']})
const deletes_gauge = new Prometheus.Gauge({name: 'harperdb_table_deletes_total', help: 'Total number of deletes by table', labelNames: ['database', 'table']})
const txns_gauge = new Prometheus.Gauge({name: 'harperdb_table_txns_total', help: 'Total number of transactions by table', labelNames: ['database', 'table']})
const page_flushes_gauge = new Prometheus.Gauge({name: 'harperdb_table_page_flushes_total', help: 'Total number of times all pages are flushed by table', labelNames: ['database', 'table']})
const writes_gauge = new Prometheus.Gauge({name: 'harperdb_table_writes_total', help: 'Total number of disk write operations by table', labelNames: ['database', 'table']})
const pages_written_gauge = new Prometheus.Gauge({name: 'harperdb_table_pages_written_total', help: 'Total number of pages written to disk by table. This is higher than writes because sequential pages can be written in a single write operation.', labelNames: ['database', 'table']})
const time_during_txns_gauge = new Prometheus.Gauge({name: 'harperdb_table_time_during_txns_total', help: 'Total time from when transaction was started (lock acquired) until finished and all writes have been made (but not necessarily flushed/synced to disk) by table', labelNames: ['database', 'table']})
const time_start_txns_gauge = new Prometheus.Gauge({name: 'harperdb_table_time_start_txns_total', help: 'Total time spent waiting for transaction lock acquisition by table', labelNames: ['database', 'table']})
const time_page_flushes_gauge = new Prometheus.Gauge({name: 'harperdb_table_time_page_flushes_total', help: 'Total time spent on write calls by table', labelNames: ['database', 'table']})
const time_sync_gauge = new Prometheus.Gauge({name: 'harperdb_table_time_sync_total', help: 'Total time spent waiting for writes to sync/flush to disk by table', labelNames: ['database', 'table']})

const thread_count_gauge = new Prometheus.Gauge({name: 'harperdb_process_threads_count', help: 'Number of threads in the HarperDB core process'})
const harperdb_cpu_percentage_gauge =  new Prometheus.Gauge({name: 'harperdb_process_cpu_utilization', help: 'CPU utilization of a HarperDB process', labelNames: ['process_name']});

const connections_gauge = new Prometheus.Gauge({name: 'connection', help: 'Number of successful connection attempts by protocol', labelNames: ['protocol', 'type', 'action']});
const open_connections_gauge = new Prometheus.Gauge({name: 'open_connections', help: 'Average number of connections across all threads', labelNames: ['protocol']});
const bytes_sent_gauge = new Prometheus.Gauge({name: 'bytes_sent', help: 'Bytes sent by protocol', labelNames: ['protocol', 'action']});
const bytes_received_gauge = new Prometheus.Gauge({name: 'bytes_received', help: 'Bytes received by protocol', labelNames: ['protocol', 'action']});
const cache_hits_gauge = new Prometheus.Gauge({name: 'cache_hit', help: 'Number of cache hits by table', labelNames: ['table']});
const cache_miss_gauge = new Prometheus.Gauge({name: 'cache_miss', help: 'Number of cache misses by table', labelNames: ['table']});
const success_gauge = new Prometheus.Gauge({name: 'success', help: 'Number of success requests by endpoint', labelNames: ['path', 'type', 'method', 'label']});

const filesystem_size_bytes = new Prometheus.Gauge({name: 'filesystem_size_bytes', help: 'Filesystem size in bytes.', labelNames: ['device', 'fstype', 'mountpoint']})
const filesystem_avail_bytes = new Prometheus.Gauge({name: 'filesystem_free_bytes', help: 'Filesystem free space in bytes.', labelNames: ['device', 'fstype', 'mountpoint']})
const filesystem_used_bytes = new Prometheus.Gauge({name: 'filesystem_used_bytes', help: 'Filesystem space used in bytes.', labelNames: ['device', 'fstype', 'mountpoint']})

// eslint-disable-next-line no-unused-vars,require-await
module.exports = async (server, { hdbCore, logger }) => {

	server.route({
		url: '/metrics',
		method: 'GET',
		handler: async (request, reply) => {
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
			bytes_sent_gauge.reset();
			cache_hits_gauge.reset();
			cache_miss_gauge.reset();
			bytes_received_gauge.reset();
			success_gauge.reset();

			filesystem_size_bytes.reset();
			filesystem_avail_bytes.reset();
			filesystem_used_bytes.reset();

			request.body = {
				operation: 'system_information',
				attributes: ['database_metrics', 'harperdb_processes', 'threads', 'disk']
			};

			let system_info = await hdbCore.requestWithoutAuthentication(request);

			thread_count_gauge.set(system_info.threads.length);

			if(system_info.harperdb_processes.core.length > 0){
				harperdb_cpu_percentage_gauge.set({process_name: 'harperdb_core'}, system_info.harperdb_processes.core[0].cpu);
			}

			system_info.disk.size.forEach(device => {
				filesystem_size_bytes.set({device: device.fs, fstype: device.type, mountpoint: device.mount}, device.size);
				filesystem_avail_bytes.set({device: device.fs, fstype: device.type, mountpoint: device.mount}, device.available);
				filesystem_used_bytes.set({device: device.fs, fstype: device.type, mountpoint: device.mount}, device.use);
			});

			system_info.harperdb_processes.clustering.forEach(process_data=>{
				if(process_data.params.endsWith('hub.json')){
					harperdb_cpu_percentage_gauge.set({process_name: 'harperdb_clustering_hub'}, process_data.cpu);
				} else if(process_data.params.endsWith('leaf.json')){
					harperdb_cpu_percentage_gauge.set({process_name: 'harperdb_clustering_leaf'}, process_data.cpu);
				}
			});

			for (const [database_name, table_object] of Object.entries(system_info.metrics)) {
				for (const [table_name, table_metrics] of Object.entries(table_object)) {
					const labels = { database: database_name, table: table_name };

					puts_gauge.set(labels, table_metrics.puts);
					deletes_gauge.set(labels, table_metrics.deletes);
					txns_gauge.set(labels, table_metrics.txns);
					page_flushes_gauge.set(labels, table_metrics.pageFlushes);
					writes_gauge.set(labels, table_metrics.writes);
					pages_written_gauge.set(labels, table_metrics.pagesWritten);
					time_during_txns_gauge.set(labels, table_metrics.timeDuringTxns);
					time_start_txns_gauge.set(labels, table_metrics.timeStartTxns);
					time_page_flushes_gauge.set(labels, table_metrics.timePageFlushes);
					time_sync_gauge.set(labels, table_metrics.timeSync);
				}
			}

			let prom_results = await Prometheus.register.metrics();
			let output = await generateMetricsFromAnalytics();
			reply.type(Prometheus.register.contentType)

			if(output.length > 0) {
				return output.join('\n') + '\n' + prom_results
			} else {
				return prom_results;
			}
		}
	});
};

async function generateMetricsFromAnalytics() {
	const end_at = Date.now();
	const start_at = end_at - (AGGREGATE_PERIOD_MS * 1.5);
	let results = await hdb_analytics.search({conditions: [
			{ attribute: 'id', value: [start_at, end_at], comparator: 'between' }
		]});

	let output = [];

	for await (const metric of results) {
		switch (metric.metric) {
			case 'connection':
				connections_gauge.set({ protocol: metric.path, action: metric.method,  type: 'total'}, metric.total);
				connections_gauge.set({ protocol: metric.path, action: metric.method, type: 'success' }, metric.count);
				break;
			case 'mqtt-connections':
				open_connections_gauge.set({ protocol: 'mqtt'}, metric.count);
				break;
			case 'bytes-sent':
				bytes_sent_gauge.set({ protocol: metric.type, action: metric.method}, metric.count);
				break;
			case 'bytes-received':
				bytes_received_gauge.set({ protocol: metric.type, action: metric.method}, metric.count);
				break;
			case 'TTFB':
			case 'duration':
				output.push(`# HELP ${metric.metric} Time for HarperDB to execute request in ms`);
				output.push(`# TYPE ${metric.metric} summary`);
				output.push(`${metric.metric}{quantile="0.01",type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.p1}`);
				output.push(`${metric.metric}{quantile="0.1",type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.p10}`);
				output.push(`${metric.metric}{quantile="0.25",type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.p25}`);
				output.push(`${metric.metric}{quantile="0.5",type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.median}`);
				output.push(`${metric.metric}{quantile="0.75",type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.p75}`);
				output.push(`${metric.metric}{quantile="0.9",type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.p90}`);
				output.push(`${metric.metric}{quantile="0.95",type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.p95}`);
				output.push(`${metric.metric}{quantile="0.99",type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.p99}`);
				output.push(`${metric.metric}_sum{type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.mean * metric.count}`);
				output.push(`${metric.metric}_count{type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.count}`);
				//needs to be a new line after every metric
				output.push('');
				break;
			case 'cache-resolution':
				//prometheus doesn't like hyphens in metric names
				let metric_name = 'cache_resolution';
				output.push(`# HELP ${metric_name} Time to resolve a cache miss`);
				output.push(`# TYPE ${metric_name} summary`);
				output.push(`${metric_name}{quantile="0.01",table="${metric.path}"} ${metric.p1}`);
				output.push(`${metric_name}{quantile="0.1",table="${metric.path}"} ${metric.p10}`);
				output.push(`${metric_name}{quantile="0.25",table="${metric.path}"} ${metric.p25}`);
				output.push(`${metric_name}{quantile="0.5",table="${metric.path}"} ${metric.median}`);
				output.push(`${metric_name}{quantile="0.75",table="${metric.path}"} ${metric.p75}`);
				output.push(`${metric_name}{quantile="0.9",table="${metric.path}"} ${metric.p90}`);
				output.push(`${metric_name}{quantile="0.95",table="${metric.path}"} ${metric.p95}`);
				output.push(`${metric_name}{quantile="0.99",table="${metric.path}"} ${metric.p99}`);
				output.push(`${metric_name}_sum{table="${metric.path}"} ${metric.mean * metric.count}`);
				output.push(`${metric_name}_count{table="${metric.path}"} ${metric.count}`);
				//needs to be a new line after every metric
				output.push('');
				break;
			case 'cache-hit':
				cache_hits_gauge.set({table: metric.path}, metric.total);
				cache_miss_gauge.set({table: metric.path}, metric.count - metric.total);
				break;
			case 'success':
				success_gauge.set({ path: metric.path, method: metric.method, type: metric.type, label: 'total'}, metric.total);
				success_gauge.set({ path: metric.path, method: metric.method, type: metric.type, label: 'success' }, metric.count);
				break;
			case 'transfer':
				output.push(`# HELP ${metric.metric} Time to transfer request (ms)`);
				output.push(`# TYPE ${metric.metric} summary`);
				output.push(`${metric.metric}{quantile="0.01",type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.p1}`);
				output.push(`${metric.metric}{quantile="0.1",type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.p10}`);
				output.push(`${metric.metric}{quantile="0.25",type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.p25}`);
				output.push(`${metric.metric}{quantile="0.5",type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.median}`);
				output.push(`${metric.metric}{quantile="0.75",type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.p75}`);
				output.push(`${metric.metric}{quantile="0.9",type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.p90}`);
				output.push(`${metric.metric}{quantile="0.95",type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.p95}`);
				output.push(`${metric.metric}{quantile="0.99",type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.p99}`);
				output.push(`${metric.metric}_sum{type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.mean * metric.count}`);
				output.push(`${metric.metric}_count{type="${metric.type}",path="${metric.path}",method="${metric.method}"} ${metric.count}`);
				//needs to be a new line after every metric
				output.push('');
				break;
			default:
				//console.log(metric);
				break;
		}
	}
	return output;
}
