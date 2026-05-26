#!/usr/bin/env bash
# Run on the DEV EC2 / self-hosted runner when http://HOST:8011/health is down.
set -euo pipefail

PORT="${PORT:-8011}"
ENV="${ENV:-DEV}"
CONTAINER_NAME="seo-agent-${ENV}"
IMAGE_NAME="${IMAGE_NAME:-seo_ai_agent}"

echo "=== Containers ==="
docker ps -a | grep -E 'seo-agent|SEOAgent' || true

echo "=== Free port ${PORT} ==="
for cid in $(docker ps -q --filter "publish=${PORT}" 2>/dev/null); do
  docker rm -f "$cid"
done
docker rm -f "${CONTAINER_NAME}" "${CONTAINER_NAME}-next" SEOAgent 2>/dev/null || true

IMAGE=$(docker images --format '{{.Repository}}:{{.Tag}}' | grep -E "^${IMAGE_NAME}:${ENV}-" | head -n 1)
if [ -z "$IMAGE" ]; then
  echo "No image ${IMAGE_NAME}:${ENV}-* found. Run GitHub Actions deploy first."
  exit 1
fi

ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
  echo "Create .env in repo checkout (deploy workflow generates it) or copy from last deploy."
  exit 1
fi

echo "Starting ${IMAGE} as ${CONTAINER_NAME} on 0.0.0.0:${PORT}..."
docker run -d \
  --name "$CONTAINER_NAME" \
  -p "0.0.0.0:${PORT}:8080" \
  --env-file "$ENV_FILE" \
  -v "hiperbrains-${ENV}-data:/app/data" \
  --restart unless-stopped \
  "$IMAGE"

for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null; then
    echo "OK: http://127.0.0.1:${PORT}/health"
    exit 0
  fi
  sleep 2
done

echo "Failed — logs:"
docker logs "$CONTAINER_NAME" --tail 80
exit 1
