#!/bin/sh
set -eu
# The password is passed only through this psql child's environment, never argv.
: "${APOCALYPSE_DB_PASSWORD:?Missing application database password}"
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=ON_ERROR_STOP=1 <<'SQL'
\getenv app_password APOCALYPSE_DB_PASSWORD
CREATE ROLE apocalypse LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'app_password';
ALTER DATABASE apocalypse OWNER TO apocalypse;
SQL
unset APOCALYPSE_DB_PASSWORD
