#!/bin/bash

# Ensure the project's dev and test databases exist in the shared PostgreSQL container
CONTAINER_NAME="sage-shared-dev-postgres"

for DATABASE_NAME in game_hub_dev game_hub_test; do
    docker exec $CONTAINER_NAME psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname = '$DATABASE_NAME'" | grep -q 1 || {
        echo "🏗️  Creating database '$DATABASE_NAME'..."
        docker exec $CONTAINER_NAME createdb -U postgres $DATABASE_NAME
    }
    echo "✓ Database '$DATABASE_NAME' is ready"
done
