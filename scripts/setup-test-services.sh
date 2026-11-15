#!/usr/bin/env bash
# SPDX-FileCopyrightText: syuilo and misskey-project
# SPDX-License-Identifier: AGPL-3.0-only

set -euo pipefail

if [[ $(id -u) -ne 0 ]]; then
	printf 'Run this script as root.\n' >&2
	exit 1
fi

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd -- "$script_dir/.." && pwd)
config_file="$repo_root/.config/test.yml"
config_tmp=$(mktemp)
trap 'rm -f -- "$config_tmp"' EXIT
chmod 600 "$config_tmp"

if [[ ! -f $config_file ]]; then
	printf 'Missing test config: %s\n' "$config_file" >&2
	exit 1
fi

if ! command -v node >/dev/null 2>&1; then
	printf 'Node.js is required on PATH.\n' >&2
	exit 1
fi

if ! (cd "$repo_root/packages/backend" && node --input-type=module - "$config_file" >"$config_tmp" <<'NODE'
import { readFile } from 'node:fs/promises';
import { load } from 'js-yaml';

const config = load(await readFile(process.argv[2], 'utf8'));
const values = [
	config?.db?.host,
	config?.db?.port,
	config?.db?.db,
	config?.db?.user,
	config?.db?.pass,
	config?.redis?.host,
	config?.redis?.port,
	config?.redis?.username ?? '',
	config?.redis?.pass ?? '',
];

if (values.some(value => value == null || typeof value !== 'string' && typeof value !== 'number')) {
	throw new Error('Test config is missing a required database or Redis setting.');
}

for (const value of values) process.stdout.write(`${value}\0`);
NODE
); then
	printf 'Could not read database and Redis settings from %s.\n' "$config_file" >&2
	exit 1
fi

mapfile -d '' -t config_values <"$config_tmp"
if [[ ${#config_values[@]} -ne 9 ]]; then
	printf 'Unexpected test config data.\n' >&2
	exit 1
fi

db_host=${config_values[0]}
db_port=${config_values[1]}
db_name=${config_values[2]}
db_user=${config_values[3]}
db_password=${config_values[4]}
redis_host=${config_values[5]}
redis_port=${config_values[6]}
redis_user=${config_values[7]}
redis_password=${config_values[8]}

for command in service runuser psql redis-cli; do
	if ! command -v "$command" >/dev/null 2>&1; then
		printf 'Required command not found: %s\n' "$command" >&2
		exit 1
	fi
done

service postgresql start
service redis-server start

export TEST_DB_NAME="$db_name"
export TEST_DB_USER="$db_user"
export TEST_DB_PASSWORD="$db_password"
node --input-type=module <<'NODE' | runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1 -d postgres
const literal = value => `'${value.replaceAll("'", "''")}'`;
const role = literal(process.env.TEST_DB_USER);
const database = literal(process.env.TEST_DB_NAME);
const password = literal(process.env.TEST_DB_PASSWORD);

process.stdout.write(String.raw`
SET standard_conforming_strings = on;
SELECT format('CREATE ROLE %I LOGIN', ${role})
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = ${role})\gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', ${role}, ${password})\gexec
SELECT format('CREATE DATABASE %I OWNER %I', ${database}, ${role})
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = ${database})\gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', ${database}, ${role})\gexec
`);
NODE

PGPASSWORD=$db_password psql -X -w -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null

if [[ -n $redis_password ]]; then
	export REDISCLI_AUTH=$redis_password
fi
redis_args=(-h "$redis_host" -p "$redis_port")
if [[ -n $redis_user ]]; then
	redis_args+=(--user "$redis_user")
fi
redis-cli "${redis_args[@]}" PING | {
	read -r redis_response
	if [[ $redis_response != PONG ]]; then
		printf 'Redis PING returned an unexpected response.\n' >&2
		exit 1
	fi
}

printf 'PostgreSQL test database authentication and Redis PING succeeded.\n'
