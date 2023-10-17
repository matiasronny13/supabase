1. install deno vs code extension from denoland
2. in deno setting set:
   cache: D:\Supabase\cache
   enable Cache on Save : true 
   deno path: C:\Users\Administrator\.supabase\deno.exe
3. open cmd where the cli is stored 
4. supabase.exe init
5. supabase.exe functions new edge_rss 
6. open vs code
7. command palette > Deno:Initialize Workspace Configuration, select yes & yes
8. create debug config, and set "program" to  "${workspaceFolder}/functions/edge_rss/index.ts"


DEPLOYMENT: 
  supabase.exe functions deploy edge_rss


Scheduler:
  select
  cron.schedule(
    'edge_rss_1',
    '*/5 * * * *', -- every 5 minutes. 1-59/5
    $$
    select
      net.http_post(
          url:='https://????.supabase.co/functions/v1/edge_rss',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer <ANON_KEY>"}'::jsonb,
          body:=concat('{"ids": []}')::jsonb
      ) as request_id;
    $$
  );

UNREGISTER:
  SELECT cron.unschedule('edge_rss_1');


VIEW ALL JOBS:
  SELECT * from cron.job
  select * from cron.job_run_details order by start_time

CLEAN UP JOB:
  SELECT cron.schedule('clean_old_data', '0 */12 * * *', $$DELETE FROM "Rss_Items" WHERE created_at < now() - interval '10 days'$$);

RESET SEQUENCE:
  ALTER SEQUENCE public."Rss_id_seq" RESTART WITH 1