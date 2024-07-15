import {fsSize} from 'systeminformation'
const {hdb_analytics} = databases.system;
const { analytics } = server.config;
import fs from 'fs';
import {join, basename} from 'path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));

import { createRequire } from "module";
const require = createRequire(import.meta.url);

const { PrometheusExporterSettings } = tables;
let SETTINGS;

const AGGREGATE_PERIOD_MS = analytics?.aggregatePeriod ? analytics?.aggregatePeriod * 1000 : 600000;

const SETTINGS_PATH = join(__dirname, 'settings.json');

import Prometheus from 'prom-client';
Prometheus.collectDefaultMetrics();
Prometheus.register.setContentType(
    Prometheus.Registry.OPENMETRICS_CONTENT_TYPE,
);
contentTypes.set('application/openmetrics-text', {
  serialize(data){
    return data.toString();
  },
  q: 1,
});

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
const acl_fail_gauge = new Prometheus.Gauge({name: 'acl_fail', help: 'Number of failed ACL usages', labelNames: ['topic']});
const bytes_sent_gauge = new Prometheus.Gauge({name: 'bytes_sent', help: 'Bytes sent by protocol', labelNames: ['protocol', 'action', 'topic']});
const messages_sent_gauge = new Prometheus.Gauge({name: 'messages_sent', help: 'Messages sent by protocol', labelNames: ['protocol', 'action', 'topic']});
const bytes_received_gauge = new Prometheus.Gauge({name: 'bytes_received', help: 'Bytes received by protocol', labelNames: ['protocol', 'action', 'topic']});
const messages_received_gauge = new Prometheus.Gauge({name: 'messages_received', help: 'Messages received by protocol', labelNames: ['protocol', 'action', 'topic']});
const cache_hits_gauge = new Prometheus.Gauge({name: 'cache_hit', help: 'Number of cache hits by table', labelNames: ['table']});
const cache_miss_gauge = new Prometheus.Gauge({name: 'cache_miss', help: 'Number of cache misses by table', labelNames: ['table']});
const success_gauge = new Prometheus.Gauge({name: 'success', help: 'Number of success requests by endpoint', labelNames: ['path', 'type', 'method', 'label']});

const filesystem_size_bytes = new Prometheus.Gauge({name: 'filesystem_size_bytes', help: 'Filesystem size in bytes.', labelNames: ['device', 'fstype', 'mountpoint']})
const filesystem_avail_bytes = new Prometheus.Gauge({name: 'filesystem_free_bytes', help: 'Filesystem free space in bytes.', labelNames: ['device', 'fstype', 'mountpoint']})
const filesystem_used_bytes = new Prometheus.Gauge({name: 'filesystem_used_bytes', help: 'Filesystem space used in bytes.', labelNames: ['device', 'fstype', 'mountpoint']})



class Settings {
  constructor() {
    this.forceAuthorization = true;
    this.allowedUsers = [];
    this.customMetrics = []
  }
}

class CustomMetricSetting {
  constructor() {
    this.name = "";
    this.helpText = "";
  }
}

//logic to create a settings.json file if one does not exist
if (server.workerIndex == 0) {
  (async () => {

    if (PrometheusExporterSettings.getRecordCount({ exactCount: false }).recordCount === 0) {
      PrometheusExporterSettings.put({name: "forceAuthorization", value: "false"})
      PrometheusExporterSettings.put({name: "allowedUsers", value: []})
      PrometheusExporterSettings.put({name: "customMetrics", value: []})
    }
  })();
}
class metrics extends Resource {
  async allowRead(user) {
    forceAuthorization = (await PrometheusExporterSettings.get('forceAuthorization')).value

    if(forceAuthorization !== true) {
      return true;
    }

    allowedUsers = (await PrometheusExporterSettings.get('allowedUsers')).value
    if(allowedUsers.length > 0) {
      return allowedUsers.some(allow_user=>{
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

    filesystem_size_bytes.reset();
    filesystem_avail_bytes.reset();
    filesystem_used_bytes.reset();

    let operation = {
      operation: 'system_information',
      attributes: ['database_metrics', 'harperdb_processes', 'threads']
    };

    let system_info = await hdb_analytics.operation(operation);

    thread_count_gauge.set(system_info.threads.length);

    if(system_info.harperdb_processes.core.length > 0){
      harperdb_cpu_percentage_gauge.set({process_name: 'harperdb_core'}, system_info.harperdb_processes.core[0].cpu);
    }
    let sizes = await fsSize();

    sizes.forEach(device => {
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

        puts_gauge.set(labels, table_metrics.puts ?? 0);
        deletes_gauge.set(labels, table_metrics.deletes ?? 0);
        txns_gauge.set(labels, table_metrics.txns ?? 0);
        page_flushes_gauge.set(labels, table_metrics.pageFlushes ?? 0);
        writes_gauge.set(labels, table_metrics.writes ?? 0);
        pages_written_gauge.set(labels, table_metrics.pagesWritten ?? 0);
        time_during_txns_gauge.set(labels, table_metrics.timeDuringTxns ?? 0);
        time_start_txns_gauge.set(labels, table_metrics.timeStartTxns ?? 0);
        time_page_flushes_gauge.set(labels, table_metrics.timePageFlushes ?? 0);
        time_sync_gauge.set(labels, table_metrics.timeSync ?? 0);
      }
    }


    let output = await generateMetricsFromAnalytics();
    let prom_results = await Prometheus.register.metrics();

    if(output.length > 0) {
      return output.join('\n') + '\n' + prom_results
    } else {
      return prom_results;
    }
  }
}

function getSettings() {
  if(SETTINGS === undefined) {
    SETTINGS = require(SETTINGS_PATH);
  }

  return SETTINGS;
}

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
        connections_gauge.set({ protocol: metric.path, action: metric.method,  type: 'total'}, metric.count);
        connections_gauge.set({ protocol: metric.path, action: metric.method, type: 'success' }, metric.total);
        connections_gauge.set({ protocol: metric.path, action: metric.method, type: 'failed' }, metric.count - metric.total);
        break;
      case 'mqtt-connections':
        open_connections_gauge.set({ protocol: 'mqtt'}, metric.connections);
        break;
      case 'acl-fail':
        acl_fail_gauge.set({ topic: metric.path }, metric.total);
        break;
      case 'connections':
        open_connections_gauge.set({ protocol: 'ws'}, metric.connections);
        break;
      case 'bytes-sent':
        bytes_sent_gauge.set({ protocol: metric.type, action: metric.method, topic: metric.path}, metric.count * metric.mean);
        messages_sent_gauge.set({ protocol: metric.type, action: metric.method, topic: metric.path}, metric.count);
        break;
      case 'bytes-received':
        bytes_received_gauge.set({ protocol: metric.type, action: metric.method, topic: metric.path}, metric.count * metric.mean);
        messages_received_gauge.set({ protocol: metric.type, action: metric.method, topic: metric.path}, metric.count);
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
        output.push(`${metric_name}{quantile="0.01",table="${metric.path}"} ${metric.p1}`);
        output.push(`${metric_name}{quantile="0.10",table="${metric.path}"} ${metric.p10}`);
        output.push(`${metric_name}{quantile="0.25",table="${metric.path}"} ${metric.p25}`);
        output.push(`${metric_name}{quantile="0.50",table="${metric.path}"} ${metric.median}`);
        output.push(`${metric_name}{quantile="0.75",table="${metric.path}"} ${metric.p75}`);
        output.push(`${metric_name}{quantile="0.90",table="${metric.path}"} ${metric.p90}`);
        output.push(`${metric_name}{quantile="0.95",table="${metric.path}"} ${metric.p95}`);
        output.push(`${metric_name}{quantile="0.99",table="${metric.path}"} ${metric.p99}`);
        output.push(`${metric_name}_sum{table="${metric.path}"} ${metric.mean * metric.count}`);
        output.push(`${metric_name}_count{table="${metric.path}"} ${metric.count}`);
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
      default:
        //outputCustomMetrics(metric, output);
        break;
    }
  }
  return output;
}

function outputCustomMetrics(metric, output) {
  getSettings().customMetrics.forEach(custom_metric=>{
    if(metric.name === custom_metric.name) {
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
    }
  })
}

class settings extends Resource {

  allowRead(user) {
    return user?.role?.role === 'super_user';
  }
  allowCreate(user) {
    return user?.role?.role === 'super_user';
  }

  async get() {
    return getSettings();
  }
  async post(data) {
    await fs.promises.writeFile(SETTINGS_PATH, JSON.stringify(data));
  }
}

export const prometheus_exporter = {
  metrics,
  settings,
  pes
}