#!/bin/sh

# Exit immediately if a command exits with a non-zero status
set -e

echo "Waiting for database..."
python -m app.db.wait_for_db

echo "Creating extensions, tables and seed data..."
python -m app.db.init_db

echo "Starting: $*"
exec "$@"
