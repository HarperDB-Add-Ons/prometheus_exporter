'use strict';

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

			request.body = {
				operation: 'system_information',
				attributes: ['database_metrics', 'harperdb_processes', 'threads']
			};

			let system_info = await hdbCore.requestWithoutAuthentication(request);

			thread_count_gauge.set(system_info.threads.length);

			if(system_info.harperdb_processes.core.length > 0){
				harperdb_cpu_percentage_gauge.set({process_name: 'harperdb_core'}, system_info.harperdb_processes.core[0].cpu);
			}

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

			reply.type(Prometheus.register.contentType)

			return await Prometheus.register.metrics();
		}
	});
};
