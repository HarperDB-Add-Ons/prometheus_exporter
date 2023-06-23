'use strict';

import Prometheus from 'prom-client';
import got from 'got';
import Fastify from 'fastify'
const fastify = Fastify({
	logger: true
})
Prometheus.collectDefaultMetrics();

const c = new Prometheus.Counter({
	name: 'metrics_count',
	help: 'Total number of metric requests',
})

const puts_gauge = new Prometheus.Gauge({name: 'harperdb_table_puts_total', help: 'total number of puts', labelNames: ['database', 'table']})
const deletes_gauge = new Prometheus.Gauge({name: 'harperdb_table_deletes_total', help: 'total number of deletes', labelNames: ['database', 'table']})
const txns_gauge = new Prometheus.Gauge({name: 'harperdb_table_txns_total', help: 'total number of txns', labelNames: ['database', 'table']})
const page_flushes_gauge = new Prometheus.Gauge({name: 'harperdb_table_page_flushes_total', help: 'total number of page flushes', labelNames: ['database', 'table']})
const writes_gauge = new Prometheus.Gauge({name: 'harperdb_table_writes_total', help: 'total number of writes', labelNames: ['database', 'table']})
const pages_written_gauge = new Prometheus.Gauge({name: 'harperdb_table_pages_written_total', help: 'total number of pages written', labelNames: ['database', 'table']})
const time_during_txns_gauge = new Prometheus.Gauge({name: 'harperdb_table_time_during_txns_total', help: 'total time during txns', labelNames: ['database', 'table']})
const time_start_txns_gauge = new Prometheus.Gauge({name: 'harperdb_table_time_start_txns_total', help: 'total time start txns', labelNames: ['database', 'table']})
const time_page_flushes_gauge = new Prometheus.Gauge({name: 'harperdb_table_time_page_flushes_total', help: 'total time page flushes', labelNames: ['database', 'table']})
const time_sync_gauge = new Prometheus.Gauge({name: 'harperdb_table_time_sync_total', help: 'total time sync', labelNames: ['database', 'table']})

const thread_count_gauge = new Prometheus.Gauge({name: 'harperdb_process_threads_count', help: 'Number of threads in the HarperDB core process'})
const harperdb_cpu_percentage_gauge =  new Prometheus.Gauge({name: 'harperdb_process_cpu_utilization', help: 'CPU utilization of a HarperDB process', labelNames: ['process_name']});





fastify.get('/metrics', async (request, reply) => {
	let resp = await got.post('http://localhost:9925', {
		headers: {
			Authorization: 'Basic SERCX0FETUlOOjE0MDA='
		},
		json: {
			"operation":"system_information",
			"attributes": ["database_metrics", "harperdb_processes", "threads"]
		},
	}).json();

	thread_count_gauge.set(resp.threads.length);

	resp.harperdb_processes.core.forEach(process_data=>{
		harperdb_cpu_percentage_gauge.set({process_name: 'harperdb_core'}, process_data.cpu);
	});

	resp.harperdb_processes.clustering.forEach(process_data=>{
		if(process_data.params.endsWith('hub.json')){
			harperdb_cpu_percentage_gauge.set({process_name: 'harperdb_clustering_hub'}, process_data.cpu);
		} else if(process_data.params.endsWith('leaf.json')){
			harperdb_cpu_percentage_gauge.set({process_name: 'harperdb_clustering_leaf'}, process_data.cpu);
		}
	});

	for (const [database_name, table_object] of Object.entries(resp.metrics)) {
		for (const [table_name, table_metrics] of Object.entries(table_object)) {
			const labels = { database: database_name, table: table_name };
			let puts= await puts_gauge.get();

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

	c.inc();
	reply.type(Prometheus.register.contentType)

	const met =  await Prometheus.register.metrics();
	return met;
})

/**
 * Run the server!
 */
const start = async () => {
	try {
		await fastify.listen({ port: 3000 })
	} catch (err) {
		fastify.log.error(err)
		process.exit(1)
	}
}
start()