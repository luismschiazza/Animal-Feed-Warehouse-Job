#!/bin/sh
set -eu
# Do not silently ignore the official image's root/initdb convention.
if [ "$(id -u)" = 0 ]; then
  echo 'Local Mongo runtime requires a non-root user and pre-owned disposable storage.' >&2
  exit 1
fi
if [ -n "${MONGO_INITDB_ROOT_USERNAME:-}${MONGO_INITDB_ROOT_PASSWORD:-}${MONGO_INITDB_ROOT_USERNAME_FILE:-}${MONGO_INITDB_ROOT_PASSWORD_FILE:-}${MONGO_INITDB_DATABASE:-}" ]; then
  echo 'Automatic Mongo initialization is disabled; use explicit operator provisioning.' >&2
  exit 1
fi
if [ -d /docker-entrypoint-initdb.d ] && [ -n "$(ls -A /docker-entrypoint-initdb.d)" ]; then
  echo 'Automatic Mongo initdb scripts are disabled.' >&2
  exit 1
fi
if [ "${1:-}" = mongod ]; then shift; fi
exec mongod "$@"
