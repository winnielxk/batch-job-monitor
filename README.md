# BatchMonitor — Enterprise Batch Job Dashboard

A production-grade monitoring dashboard for enterprise batch processing systems. Demonstrates multi-tenant job orchestration, automated recovery, and real-time operator tooling.

## Tech Stack

- **Frontend:** React + Tailwind CSS
- **Backend:** Python Flask
- **Database:** SQLite
- **Deployment:** Vercel (frontend) + Railway (backend)

## Architecture

```
React Frontend → REST API → Flask Backend → SQLite
```

## Planned Features

- Real-time job monitoring (5s polling)
- Multi-client support (5 enterprise clients)
- Job dependency chains
- Automated retry with exponential backoff
- Job detail view with execution logs
- Manual operator retry controls
- Status + client filtering and search
- System health dashboard with charts
- CSV export
- Dark mode

## Status

🚧 In progress — backend scaffolding complete, API endpoints coming next.