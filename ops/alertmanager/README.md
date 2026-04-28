# Alertmanager → Telegram routing

This repo ships a minimal webhook receiver inside the Django backend:

- Endpoint: `/api/ops/alertmanager/webhook/`
- Purpose: receive Alertmanager webhooks and forward alerts to a Telegram chat via bot.

## Backend environment variables

- `ALERT_TELEGRAM_BOT_TOKEN`: Telegram bot token used to send messages.
- `ALERT_TELEGRAM_CHAT_ID`: destination chat id (group or user).
- `ALERTMANAGER_WEBHOOK_SECRET`: optional shared secret. If set, Alertmanager must send header `X-Alertmanager-Secret`.

## Alertmanager config

See `ops/alertmanager/alertmanager.yml` for a working example.

## Runbook links & severity

Alert rules should include:

- `labels.severity`: `page|critical|warning|info`
- `annotations.runbook_url`: link to runbook in this repo (or internal wiki)

