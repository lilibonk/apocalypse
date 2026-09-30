#!/bin/sh
set -eu
# Read the host's 0600 file before the official entrypoint drops to postgres.
# Keep its value out of Docker configuration and command-line arguments.
APOCALYPSE_DB_PASSWORD="$(cat /run/secrets/db_password)"
export APOCALYPSE_DB_PASSWORD
exec /usr/local/bin/docker-entrypoint.sh "$@"
