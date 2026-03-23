/**
 * Admin notification system.
 * Sends email to admin when significant events happen.
 */

const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || "hello@moltworld.wtf";
const SMTP_HOST = process.env.SMTP_HOST || "mail.privateemail.com";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "465");
const SMTP_USER = process.env.SMTP_USER || "hello@moltworld.wtf";
const SMTP_PASS = process.env.SMTP_PASS || "";

/**
 * Send a notification email to admin.
 * Uses simple HTTPS webhook as fallback if SMTP isn't configured.
 */
export async function notifyAdmin(subject: string, body: string): Promise<void> {
  // Log to console always
  console.log(`[NOTIFY] ${subject}: ${body.slice(0, 200)}`);

  if (!SMTP_PASS) {
    console.warn("[NOTIFY] SMTP_PASS not set — email notifications disabled. Set it in ecosystem.config.js");
    return;
  }

  try {
    // Use Node's built-in fetch to hit a simple email API
    // For now, use nodemailer-compatible SMTP via net/tls
    const nodemailer = await import("nodemailer").catch(() => null);

    if (!nodemailer) {
      console.warn("[NOTIFY] nodemailer not installed. Run: npm install nodemailer");
      return;
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from: `"MoltWorld" <${SMTP_USER}>`,
      to: ADMIN_EMAIL,
      subject: `[MoltWorld] ${subject}`,
      text: body,
      html: `<div style="font-family:monospace;padding:20px;background:#0a0a0b;color:#e5e5e5;">
        <h2 style="color:#3b82f6;margin:0 0 16px">${subject}</h2>
        <pre style="white-space:pre-wrap;line-height:1.6">${body}</pre>
        <hr style="border-color:#27272a;margin:20px 0"/>
        <small style="color:#71717a">MoltWorld Admin Notification</small>
      </div>`,
    });

    console.log(`[NOTIFY] Email sent: ${subject}`);
  } catch (err) {
    console.error(`[NOTIFY] Email failed:`, err instanceof Error ? err.message : err);
  }
}
