# Oromia Polio Campaign Management System (OHB-OPCMS)

**Subtitle:** Central Command Center – nOPV2 and bOPV2 Supplementary Immunization Activities, Oromia Region.

A self-hosted public health campaign management and real-time monitoring system built for the Oromia Health Bureau (OHB).

---

## Architecture

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Recharts, Leaflet (interactive GeoJSON / Shapefile boundary choropleth).
- **Real-Time Live Sync:** Server-Sent Events (`/api/events`) broadcast every confirmed import, rollback, record correction, alert follow-up, and threshold change to all connected dashboards immediately without a browser reload.
- **Production Backend (`/backend`):** Python FastAPI, SQLAlchemy ORM, Alembic migrations, Pandas + OpenPyXL Excel/CSV parser, PostgreSQL database.
- **Interactive Preview Server (`server.ts`):** Node.js/Express + `node:sqlite` server implementing identical REST APIs, SSE stream, multi-row Excel/CSV parser, and RBAC for self-contained execution on port `3000`.

---

## Key Capabilities

1. **Command Room – Large Screen Monitoring (`/command-room`):** Dedicated 5-screen auto-rotating EOC wallboard (`1920x1080`, `1366x768`, `4K`) cycling every 15 seconds across `01. Regional Overview`, `02. Vaccination Performance`, `03. Vaccine Management`, `04. Surveillance & Security`, and `05. Reporting Compliance`, with countdown progress indicator, pause/resume/manual navigation, full-screen wallboard mode, `Africa/Addis_Ababa` live clock, and SSE + background sync.
2. **Live Command Center & Wallboard Mode:** Dedicated full-screen operational dashboard with live SSE synchronization telemetry, 10 top operational KPI cards, Leaflet coverage/alert map, daily trends, 7 operational bottom panels, and an integrated **Advanced Analytics** sub-view.
3. **Data Upload & Import Center:** Drag-and-drop `.xlsx` / `.csv` ingestion, multi-row Oromia template header parser (44 indicator columns preserved individually), blank zone carry-forward, automatic `Total` row exclusion, validation & duplicate detection, staging preview, incremental/replacement modes, original file archival, and safe administrator rollback.
4. **Central Command Dashboard:** 16 dynamically computed executive KPI cards, zone performance bar charts, daily trajectory, surveillance alert snapshot, and data quality summary.
5. **Geographic Performance:** Interactive Leaflet map supporting official GeoJSON (`.geojson`) and zipped Shapefile (`.zip`) administrative boundaries with coverage/alert legend.
6. **Daily Campaign Performance & Vaccine Utilization:** Separate nOPV2 and bOPV tracking (vials received, used, partially used, returned good/bad, broken, lost, wastage rate) plus day-to-day comparisons.
7. **AFP & AEFI Alert Center:** Strictly separates administrative tally alert counts from verified clinical case investigations with an audited follow-up workflow (Command Room Screen 4 displays non-PII aggregated alert summaries only).
8. **Reporting Completeness & Automatic Data Quality:** Tracks expected vs. submitted vs. pending locations, keeps server upload timestamps separate from source submission timestamps, and runs 10 configurable data quality diagnostics.
9. **Reports & Exports:** Generates 9 downloadable reports in `.xlsx`, `.csv`, and `.pdf`.
10. **RBAC & Audit Logs:** 6 roles (`system_admin`, `central_command`, `zone_officer`, `woreda_officer`, `viewer`, and locked-down `command_room_viewer` confined strictly to `/command-room` with admin-provisioned strong passwords and forced first-login password update) with salted password hashing and full action audit logging.

---

## Self-Hosted Ubuntu Linux Deployment (`/opt/ohb-opcms`)

- **Domain:** `https://polio.orhb.gov.et`
- **Public Access:** `http://196.188.173.157:1119/` (`/command-room`)
- **Internal Access:** `http://192.168.100.11:1119/` (`/command-room`)
- **Frontend (Nginx on port 1119 / PM2):** `127.0.0.1:1119` (with SPA `try_files $uri $uri/ /index.html;` fallback for `/command-room`)
- **Backend (Gunicorn + Uvicorn/FastAPI):** `127.0.0.1:4949`
- **Database:** PostgreSQL (`ohb_opcms`)

### 1. System Prerequisites
```bash
sudo apt update && sudo apt install -y postgresql postgresql-contrib nginx python3-venv python3-pip nodejs npm
```

### 2. Initialize PostgreSQL
```bash
# Edit password in deploy/scripts/init_db.sql first!
sudo -u postgres psql -f deploy/scripts/init_db.sql
```

### 3. Configure Environment
```bash
sudo mkdir -p /opt/ohb-opcms /var/lib/ohb-opcms/uploads
cp .env.example .env
# Edit .env with strong POSTGRES_PASSWORD and SECRET_KEY
```

### 4. Backend Setup & Alembic Migrations
```bash
cd /opt/ohb-opcms/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
# Applies 0001_initial_schema and 0002_command_room_and_viewer_role
```

### 4b. Provisioning a Command Room Viewer Account
No default password is shipped for `command_room_viewer`. Sign in as `system_admin`, open **User Management**, select **Command Room Viewer (Display Only)**, and assign a strong initial password (minimum 10 characters with letters and numbers or symbols). On first sign-in at `/command-room`, the wallboard operator is prompted to set a personal password via `POST /api/auth/change-password`.

### 5. Build Frontend & Configure PM2 + Nginx + Systemd
```bash
cd /opt/ohb-opcms
npm ci
npm run build
pm2 start deploy/pm2/ecosystem.config.cjs
pm2 save

sudo cp deploy/systemd/opcms-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now opcms-api

sudo cp deploy/nginx/opcms.conf /etc/nginx/sites-available/ohb-opcms
sudo ln -sf /etc/nginx/sites-available/ohb-opcms /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## Backup & Restore

```bash
# Create compressed PostgreSQL dump + uploaded files archive
bash deploy/scripts/backup.sh

# Restore from backup
bash deploy/scripts/restore.sh /var/backups/ohb-opcms/db_YYYYMMDD_HHMMSS.dump /var/backups/ohb-opcms/uploads_YYYYMMDD_HHMMSS.tar.gz
```
