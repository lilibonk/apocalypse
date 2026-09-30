#!/bin/sh
set -eu
umask 077
password="$(cat /run/secrets/redis_password)"
# prepare.mjs creates a hex secret; reject characters that could alter redis.conf.
case "$password" in ''|*[!0-9a-f]*) echo 'Invalid Redis secret format' >&2; exit 1 ;; esac
mkdir -p /run/redis-private
{
  printf '%s\n' 'bind 0.0.0.0' 'protected-mode yes' 'appendonly yes' 'appendfsync everysec' 'dir /data'
  printf 'requirepass %s\n' "$password"
} > /run/redis-private/redis.conf
unset password
chown -R redis:redis /run/redis-private
exec /usr/local/bin/docker-entrypoint.sh redis-server /run/redis-private/redis.conf
