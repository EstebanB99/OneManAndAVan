const FREEBUSY_SCOPE = "https://www.googleapis.com/auth/calendar.freebusy";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FREEBUSY_URL = "https://www.googleapis.com/calendar/v3/freeBusy";
let cachedToken = null;

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const monthMatch = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(url.searchParams.get("month") || "");
  if (!monthMatch) {
    return jsonResponse({ error: "Provide month as YYYY-MM." }, 400);
  }

  const serviceAccountJson = env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const calendarIds = (env.GOOGLE_CALENDAR_IDS || "")
    .split(",")
    .map((calendarId) => calendarId.trim())
    .filter(Boolean);
  if (!serviceAccountJson || calendarIds.length === 0) {
    return jsonResponse({ error: "Calendar integration is not configured." }, 503);
  }

  try {
    const config = readScheduleConfig(env);
    const year = Number(monthMatch[1]);
    const month = Number(monthMatch[2]);
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const currentYearMonth = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: config.timeZone,
        year: "numeric",
        month: "numeric"
      }).formatToParts(new Date())
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)])
    );

    if (year * 12 + month < currentYearMonth.year * 12 + currentYearMonth.month) {
      return jsonResponse({ availability: {}, timeZone: config.timeZone });
    }

    const serviceAccount = parseServiceAccount(serviceAccountJson);
    const accessToken = await getAccessToken(serviceAccount);
    const busyPeriods = await getBusyPeriods(accessToken, calendarIds, monthStart, config);
    const availability = buildAvailability(monthStart, busyPeriods, config);

    return jsonResponse({ availability, timeZone: config.timeZone }, 200, 60);
  } catch (error) {
    console.error("Google Calendar availability request failed.", error.message);
    return jsonResponse({ error: "Google Calendar availability could not be loaded." }, 502);
  }
}

function readScheduleConfig(env) {
  const config = {
    timeZone: env.BOOKING_TIME_ZONE || "America/Indiana/Indianapolis",
    openHour: integerSetting(env, "BOOKING_OPEN_HOUR", 6, 0, 23),
    closeHour: integerSetting(env, "BOOKING_CLOSE_HOUR", 15, 1, 24),
    slotMinutes: integerSetting(env, "BOOKING_SLOT_MINUTES", 30, 1, 720),
    maximumAdvanceDays: integerSetting(env, "BOOKING_MAX_ADVANCE_DAYS", 60, 1, 3650),
    minimumLeadHours: integerSetting(env, "BOOKING_MIN_LEAD_HOURS", 4, 0, 720),
    bufferMinutes: integerSetting(env, "BOOKING_BUFFER_MINUTES", 0, 0, 720)
  };

  if (config.closeHour <= config.openHour
    || config.slotMinutes > (config.closeHour - config.openHour) * 60) {
    throw new Error("Booking hours and slot duration are invalid.");
  }

  new Intl.DateTimeFormat("en-US", { timeZone: config.timeZone });
  return config;
}

function integerSetting(env, name, fallback, minimum, maximum) {
  const value = env[name] === undefined || env[name] === ""
    ? fallback
    : Number(env[name]);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

function parseServiceAccount(value) {
  const serviceAccount = JSON.parse(value);
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error("Service account JSON is missing its email or private key.");
  }
  return serviceAccount;
}

async function getAccessToken(serviceAccount) {
  if (cachedToken
    && cachedToken.email === serviceAccount.client_email
    && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: "RS256", typ: "JWT" });
  const claims = base64UrlJson({
    iss: serviceAccount.client_email,
    scope: FREEBUSY_SCOPE,
    aud: TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3600
  });
  const unsignedAssertion = `${header}.${claims}`;
  const privateKey = await importPrivateKey(serviceAccount.private_key);
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    privateKey,
    new TextEncoder().encode(unsignedAssertion)
  );
  const assertion = `${unsignedAssertion}.${base64UrlBytes(new Uint8Array(signature))}`;
  const tokenResponse = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });

  if (!tokenResponse.ok) {
    throw new Error(`Google token request failed with status ${tokenResponse.status}.`);
  }

  const token = await tokenResponse.json();
  if (!token.access_token || !token.expires_in) {
    throw new Error("Google token response was incomplete.");
  }

  cachedToken = {
    email: serviceAccount.client_email,
    value: token.access_token,
    expiresAt: Date.now() + token.expires_in * 1000
  };
  return cachedToken.value;
}

async function importPrivateKey(pem) {
  const encoded = pem
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(encoded);
  const keyBytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    keyBytes[index] = binary.charCodeAt(index);
  }

  return crypto.subtle.importKey(
    "pkcs8",
    keyBytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function base64UrlJson(value) {
  return base64UrlBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlBytes(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getBusyPeriods(accessToken, calendarIds, monthStart, config) {
  const nextMonthStart = new Date(Date.UTC(
    monthStart.getUTCFullYear(),
    monthStart.getUTCMonth() + 1,
    1
  ));
  const timeMin = localTimeToUtc(monthStart, 0, 0, config.timeZone);
  const timeMax = localTimeToUtc(nextMonthStart, 0, 0, config.timeZone);
  const response = await fetch(FREEBUSY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      timeZone: config.timeZone,
      items: calendarIds.map((id) => ({ id }))
    })
  });

  if (!response.ok) {
    throw new Error(`Google FreeBusy request failed with status ${response.status}.`);
  }

  const result = await response.json();
  const busyPeriods = [];
  for (const calendarId of calendarIds) {
    const calendar = result.calendars && result.calendars[calendarId];
    if (!calendar || (calendar.errors && calendar.errors.length)) {
      throw new Error("Google FreeBusy could not read one of the configured calendars.");
    }
    for (const period of calendar.busy || []) {
      const start = Date.parse(period.start);
      const end = Date.parse(period.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        throw new Error("Google FreeBusy returned an invalid busy interval.");
      }
      busyPeriods.push({ start, end });
    }
  }

  return busyPeriods;
}

function buildAvailability(monthStart, busyPeriods, config) {
  const availability = {};
  const year = monthStart.getUTCFullYear();
  const month = monthStart.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const now = Date.now();
  const earliestStart = now + config.minimumLeadHours * 60 * 60 * 1000;
  const latestStart = now + config.maximumAdvanceDays * 24 * 60 * 60 * 1000;
  const bufferMs = config.bufferMinutes * 60 * 1000;

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(Date.UTC(year, month, day));
    const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const slots = [];

    for (let minute = config.openHour * 60;
      minute + config.slotMinutes <= config.closeHour * 60;
      minute += config.slotMinutes) {
      const start = localTimeToUtc(date, Math.floor(minute / 60), minute % 60, config.timeZone);
      const end = new Date(start.getTime() + config.slotMinutes * 60 * 1000);
      if (start.getTime() < earliestStart || start.getTime() > latestStart) continue;

      const isBusy = busyPeriods.some((period) =>
        start.getTime() < period.end + bufferMs
        && end.getTime() + bufferMs > period.start);
      if (!isBusy) {
        slots.push(`${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`);
      }
    }

    if (slots.length) availability[dateKey] = slots;
  }

  return availability;
}

function localTimeToUtc(date, hour, minute, timeZone) {
  const desiredUtc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    hour,
    minute
  );
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  let candidate = desiredUtc;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(candidate))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)])
    );
    const representedUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute
    );
    const correction = desiredUtc - representedUtc;
    candidate += correction;
    if (correction === 0) break;
  }

  return new Date(candidate);
}

function jsonResponse(body, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": maxAge ? `public, max-age=${maxAge}` : "no-store"
    }
  });
}
