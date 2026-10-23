#!/bin/bash

# Ensure shared PostgreSQL container is running
CONTAINER_NAME="sage-shared-dev-postgres"

# Check if container exists and is running
if docker ps -q -f name=$CONTAINER_NAME | grep -q .; then
    echo "✓ Shared PostgreSQL container is already running"
    exit 0
fi

# Check if container exists but is stopped
if docker ps -a -q -f name=$CONTAINER_NAME | grep -q .; then
    echo "⚡ Starting existing PostgreSQL container..."
    docker start $CONTAINER_NAME
    echo "✓ PostgreSQL container started"
else
    echo "🚀 Creating new shared PostgreSQL container..."
    docker run -d \
        --name $CONTAINER_NAME \
        -p 5432:5432 \
        -e POSTGRES_PASSWORD=localdev123 \
        -e POSTGRES_USER=postgres \
        -v sage-shared-dev-postgres-data:/var/lib/postgresql/data \
        postgres:16
    
    echo "✓ PostgreSQL container created and started"
    echo "⏳ Waiting for PostgreSQL to be ready..."
    sleep 3
fi

# Wait for PostgreSQL to be ready
until docker exec $CONTAINER_NAME pg_isready -U postgres > /dev/null 2>&1; do
    echo "⏳ Waiting for PostgreSQL..."
    sleep 1
done

echo "✅ PostgreSQL is ready!"