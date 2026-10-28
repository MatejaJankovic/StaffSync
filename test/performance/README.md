# Performance test (TC_PERF_001)

[staffsync.jmx](staffsync.jmx) is a JMeter 5.6 plan for [TC_PERF_001](../../docs/TEST_CASES.md#6-performance). Each virtual user logs in as Ana once, finds one of her projects and an open staffing request, then calls `GET /api/projects` and `GET /api/requests/{id}/candidates` in a loop. Every response must be 200.

## Run

Start the full stack first (`docker compose up --build` in the repo root). The plan only reads data, so the database state doesn't matter.

Then, in `test/performance/`, run one step per command, in non-GUI mode. The steps are 100, 1,000 and 10,000 users:

```bash
jmeter -n -t staffsync.jmx -Jusers=100 -Jrampup=30 -Jloops=5 -l results/users-100/results.jtl -e -o results/users-100/report
```

Change `users`, `rampup` and the folder for the next step. Stop at the step where the error rate climbs.

| Property | Default | Meaning |
|---|---|---|
| `users` | 10 | Virtual users |
| `rampup` | 10 | Seconds until all users have started |
| `loops` | 5 | Times each user repeats the two GET calls |
| `host`, `port` | `localhost`, `8080` | The backend |

For 10,000 users, give JMeter more memory and smaller thread stacks first, e.g. in PowerShell: `$env:HEAP = "-Xms1g -Xmx4g -Xss256k"`.

Open `results/users-<n>/report/index.html` for the report: response times (average, 90th / 95th / 99th percentile), throughput and errors per request. The `results/` folder isn't committed.

JMeter and the whole stack share one laptop, so at the highest step the numbers show the machine's limit as much as the app's.
