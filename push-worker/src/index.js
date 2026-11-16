import { DurableObject } from "cloudflare:workers";
import { buildPushPayload } from "@block65/webcrypto-web-push";

const APP_ORIGIN = "https://anadale3003-hash.github.io";
const APP_URL = APP_ORIGIN + "/moy-budget/index.html";
const VAPID_SUBJECT = "https://github.com/anadale3003-hash/moy-budget";

const RU_NONWORK = new Set([
  "2026-01-01","2026-01-02","2026-01-05","2026-01-06","2026-01-07","2026-01-08","2026-01-09",
  "2026-02-23","2026-03-09","2026-05-01","2026-05-11","2026-06-12","2026-11-04","2026-12-31",
  "2027-01-01","2027-01-04","2027-01-05","2027-01-06","2027-01-07","2027-01-08",
  "2027-02-22","2027-02-23","2027-03-08","2027-05-03","2027-05-10","2027-06-14",
  "2027-11-04","2027-11-05","2027-12-31"
]);
const RU_WORK_SAT = new Set(["2027-02-20"]);

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }
  });
}
function corsHeaders(origin) {
  if (origin !== APP_ORIGIN) return {};
  return {
    "Access-Control-Allow-Origin": APP_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}
function b64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function endpointId(endpoint) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return b64url(new Uint8Array(digest));
}
function storeStub(env) {
  const id = env.SUBSCRIPTIONS.idFromName("moy-budget-global");
  return env.SUBSCRIPTIONS.get(id);
}
async function storeCall(env, path, body) {
  const response = await storeStub(env).fetch("https://store" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!response.ok) throw new Error("Subscription store error: " + response.status);
  return response.json();
}
function moscowDate(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(now);
  const get = type => parts.find(p => p.type === type)?.value;
  return get("year") + "-" + get("month") + "-" + get("day");
}
function dateFor(year, month, day) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, Math.min(Math.max(1, day), last)));
}
function dateISO(date) {
  return date.getUTCFullYear() + "-" + String(date.getUTCMonth() + 1).padStart(2, "0") + "-" + String(date.getUTCDate()).padStart(2, "0");
}
function shiftPayday(year, month, day) {
  const date = dateFor(year, month, day);
  for (let i = 0; i < 18; i++) {
    const key = dateISO(date), weekday = date.getUTCDay();
    if (RU_WORK_SAT.has(key) || (weekday !== 0 && weekday !== 6 && !RU_NONWORK.has(key))) return key;
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return dateISO(date);
}
function addMonths(year, month, offset) {
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}
// Only the latest active pay cycle per type can generate reminders.
// A pending payment is reminded once daily for up to 14 days after its planned date.
function duePaydays(today, prefs) {
  const [year, month] = today.split("-").map(Number);
  const advanceDay = Math.min(31, Math.max(1, Number(prefs.advanceDay) || 16));
  const salaryDay = Math.min(31, Math.max(1, Number(prefs.salaryDay) || 1));
  const candidates = [];
  for (let offset = -2; offset <= 1; offset++) {
    const cycle = addMonths(year, month, offset);
    const period = String(cycle.year) + "-" + String(cycle.month).padStart(2, "0");
    candidates.push({ type: "advance", period,
      due: shiftPayday(cycle.year, cycle.month, advanceDay) });
    const target = addMonths(cycle.year, cycle.month, salaryDay <= advanceDay ? 1 : 0);
    candidates.push({ type: "salary", period,
      due: shiftPayday(target.year, target.month, salaryDay) });
  }
  const nowDay = Date.parse(today + "T00:00:00Z");
  return ["advance", "salary"].map(type => candidates.filter(item => {
    const difference = (nowDay - Date.parse(item.due + "T00:00:00Z")) / 86400000;
    return item.type === type && difference >= 0 && difference <= 14;
  }).sort((a, b) => b.due.localeCompare(a.due))[0]).filter(Boolean);
}
function isMonthEnd(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).getUTCMonth() !== month - 1;
}
function notificationFor(type) {
  if (type === "advance") return {
    title: "Сегодня день аванса 💵",
    body: "Когда деньги поступят, отметь зачисление в приложении «Мой бюджет».",
    tag: "advance"
  };
  if (type === "salary") return {
    title: "Сегодня день зарплаты 💰",
    body: "Когда зарплата поступит, отметь зачисление в приложении «Мой бюджет».",
    tag: "salary"
  };
  return {
    title: "Итоги месяца 📊",
    body: "Проверь расходы, поступления и остаток семейного бюджета.",
    tag: "month-end"
  };
}
async function sendToRecord(env, record, message) {
  const vapid = await storeCall(env, "/vapid");
  const payload = await buildPushPayload(
    { data: { ...message, url: APP_URL }, options: { ttl: 86400, urgency: "high", topic: message.tag } },
    record.subscription,
    { subject: VAPID_SUBJECT, publicKey: vapid.publicKey, privateKey: vapid.privateKey }
  );
  return fetch(record.subscription.endpoint, payload);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);
    if (request.method === "OPTIONS") {
      if (origin !== APP_ORIGIN) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: cors });
    }
    if (origin && origin !== APP_ORIGIN) return json({ error: "Origin not allowed" }, 403);
    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ app: "moy-budget-push", status: "ready", pushEnabled: true, storage: "durable-object" }, 200, cors);
      }
      if (request.method === "GET" && url.pathname === "/vapid-public-key") {
        const keys = await storeCall(env, "/vapid");
        return json({ publicKey: keys.publicKey }, 200, cors);
      }
      if (request.method === "POST" && url.pathname === "/subscribe") {
        const body = await request.json();
        const sub = body.subscription;
        if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth || !sub.endpoint.startsWith("https://")) {
          return json({ error: "Invalid push subscription" }, 400, cors);
        }
        const id = await endpointId(sub.endpoint);
        const prefs = body.preferences || {};
        const record = {
          id, subscription: sub,
          preferences: {
            reminders: ["all", "pay", "none"].includes(prefs.reminders) ? prefs.reminders : "all",
            advanceDay: Math.min(31, Math.max(1, Number(prefs.advanceDay) || 16)),
            salaryDay: Math.min(31, Math.max(1, Number(prefs.salaryDay) || 1))
          },
          confirmed: Object.fromEntries(
            (Array.isArray(body.confirmedPeriods) ? body.confirmedPeriods : [])
              .filter(key => /^20\\d{2}-(0[1-9]|1[0-2])-(advance|salary)$/.test(key))
              .slice(-48).map(key => [key, true])
          ),
          sent: {}, updatedAt: Date.now()
        };
        const existing = await storeCall(env, "/get", { id });
        if (existing?.record) record.sent = existing.record.sent || {};
        await storeCall(env, "/save", { id, record });
        return json({ ok: true, subscribed: true }, 200, cors);
      }
      if (request.method === "POST" && url.pathname === "/test") {
        const body = await request.json();
        if (!body.endpoint) return json({ error: "Missing endpoint" }, 400, cors);
        const id = await endpointId(body.endpoint);
        const result = await storeCall(env, "/get", { id });
        if (!result?.record) return json({ error: "Device is not subscribed" }, 404, cors);
        const response = await sendToRecord(env, result.record, {
          title: "Мой бюджет — проверка 🔔",
          body: "Отлично! Серверное push-уведомление дошло до твоего iPhone.",
          tag: "test"
        });
        if (response.status === 404 || response.status === 410) await storeCall(env, "/delete", { id });
        return json({ ok: response.ok, status: response.status }, response.ok ? 200 : 502, cors);
      }
      if (request.method === "POST" && url.pathname === "/test-delayed") {
        const body = await request.json();
        if (!body.endpoint || typeof body.endpoint !== "string") return json({ error: "Missing endpoint" }, 400, cors);
        const id = await endpointId(body.endpoint);
        const result = await storeCall(env, "/get", { id });
        if (!result?.record) return json({ error: "Device is not subscribed" }, 404, cors);
        const queued = await storeCall(env, "/queue-test", { id, delayMs: 30000 });
        return json({ ok: true, queued: true, delaySeconds: 30, queuedId: queued.queuedId }, 200, cors);
      }
      if (request.method === "POST" && url.pathname === "/unsubscribe") {
        const body = await request.json();
        if (body.endpoint) await storeCall(env, "/delete", { id: await endpointId(body.endpoint) });
        return json({ ok: true }, 200, cors);
      }
      return json({ error: "Not found" }, 404, cors);
    } catch (error) {
      return json({ error: "Push service error", detail: String(error?.message || error) }, 500, cors);
    }
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => {
      const today = moscowDate(new Date());
      const records = await storeCall(env, "/list");
      for (const record of records) {
        const prefs = record.preferences || {};
        if (prefs.reminders === "none") continue;
        const due = duePaydays(today, prefs).filter(item =>
          !record.confirmed?.[item.period + "-" + item.type]
        );
        const messages = due.map(item => ({ type: item.type, period: item.period }));
        if (prefs.reminders === "all" && isMonthEnd(today)) messages.push({ type: "month-end", period: today.slice(0, 7) });
        for (const item of messages) {
          const type = item.type;
          const sentKey = today + ":" + item.period + ":" + type;
          if (record.sent?.[sentKey] || (type !== "month-end" && record.confirmed?.[item.period + "-" + type])) continue;
          try {
            const response = await sendToRecord(env, record, notificationFor(type));
            if (response.status === 404 || response.status === 410) {
              await storeCall(env, "/delete", { id: record.id });
              break;
            }
            if (response.ok) {
              record.sent = record.sent || {};
              record.sent[sentKey] = Date.now();
              for (const key of Object.keys(record.sent)) {
                if (key.slice(0, 10) < today.slice(0, 10) && Date.now() - record.sent[key] > 60 * 86400000) delete record.sent[key];
              }
              record.updatedAt = Date.now();
              await storeCall(env, "/save", { id: record.id, record });
            }
          } catch (_) {
            // Keep the subscription; a transient push-service error can recover tomorrow.
          }
        }
      }
    })());
  }
};

export class SubscriptionStore extends DurableObject {
  async alarm() {
    const entries = await this.ctx.storage.list({ prefix: "queued:" });
    const now = Date.now();
    let next = null;
    for (const [key, job] of entries) {
      if (!job || !Number.isFinite(job.when)) {
        await this.ctx.storage.delete(key);
        continue;
      }
      if (job.when > now) {
        next = next === null ? job.when : Math.min(next, job.when);
        continue;
      }
      // Delete before sending; jobs must not repeat if alarm is retried.
      await this.ctx.storage.delete(key);
      const record = await this.ctx.storage.get("sub:" + job.id);
      if (!record) continue;
      try {
        const response = await sendToRecord(this.env, record, {
          title: "Мой бюджет — тест блокировки 🔒",
          body: "Пуш пришёл через 30 секунд. Уведомления работают, даже когда приложение закрыто.",
          tag: "delayed-test"
        });
        if (response.status === 404 || response.status === 410) {
          await this.ctx.storage.delete("sub:" + job.id);
        }
      } catch (error) {
        console.error("Delayed push failed:", String(error));
      }
    }
    if (next !== null) await this.ctx.storage.setAlarm(next);
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/vapid") {
      let keys = await this.ctx.storage.get("vapid");
      if (!keys) {
        const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
        const publicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
        const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
        const privateB64 = privateJwk.d.replace(/-/g, "+").replace(/_/g, "/");
        const privateRaw = Uint8Array.from(atob(privateB64 + "=".repeat((4 - privateB64.length % 4) % 4)), c => c.charCodeAt(0));
        keys = { publicKey: b64url(publicRaw), privateKey: b64url(privateRaw) };
        await this.ctx.storage.put("vapid", keys);
      }
      return json(keys);
    }
    if (url.pathname === "/save" && request.method === "POST") {
      const { id, record } = await request.json();
      if (!id || !record) return json({ error: "Invalid record" }, 400);
      await this.ctx.storage.put("sub:" + id, record);
      return json({ ok: true });
    }
    if (url.pathname === "/get" && request.method === "POST") {
      const { id } = await request.json();
      return json({ record: await this.ctx.storage.get("sub:" + id) || null });
    }
    if (url.pathname === "/delete" && request.method === "POST") {
      const { id } = await request.json();
      await this.ctx.storage.delete("sub:" + id);
      return json({ ok: true });
    }
    if (url.pathname === "/queue-test" && request.method === "POST") {
      const { id, delayMs } = await request.json();
      if (!id || !(await this.ctx.storage.get("sub:" + id))) return json({ error: "Unknown subscription" }, 404);
      const when = Date.now() + Math.min(60000, Math.max(30000, Number(delayMs) || 30000));
      // One pending delayed test per device; don't crowd the alarm queue.
      const key = "queued:" + id;
      await this.ctx.storage.put(key, { id, when });
      const currentAlarm = await this.ctx.storage.getAlarm();
      if (currentAlarm === null || currentAlarm > when) await this.ctx.storage.setAlarm(when);
      return json({ ok: true, queuedId: id, when });
    }
    if (url.pathname === "/list") {
      const values = await this.ctx.storage.list({ prefix: "sub:" });
      return json([...values.values()]);
    }
    return json({ error: "Not found" }, 404);
  }
}
