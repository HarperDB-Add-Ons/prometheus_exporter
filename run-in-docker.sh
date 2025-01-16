#!/usr/bin/env bash

# Run HarperDB with this plugin installed in Docker for local dev & testing

container_name="prometheus-exporter-dev"

function cleanup {
  echo "Stopping and deleting Docker container prometheus-exporter-dev"
  docker stop $container_name >/dev/null
  docker rm $container_name >/dev/null
}

trap cleanup EXIT

docker pull harperdb/harperdb
docker rm $container_name >/dev/null || true
docker run -t -v "$(pwd)":/home/harperdb/hdb/components/prometheus_exporter \
  --name $container_name \
  -p 49925:9925 -p 49926:9926 \
  -e HDB_ADMIN_USERNAME=admin -e HDB_ADMIN_PASSWORD=foobar \
  -e LOGGING_LEVEL=debug -e HTTP_PORT=9926 \
  harperdb/harperdb &

echo
echo -n "Waiting for HarperDB to be ready..."
until curl -fs localhost:49925/health; do
  sleep 1
done
echo

curl -u admin:foobar -v localhost:49926/prometheus_exporter/PrometheusExporterSettings/forceAuthorization \
  -X PUT -L -H 'Content-Type: application/json' -d '{"value": false}'

echo
echo "HarperDB is running on port 49925 (operations API) & 49926 (REST API)"
echo "You can access Prometheus metrics at http://localhost:49926/prometheus_exporter/metrics"
echo

wait
