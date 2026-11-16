# Мой бюджет — сервер push-уведомлений (Cloudflare Worker)

**Стадия 1: подключение автоматического развёртывания через GitHub.** Пока сервер лишь отвечает на запрос проверки; **реальные push-уведомления не активированы**.

## Подключение из Cloudflare

1. Workers & Pages → Create application → **Connect GitHub**.
2. Предоставить Cloudflare доступ к репозиторию **anadale3003-hash/moy-budget**.
3. Выбрать ветку **main** и **Root directory: `push-worker`** (важно: не корень репозитория).
4. Имя Worker: **moy-budget-push** (строго совпадает с wrangler.jsonc).
5. Deploy command: `npx wrangler deploy` (или `npm run deploy`).
6. Save and Deploy. Открыть выданную ссылку *.workers.dev — должна появиться JSON-строка с `status: "deployed"` и `pushEnabled: false`.

Если ранее Worker создан вручную с таким же именем, вместо Create application можно открыть его Settings → Builds → Connect GitHub и указать те же repo/root/branch.

## Дальше

После проверки развертывания будут отдельно добавлены Web Push VAPID, защищённое хранение подписки iPhone, обработчик `push` в `sw.js`, кнопка подписки в приложении, реальная отправка из расписания. Сервер не должен получать суммы операций или финансовые записи — только подписку устройства и тип напоминания.

**Безопасность:** никогда не коммитить VAPID private key, API tokens, пароли и другие секреты в репозиторий.

Cron `30 5 * * *` — 05:30 UTC / 08:30 по Москве, каждый день. Пока обработчик ничего не отправляет.
