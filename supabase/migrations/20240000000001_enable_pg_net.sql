-- Enable the pg_net extension for making HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Enable the pg_cron extension for scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage to postgres
GRANT USAGE ON SCHEMA net TO postgres;
GRANT USAGE ON SCHEMA cron TO postgres; 
