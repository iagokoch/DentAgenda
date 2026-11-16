#!/bin/sh
set -eu
# Executado apenas no volume novo. Senhas vêm do ambiente e não são argumentos SQL.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 <<'SQL'
\getenv senha_runtime BANCO_RUNTIME_SENHA
\getenv senha_migrations BANCO_MIGRATIONS_SENHA
SELECT format('CREATE ROLE app_demo LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', :'senha_runtime') \gexec
SELECT format('CREATE ROLE migrations_demo LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', :'senha_migrations') \gexec
ALTER DATABASE dentagenda_demo_remota OWNER TO migrations_demo;
REVOKE ALL ON DATABASE dentagenda_demo_remota FROM PUBLIC;
GRANT CONNECT ON DATABASE dentagenda_demo_remota TO app_demo;
ALTER SCHEMA public OWNER TO migrations_demo;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO app_demo;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS unaccent;
ALTER DEFAULT PRIVILEGES FOR ROLE migrations_demo IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_demo;
ALTER DEFAULT PRIVILEGES FOR ROLE migrations_demo IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_demo;
SQL
