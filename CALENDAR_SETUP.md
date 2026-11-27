# Google Calendar availability setup

The booking page calls `/api/availability` on the same Cloudflare Pages site. The Pages Function uses Google Calendar FreeBusy and returns only open time slots; event titles and details are never sent to the browser.

## Deploy the site and function

1. In Cloudflare, create a Pages project connected to this GitHub repository and deploy the `main` branch.
2. Leave the build command empty and set the build output directory to `.`. The `functions/api/availability.js` file is detected as a Pages Function.
3. In the Pages project settings, add the Google settings below under **Settings → Variables and Secrets**. Add the private-key JSON as an encrypted secret, not a regular variable.

## Grant read-only calendar access

1. In Google Cloud Console, create a project and enable the Google Calendar API.
2. Create a service account and download its JSON key. Keep the downloaded file private.
3. In Google Calendar, share the calendar used by the appointment schedule with the service account's `client_email`, granting **See only free/busy (hide details)**.
4. Find that calendar's Calendar ID under **Google Calendar → Settings → Integrate calendar**.
5. Add the service account JSON to Cloudflare as the `GOOGLE_SERVICE_ACCOUNT_JSON` secret. Add the calendar ID or comma-separated calendar IDs as `GOOGLE_CALENDAR_IDS`.

Never commit the service-account JSON or paste its private key into the website code.

## Schedule settings

The endpoint defaults to:

| Variable | Default | Meaning |
| --- | --- | --- |
| `BOOKING_TIME_ZONE` | `America/Indiana/Indianapolis` | Local schedule time zone |
| `BOOKING_OPEN_HOUR` | `6` | Daily opening hour (24-hour clock) |
| `BOOKING_CLOSE_HOUR` | `15` | Daily closing time; no appointment starts at or after this hour |
| `BOOKING_SLOT_MINUTES` | `60` | Appointment duration and slot interval |
| `BOOKING_MAX_ADVANCE_DAYS` | `60` | How far into the future appointments may be shown |
| `BOOKING_MIN_LEAD_HOURS` | `4` | Minimum time before an appointment can start |
| `BOOKING_BUFFER_MINUTES` | `60` | Buffer applied around busy calendar events |

The daily hours, 60-day booking window, 60-minute duration, four-hour minimum lead time, and one-hour buffer match the Google appointment schedule. Google Calendar API provides busy periods, not appointment-schedule rules such as date-specific exceptions, booking limits, or co-host availability. Add any calendars that should block a slot to `GOOGLE_CALENDAR_IDS`; use calendar events to represent time off or other exceptions.

After adding or changing settings, redeploy the Pages project. The live endpoint is `/api/availability?month=YYYY-MM`.
