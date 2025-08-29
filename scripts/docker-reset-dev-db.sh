#!/bin/bash
set -e

echo "DBコンテナを停止中..."
docker-compose -f docker-compose.dev.yml down

echo "DBボリュームを削除中..."
docker volume rm $(docker volume ls -q | grep db-data || true)
docker volume rm $(docker volume ls -q | grep redis-data || true)

echo "DBコンテナを再起動..."
docker-compose -f docker-compose.dev.yml up -d db redis
