
const {hdb_analytics} = databases.system;
const { analytics } = server.config;
const AGGREGATE_PERIOD_MS = analytics?.aggregatePeriod ? analytics?.aggregatePeriod * 1000 : 600000;



export class metrics extends  Resource {
	async get() {
		const end_at = Date.now();
		const start_at = end_at - (AGGREGATE_PERIOD_MS * 1.5);
		this.resetGauges();

		let results = await hdb_analytics.search({conditions: [
			{ attribute: 'id', value: [start_at, end_at], comparator: 'between' }
		]});




	}

	resetGauges() {
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
	}
}