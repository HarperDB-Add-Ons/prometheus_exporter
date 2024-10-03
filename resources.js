import { fsSize } from 'systeminformation';
import { createRequire } from 'module';
import Prometheus from 'prom-client';

const require = createRequire(import.meta.url);
const { hdb_analytics } = databases.system;
const { analytics } = server.config;
const { PrometheusExporterSettings } = tables;
const gaugeData = require('./gauges.json');
const AGGREGATE_PERIOD_MS = (analytics?.aggregatePeriod || 600) * 1000;
const QUANTILE_LEVELS = [.01, .1, .25, .5, .75, .9, .95, .99];
const gauges = [];

const init = async () => {
	console.log('Starting Prometheus exporter');
	await Prometheus.collectDefaultMetrics();
	await Prometheus.register.setContentType(Prometheus.Registry.OPENMETRICS_CONTENT_TYPE);
	contentTypes.set('application/openmetrics-text', {
		serialize(data) {
			data.toString();
		},
		q: 1
	});

	// Create a settings.json file if one does not exist
	if (server?.workerIndex === 0 &&
		PrometheusExporterSettings?.getRecordCount({ exactCount: false })?.recordCount === 0) {
		await PrometheusExporterSettings.put({ name: 'forceAuthorization', value: true });
		await PrometheusExporterSettings.put({ name: 'allowedUsers', value: [] });
		await PrometheusExporterSettings.put({ name: 'customMetrics', value: [] });
	}

	gaugeData.forEach(gauge => gauges.push(new Prometheus.Gauge(gauge)));
};

class metrics extends Resource {

	async allowRead(user) {
		const forceAuthorization = await PrometheusExporterSettings?.get('forceAuthorization')?.value;
		if (forceAuthorization !== true) return true;
		const allowedUsers = await PrometheusExporterSettings?.get('allowedUsers')?.value;
		if (allowedUsers.length > 0) return allowedUsers.some(allow_user => allow_user === user?.username);
		return user?.role?.role === 'super_user';
	}

	async get() {
		if (gauges.length === 0) await init();
		gauges.forEach(gauge => gauge.reset());
		const systemInfo = await getAnalytics('system_information',
			['database_metrics', 'harperdb_processes', 'replication', 'threads']);

		// Set value for harperdb_process_threads_count gauge
		setGauge('harperdb_process_threads_count', {}, systemInfo?.threads?.length);

		// Set value for harperdb_process_cpu_utilization gauge
		if (systemInfo?.harperdb_processes?.core?.length > 0) {
			setGauge('harperdb_process_cpu_utilization', { process_name: 'harperdb_core' },
				systemInfo?.harperdb_processes?.core[0]?.cpu);
		}

		// Set values for filesystem gauges
		const sizes = await fsSize();
		sizes?.forEach(device => {
			Object.entries({
					filesystem_size_bytes: device.size,
					filesystem_free_bytes: device.available,
					filesystem_used_bytes: device.use
				}
			).forEach(([metric, mountpoint]) => {
				setGauge(metric, { device: device.fs, fstype: device.type, mountpoint });
			});
		});

		// Set values for database table gauges
		Object.entries(systemInfo?.metrics).forEach((database, tableObject) => {
			Object.entries(tableObject).forEach(([table, metrics]) => {
				Object.entries({
					database_table_puts_total: 'puts',
					database_table_deletes_total: 'deletes',
					database_table_txns_total: 'txns',
					database_table_page_flushes_total: 'pageFlushes',
					database_table_writes_total: 'writes',
					database_table_pages_written_total: 'pagesWritten',
					database_table_time_during_txns_seconds: 'timeDuringTxns',
					database_table_time_start_txns_seconds: 'timeStartTxns',
					database_table_time_page_flushes_seconds: 'timePageFlushes',
					database_table_time_sync_seconds: 'timeSync'
				}).forEach((name, value) => {
					setGauge(name, { database, table }, metrics[value]);
				});
			});
		});

		// Set values for clustering gauges
		systemInfo.harperdb_processes?.clustering?.forEach(data => {
			if (data?.params?.endsWith('.json')) {
				setGauge('harperdb_process_cpu_utilization', { process_name: 'harperdb_clustering_hub' }, data.cpu);
			}
			if (data?.params?.endsWith('hub.json')) {
				setGauge('harperdb_process_cpu_utilization', { process_name: 'harperdb_clustering_hub' }, data.cpu);
			} else if (data?.params?.endsWith('leaf.json')) {
				gaugeSet('harperdb_process_cpu_utilization', { process_name: 'harperdb_clustering_leaf' }, data.cpu);
			}
		});

		//    system_info.replication?.forEach(repl_item => {
		//      repl_item.consumers?.forEach(consumer => {
		//        const { database, table } = repl_item;
		//        gaugeSet(replication_backlog_gauge, { origin: consumer.name, database, table }, consumer.num_pending || 0);
		//      });
		//    });
		//
		//    // Cluster metrics
		//    const cluster_info = await hdb_analytics.operation({
		//      operation: 'cluster_network',
		//      attributes: ['response_time']
		//    });
		//
		//    if (cluster_info) {
		//      // Set cluster_ping_gauge for each node in the cluster
		//      cluster_info.nodes?.forEach(node => {
		//        gaugeSet(cluster_ping_gauge, { node: node?.name }, node?.response_time);
		//      });
		//    }

		const output = await generateMetricsFromAnalytics();
		const promMetrics = await Prometheus.register?.metrics();
		if (output.length > 0) return `${output.join('\n')}\n${promMetrics}`;
		return promMetrics;
	}
}

const generateMetricsFromAnalytics = async () => {
	const end = Date.now();
	const start = end - (AGGREGATE_PERIOD_MS * 1.5);
	const metrics = await hdb_analytics.search({
		conditions: [
			{ attribute: 'id', value: [start, end], comparator: 'between' }
		]
	});

	const output = [];
	for await (const metric of metrics) {
		const protocol = metric?.type, action = metric?.method, topic = metric?.path;
		const defaultLabels = { protocol, action, topic };
		const { method, path, type } = metric;
		switch (metric?.metric) {
			case 'connection':
				Object.entries({ total: metric.count, success: metric.total, failed: metric.count - metric.total })
				.forEach(([type, value]) => setGauge('connection', { ...defaultLabels, type }, value));
				break;
			case 'mqtt-connections':
				setGauge('open_connections', { protocol: 'mqtt' }, metric.connections);
				break;
			case 'acl-fail':
				setGauge('acl_fail', { topic }, metric.total);
				break;
			case 'connections':
				setGauge('open_connections', { protocol }, metric.connections);
				break;
			case 'bytes-sent':
				setGauge('bytes_sent', defaultLabels, metric.count * metric.mean);
				setGauge('messages_sent', defaultLabels, metric.count);
				break;
			case 'bytes-received':
				setGauge('bytes_received', defaultLabels, metric.count * metric.mean);
				setGauge('messages_received', defaultLabels, metric.count);
				break;
			case 'TTFB':
			case 'duration':
				output.push(createQuantileMetrics('Time for HarperDB to execute request in ms', metric,
					{ type, path, method }));
				break;
			case 'cache-resolution':
				output.push(createQuantileMetrics('Time to resolve a cache miss', metric, { table: path }));
				break;
			case 'cache-hit':
				gaugeSet(cache_hits_gauge, { table: path }, metric.total);
				gaugeSet(cache_miss_gauge, { table: path }, metric.count - metric.total);
				break;
			case 'success':
				gaugeSet(success_gauge, { path, method, type, label: 'total' }, metric.total);
				gaugeSet(success_gauge, { path, method, type, label: 'success' }, metric.count);
				break;
			case 'transfer':
				output.push(createQuantileMetrics('Time to transfer request (ms)', metric,
					{ type, path, method }));
				break;
			case 'replication-latency':
				// Split by '.' on the path value from the metric to get origin, database and table
				const [origin, database, table] = path?.split('.');
				output.push(createQuantileMetrics('Replication latency', metric, { origin, database, table }));
				break;
			default:
				const customMetrics = await PrometheusExporterSettings.get('customMetrics').value;
				await outputCustomMetrics(customMetrics, metric, output);
				break;
		}
	}
	return output;
};

const createQuantileMetrics = ((help, metric, props) => {
	// Prometheus doesn't like hyphens in metric names
	const name = metric.metric?.replaceAll('-', '_');
	// HELP and TYPE are the first two items for all metrics
	const output = [`# HELP ${name} ${help}`, `# TYPE ${metric.metric} summary`];
	// Create string like type="type",path="path",method="method" based on props object
	const propsString = Object.entries(props)?.map(([key, value]) => `${key}="${value}"`).join(',');

	// Push a string to output array for each of the quantiles
	// TODO: Quantile level 50 is actually called "median" -- is it also available as "p50"?
	QUANTILE_LEVELS.forEach(quantile => {
		output.push(`${name}{quantile="${quantile.toFixed(2)}",${propsString} ${metric['p' + (quantile * 100)] || 0}`);
	});

	// Add sum and count
	output.push(`${name}_sum{${propsString}} ${(metric.mean || 0) * (metric.count || 0)}`);
	output.push(`${name}_count{${propsString}} ${metric.count || 0}`);
	return output;
});

// Get gauge by name
const getGauge = name => gauges.find(gauge => gauge.name === name);

// Call set() function on any gauge object with a default value of 0
const setGauge = (gaugeName, options, value) => getGauge(gaugeName)?.set(options, value || 0);

// Get analytics data from hdb_analytics
const getAnalytics = async (operation, attributes) => await hdb_analytics.operation({ operation, attributes });

export const prometheus_exporter = { metrics };
