-- Watch development seed: 7 days of error + vital rollups (global + per-route),
-- network failure rollups, navigation timing rollups, and varied issues.
-- Uses the first project and environment found in the DB.
-- Safe to re-run: ON CONFLICT DO UPDATE replaces existing rows.

DO $$
DECLARE
  proj_id   uuid;
  env_id    uuid;
  h         timestamptz;
  off       int;
  i         int;
  n         int;
  v         float;
  s_sum     float;
  samp_arr  float[];
  err_c     bigint;
  sess_c    bigint;

  routes    text[] := ARRAY['', '/products', '/checkout', '/orders/:id', '/settings', '/reports', '/dashboard'];
  r         text;
  base_mult float;
BEGIN
  SELECT id INTO proj_id FROM projects ORDER BY created_at LIMIT 1;
  SELECT id INTO env_id  FROM environments
    WHERE project_id = proj_id ORDER BY created_at LIMIT 1;

  IF proj_id IS NULL THEN
    RAISE EXCEPTION 'No project found — run initial setup or mint-dsn.mjs first.';
  END IF;

  -- ── Error rollups: hourly for the past 7 days, per route ─────────────────
  FOREACH r IN ARRAY routes LOOP
    -- Each route gets its own error rate multiplier for realistic variation
    base_mult := CASE r
      WHEN ''            THEN 1.0   -- global aggregate
      WHEN '/products'   THEN 0.55
      WHEN '/checkout'   THEN 0.30
      WHEN '/orders/:id' THEN 0.60  -- intentionally degraded
      WHEN '/settings'   THEN 0.10
      WHEN '/reports'    THEN 0.20
      WHEN '/dashboard'  THEN 0.15
    END;

    FOR off IN 0..167 LOOP
      h := date_trunc('hour', now() AT TIME ZONE 'UTC')
           - ((167 - off) * interval '1 hour');

      err_c := GREATEST(1,
          (3 * base_mult
           + random() * 12 * base_mult
           + CASE WHEN EXTRACT(hour FROM h) BETWEEN 9 AND 17
                  THEN random() * 25 * base_mult ELSE 0 END
           + CASE WHEN EXTRACT(dow FROM h) IN (1,2,3,4,5)
                  THEN random() * 8 * base_mult ELSE 0 END
          )::int);

      IF r = '/orders/:id' AND random() < 0.1 THEN
        err_c := err_c + (20 + random() * 40)::int;  -- extra spikes on degraded route
      END IF;
      IF r = '' AND random() < 0.05 THEN
        err_c := err_c + (40 + random() * 60)::int;
      END IF;

      sess_c := GREATEST(err_c + 2, err_c + (5 + random() * 20)::int);

      INSERT INTO error_rollups
        (project_id, environment_id, route, release, period_start, error_count, session_count)
      VALUES
        (proj_id, env_id, r, NULL, h, err_c, sess_c)
      ON CONFLICT (project_id, environment_id, route, release, period_start) DO UPDATE
        SET error_count   = EXCLUDED.error_count,
            session_count = EXCLUDED.session_count;
    END LOOP;
  END LOOP;

  -- ── Vital rollups: hourly for the past 7 days, per route, all 5 metrics ──
  -- Per-route baselines (ms / unitless for CLS):
  --   LCP: '' ~1800  products ~1950  checkout ~2200 (needs-improvement)
  --        orders ~2600 (poor)  settings ~1400  reports ~2000  dashboard ~1700
  --   INP: '' ~160   products ~175   checkout ~190              orders ~260  ...
  --   CLS: '' ~0.06  orders ~0.13 (poor)  ...
  FOREACH r IN ARRAY routes LOOP
    FOR off IN 0..167 LOOP
      h := date_trunc('hour', now() AT TIME ZONE 'UTC')
           - ((167 - off) * interval '1 hour');
      n := 6 + (random() * 14)::int;

      -- LCP ----------------------------------------------------------------
      samp_arr := '{}'; s_sum := 0;
      FOR i IN 1..n LOOP
        v := (CASE r
               WHEN ''            THEN 1600 + random() * 600
               WHEN '/products'   THEN 1750 + random() * 600
               WHEN '/checkout'   THEN 2000 + random() * 600
               WHEN '/orders/:id' THEN 2400 + random() * 700
               WHEN '/settings'   THEN 1200 + random() * 500
               WHEN '/reports'    THEN 1800 + random() * 700
               WHEN '/dashboard'  THEN 1500 + random() * 500
             END
             + CASE WHEN EXTRACT(hour FROM h) BETWEEN 12 AND 15
                    THEN random() * 400 ELSE 0 END)
             * (0.75 + random() * 0.5);
        samp_arr := array_append(samp_arr, v); s_sum := s_sum + v;
      END LOOP;
      INSERT INTO vital_rollups
        (project_id, environment_id, route, release, period_start, metric_name,
         sample_count, sum_value, samples)
      VALUES (proj_id, env_id, r, NULL, h, 'LCP', n, s_sum, samp_arr)
      ON CONFLICT (project_id, environment_id, route, release, period_start, metric_name) DO UPDATE
        SET sample_count = EXCLUDED.sample_count, sum_value = EXCLUDED.sum_value,
            samples = EXCLUDED.samples;

      -- CLS ----------------------------------------------------------------
      samp_arr := '{}'; s_sum := 0;
      FOR i IN 1..n LOOP
        v := (CASE r
               WHEN '/orders/:id' THEN 0.11 + random() * 0.06
               WHEN '/checkout'   THEN 0.07 + random() * 0.05
               ELSE                    0.03 + random() * 0.05
             END) * (0.5 + random());
        samp_arr := array_append(samp_arr, v); s_sum := s_sum + v;
      END LOOP;
      INSERT INTO vital_rollups
        (project_id, environment_id, route, release, period_start, metric_name,
         sample_count, sum_value, samples)
      VALUES (proj_id, env_id, r, NULL, h, 'CLS', n, s_sum, samp_arr)
      ON CONFLICT (project_id, environment_id, route, release, period_start, metric_name) DO UPDATE
        SET sample_count = EXCLUDED.sample_count, sum_value = EXCLUDED.sum_value,
            samples = EXCLUDED.samples;

      -- INP ----------------------------------------------------------------
      samp_arr := '{}'; s_sum := 0;
      FOR i IN 1..n LOOP
        v := (CASE r
               WHEN '/orders/:id' THEN 220 + random() * 80
               WHEN '/checkout'   THEN 180 + random() * 60
               ELSE                    130 + random() * 70
             END) * (0.6 + random() * 0.8);
        samp_arr := array_append(samp_arr, v); s_sum := s_sum + v;
      END LOOP;
      INSERT INTO vital_rollups
        (project_id, environment_id, route, release, period_start, metric_name,
         sample_count, sum_value, samples)
      VALUES (proj_id, env_id, r, NULL, h, 'INP', n, s_sum, samp_arr)
      ON CONFLICT (project_id, environment_id, route, release, period_start, metric_name) DO UPDATE
        SET sample_count = EXCLUDED.sample_count, sum_value = EXCLUDED.sum_value,
            samples = EXCLUDED.samples;

      -- FCP ----------------------------------------------------------------
      samp_arr := '{}'; s_sum := 0;
      FOR i IN 1..n LOOP
        v := (CASE r
               WHEN '/orders/:id' THEN 1100 + random() * 600
               WHEN '/checkout'   THEN 900 + random() * 500
               ELSE                    700 + random() * 400
             END) * (0.7 + random() * 0.6);
        samp_arr := array_append(samp_arr, v); s_sum := s_sum + v;
      END LOOP;
      INSERT INTO vital_rollups
        (project_id, environment_id, route, release, period_start, metric_name,
         sample_count, sum_value, samples)
      VALUES (proj_id, env_id, r, NULL, h, 'FCP', n, s_sum, samp_arr)
      ON CONFLICT (project_id, environment_id, route, release, period_start, metric_name) DO UPDATE
        SET sample_count = EXCLUDED.sample_count, sum_value = EXCLUDED.sum_value,
            samples = EXCLUDED.samples;

      -- TTFB ---------------------------------------------------------------
      samp_arr := '{}'; s_sum := 0;
      FOR i IN 1..n LOOP
        v := (CASE r
               WHEN '/orders/:id' THEN 350 + random() * 200
               WHEN '/checkout'   THEN 220 + random() * 120
               ELSE                    160 + random() * 100
             END) * (0.6 + random() * 0.8);
        samp_arr := array_append(samp_arr, v); s_sum := s_sum + v;
      END LOOP;
      INSERT INTO vital_rollups
        (project_id, environment_id, route, release, period_start, metric_name,
         sample_count, sum_value, samples)
      VALUES (proj_id, env_id, r, NULL, h, 'TTFB', n, s_sum, samp_arr)
      ON CONFLICT (project_id, environment_id, route, release, period_start, metric_name) DO UPDATE
        SET sample_count = EXCLUDED.sample_count, sum_value = EXCLUDED.sum_value,
            samples = EXCLUDED.samples;
    END LOOP;
  END LOOP;

  -- ── Navigation rollups: 7 days hourly, 2 nav types per route ─────────────
  FOREACH r IN ARRAY routes LOOP
    FOR off IN 0..167 LOOP
      h := date_trunc('hour', now() AT TIME ZONE 'UTC')
           - ((167 - off) * interval '1 hour');

      -- Hard navigations
      INSERT INTO navigation_rollups
        (project_id, environment_id, route, nav_type, period_start,
         session_count, dns_p75, tcp_p75, tls_p75, ttfb_p75, fcp_p75, lcp_p75, dom_p75)
      VALUES (
        proj_id, env_id, r, 'hard', h,
        (4 + random() * 12)::int,
        10 + random() * 15,    -- dns
        40 + random() * 30,    -- tcp
        20 + random() * 15,    -- tls
        CASE r WHEN '/orders/:id' THEN 350 + random() * 150
               WHEN '/checkout'   THEN 220 + random() * 80
               ELSE 160 + random() * 80 END,   -- ttfb
        CASE r WHEN '/orders/:id' THEN 1100 + random() * 500
               ELSE 800 + random() * 300 END,  -- fcp
        CASE r WHEN '/orders/:id' THEN 2400 + random() * 700
               WHEN '/checkout'   THEN 2000 + random() * 600
               ELSE 1700 + random() * 500 END, -- lcp
        280 + random() * 150   -- dom
      )
      ON CONFLICT (project_id, environment_id, route, nav_type, period_start) DO UPDATE
        SET session_count = EXCLUDED.session_count,
            dns_p75 = EXCLUDED.dns_p75, tcp_p75 = EXCLUDED.tcp_p75,
            tls_p75 = EXCLUDED.tls_p75, ttfb_p75 = EXCLUDED.ttfb_p75,
            fcp_p75 = EXCLUDED.fcp_p75, lcp_p75 = EXCLUDED.lcp_p75,
            dom_p75 = EXCLUDED.dom_p75;

      -- SPA navigations (faster: no DNS/TCP/TLS; lower FCP/LCP)
      INSERT INTO navigation_rollups
        (project_id, environment_id, route, nav_type, period_start,
         session_count, dns_p75, tcp_p75, tls_p75, ttfb_p75, fcp_p75, lcp_p75, dom_p75)
      VALUES (
        proj_id, env_id, r, 'spa', h,
        (2 + random() * 6)::int,
        0,   -- no DNS for SPA
        0,   -- no TCP for SPA
        0,   -- no TLS for SPA
        80 + random() * 60,    -- ttfb (faster, no SSL handshake)
        CASE r WHEN '/orders/:id' THEN 700 + random() * 300
               ELSE 400 + random() * 200 END,  -- fcp
        CASE r WHEN '/orders/:id' THEN 1400 + random() * 500
               WHEN '/checkout'   THEN 1200 + random() * 400
               ELSE 900 + random() * 400 END,  -- lcp
        120 + random() * 80    -- dom (lighter for SPA)
      )
      ON CONFLICT (project_id, environment_id, route, nav_type, period_start) DO UPDATE
        SET session_count = EXCLUDED.session_count,
            dns_p75 = EXCLUDED.dns_p75, tcp_p75 = EXCLUDED.tcp_p75,
            tls_p75 = EXCLUDED.tls_p75, ttfb_p75 = EXCLUDED.ttfb_p75,
            fcp_p75 = EXCLUDED.fcp_p75, lcp_p75 = EXCLUDED.lcp_p75,
            dom_p75 = EXCLUDED.dom_p75;
    END LOOP;
  END LOOP;

  -- ── Network rollups: hourly for 7 days, 5 failure patterns ───────────────
  DECLARE
    url_patterns text[]   := ARRAY[
      '/api/v1/products', '/api/v1/orders', '/api/v1/payments',
      '/api/v1/inventory', '/api/v1/users/me'];
    methods      text[]   := ARRAY['GET', 'GET', 'POST', 'GET', 'GET'];
    statuses     int[]    := ARRAY[503, 404, 402, 503, 401];
    init_types   text[]   := ARRAY['fetch', 'fetch', 'fetch', 'fetch', 'xhr'];
    fail_rates   float[]  := ARRAY[0.07, 0.04, 0.12, 0.06, 0.03];
    req_base     int[]    := ARRAY[500, 300, 200, 400, 350];
    j            int;
    req_c        bigint;
    fail_c       bigint;
  BEGIN
    FOR j IN 1..5 LOOP
      FOR off IN 0..167 LOOP
        h := date_trunc('hour', now() AT TIME ZONE 'UTC')
             - ((167 - off) * interval '1 hour');

        req_c  := req_base[j] + (random() * req_base[j] * 0.4)::int;
        fail_c := GREATEST(1, (req_c * fail_rates[j] * (0.5 + random()))::int);

        INSERT INTO network_rollups
          (project_id, environment_id, url_pattern, method, status_code,
           initiator_type, period_start, request_count, failure_count, session_count, last_seen_at)
        VALUES (
          proj_id, env_id,
          url_patterns[j], methods[j], statuses[j],
          init_types[j], h, req_c, fail_c,
          GREATEST(1, (fail_c * (0.4 + random() * 0.4))::int),
          h + interval '55 minutes'
        )
        ON CONFLICT (project_id, environment_id, url_pattern, method, status_code, period_start) DO UPDATE
          SET request_count = EXCLUDED.request_count,
              failure_count = EXCLUDED.failure_count,
              session_count = EXCLUDED.session_count,
              last_seen_at  = EXCLUDED.last_seen_at;
      END LOOP;
    END LOOP;
  END;

  -- ── Issues ────────────────────────────────────────────────────────────────
  INSERT INTO issues
    (project_id, environment_id, fingerprint, title, culprit, status,
     first_seen_at, last_seen_at, event_count, user_count, created_at, updated_at)
  VALUES
    (proj_id, env_id, 'fp-seed-001',
     'TypeError: Cannot read properties of undefined (reading ''map'')',
     '/products', 'open',
     now()-'6 days'::interval, now()-'2 hours'::interval, 847, 312,
     now()-'6 days'::interval, now()-'2 hours'::interval),

    (proj_id, env_id, 'fp-seed-002',
     'ChunkLoadError: Loading chunk 42 failed',
     '/dashboard', 'open',
     now()-'5 days'::interval, now()-'30 minutes'::interval, 523, 198,
     now()-'5 days'::interval, now()-'30 minutes'::interval),

    (proj_id, env_id, 'fp-seed-003',
     'ReferenceError: analytics is not defined',
     '/checkout', 'open',
     now()-'4 days'::interval, now()-'1 hour'::interval, 312, 87,
     now()-'4 days'::interval, now()-'1 hour'::interval),

    (proj_id, env_id, 'fp-seed-004',
     'NetworkError: Failed to fetch /api/v1/products',
     '/products', 'open',
     now()-'3 days'::interval, now()-'15 minutes'::interval, 204, 156,
     now()-'3 days'::interval, now()-'15 minutes'::interval),

    (proj_id, env_id, 'fp-seed-005',
     'RangeError: Maximum call stack size exceeded',
     '/reports', 'open',
     now()-'1 day'::interval, now()-'45 minutes'::interval, 156, 72,
     now()-'1 day'::interval, now()-'45 minutes'::interval),

    (proj_id, env_id, 'fp-seed-006',
     'SyntaxError: Unexpected token < in JSON at position 0',
     '/api/cart', 'resolved',
     now()-'7 days'::interval, now()-'2 days'::interval, 89, 45,
     now()-'7 days'::interval, now()-'2 days'::interval),

    (proj_id, env_id, 'fp-seed-007',
     'UnhandledPromiseRejection: Request failed with status code 503',
     '/checkout/payment', 'resolved',
     now()-'6 days'::interval, now()-'3 days'::interval, 67, 34,
     now()-'6 days'::interval, now()-'3 days'::interval),

    (proj_id, env_id, 'fp-seed-008',
     'TypeError: Cannot set properties of null (setting ''innerHTML'')',
     '/settings', 'ignored',
     now()-'10 days'::interval, now()-'5 days'::interval, 23, 18,
     now()-'10 days'::interval, now()-'5 days'::interval)

  ON CONFLICT (project_id, environment_id, fingerprint) DO UPDATE
    SET title        = EXCLUDED.title,
        culprit      = EXCLUDED.culprit,
        status       = EXCLUDED.status,
        last_seen_at = EXCLUDED.last_seen_at,
        event_count  = EXCLUDED.event_count,
        user_count   = EXCLUDED.user_count,
        updated_at   = now();

  RAISE NOTICE 'Seed complete — project %, environment %', proj_id, env_id;
END;
$$;
