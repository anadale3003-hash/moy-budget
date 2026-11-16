# Мой бюджет — Cloudflare Web Push

Сервер push-уведомлений для PWA «Мой бюджет».

## Что делает

- Принимает подписку установленного PWA на push.
- Хранит только endpoint подписки, ключи подписки и настройки напоминаний в SQLite-backed Durable Object.
- Самостоятельно создаёт VAPID key pair при первом запросе публичного ключа; закрытый ключ хранится только в Durable Object, в GitHub его нет.
- Отправляет тестовое push по запросу пользователя.
- Ежедневно в 08:30 по Москве проверяет даты аванса/зарплаты и последний день месяца.
- Учитывает даты выплат из приложения и перенос на предыдущий рабочий день по календарю РФ, который используется приложением для 2026–2027 годов.
- Не передаёт на сервер суммы, расходы, доходы, счета или другие финансовые записи.

## GitHub / Cloudflare

- Repository: `anadale3003-hash/moy-budget`
- Production branch: `main`
- Root directory: `/push-worker`
- Deploy command: `npx wrangler deploy`
- Worker name: `autumn-resonance-d140`
- Cron: `30 5 * * *` (05:30 UTC = 08:30 Europe/Moscow)

Wrangler creates the SQLite Durable Object namespace using the `new_sqlite_classes` migration on deployment. No manual KV namespace or VAPID secret is required.

## First run

1. Wait for the Cloudflare Workers Build to finish.
2. Check `https://autumn-resonance-d140.anadale3003.workers.dev/health`.
3. Expected JSON includes `"status":"ready"` and `"pushEnabled":true`.
4. Open the installed iPhone PWA, Settings → Push notifications → Connect push notifications.
5. Allow notifications. Then use the server test button.
6. Choose reminders: all (paydays + month-end), paydays only, or off.

## Security

- Browser API requests are restricted by CORS to `https://anadale3003-hash.github.io`.
- Subscription records contain no financial transactions or balances.
- VAPID private key is generated once and stored server-side in Durable Object storage.
- The test endpoint can only send to a subscription endpoint already registered by the app.
