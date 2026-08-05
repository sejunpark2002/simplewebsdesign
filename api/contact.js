/* ============================================================
   POST /api/contact — contact form → email, via Resend.

   Runs on Vercel's Node runtime, so RESEND_API_KEY stays on the
   server and never reaches the browser. No npm dependency: the
   Resend REST API is called with the built-in fetch.

   Env vars (Vercel → Project → Settings → Environment Variables):
     RESEND_API_KEY  required — re_...
     CONTACT_TO      optional — inbox that receives entries
     CONTACT_FROM    optional — sender, must be a Resend-verified domain
   ============================================================ */

const TO = process.env.CONTACT_TO || "info@simplewebsdesign.com";
const FROM = process.env.CONTACT_FROM || "SimpleWebs <noreply@simplewebsdesign.com>";

const LIMITS = { name: 120, email: 200, message: 5000 };

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function readBody(req) {
  // Vercel parses JSON and urlencoded bodies; fall back to raw text just in case
  const b = req.body;
  if (!b) return {};
  if (typeof b === "string") {
    try { return JSON.parse(b); } catch (e) { return Object.fromEntries(new URLSearchParams(b)); }
  }
  return b;
}

function validate(fields) {
  for (const key of ["name", "email", "message"]) {
    const v = (fields[key] || "").trim();
    if (!v) return "Please fill in your name, email and project detail.";
    if (v.length > LIMITS[key]) return "That " + key + " is too long.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) return "That email address doesn't look right.";
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = readBody(req);
  const wantsJson = (req.headers.accept || "").includes("application/json");

  const done = (status, payload) => {
    if (wantsJson) return res.status(status).json(payload);
    // no-JS fallback: a plain page instead of raw JSON
    const msg = payload.error || "Thanks — your message is on its way.";
    return res.status(status).setHeader("Content-Type", "text/html; charset=utf-8")
      .send('<!doctype html><meta charset="utf-8"><title>SimpleWebs</title>' +
        '<p style="font:16px/1.5 system-ui;padding:40px">' + escapeHtml(msg) +
        ' <a href="/contact.html">Back to the site</a></p>');
  };

  // honeypot: bots fill hidden fields, so accept and drop it
  if ((body._gotcha || "").trim()) return done(200, { ok: true });

  const invalid = validate(body);
  if (invalid) return done(400, { error: invalid });

  if (!process.env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not set");
    return done(500, { error: "The form isn't configured yet — please email us directly." });
  }

  const name = body.name.trim();
  const email = body.email.trim();
  const message = body.message.trim();

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.RESEND_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        reply_to: email,          // hitting reply answers the sender, not the robot
        subject: "New enquiry from " + name,
        text: "Name: " + name + "\nEmail: " + email + "\n\n" + message,
        html:
          "<h2>New contact form entry</h2>" +
          "<p><strong>Name:</strong> " + escapeHtml(name) + "<br>" +
          "<strong>Email:</strong> <a href=\"mailto:" + escapeHtml(email) + "\">" + escapeHtml(email) + "</a></p>" +
          "<p style=\"white-space:pre-wrap\">" + escapeHtml(message) + "</p>"
      })
    });

    if (!r.ok) {
      // log the real reason, tell the visitor something useful
      console.error("Resend responded " + r.status + ": " + (await r.text()));
      return done(502, { error: "We couldn't send that just now — please email info@simplewebsdesign.com." });
    }

    return done(200, { ok: true });
  } catch (err) {
    console.error("Contact form failed:", err);
    return done(500, { error: "Something went wrong sending your message." });
  }
};
