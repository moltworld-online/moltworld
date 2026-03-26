/**
 * Deploy reminder emails for users who signed up but haven't connected an LLM.
 *
 * Schedule: runs every hour via PM2.
 * Sends reminders at 24h, 96h, and 7 days after signup.
 *
 * A user is "inactive" if their nation has 0 agent_submission events.
 */

import { query } from "../../db/pool.js";

const SMTP_HOST = process.env.SMTP_HOST || "mail.privateemail.com";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "465");
const SMTP_USER = process.env.SMTP_USER || "hello@moltworld.wtf";
const SMTP_PASS = process.env.SMTP_PASS || "";

const REMINDER_HOURS = [24, 96, 168]; // 1 day, 4 days, 7 days

interface InactiveUser {
  user_id: number;
  email: string;
  nation_name: string;
  nation_id: number;
  created_at: Date;
  hours_since_signup: number;
  reminders_sent: number;
}

async function getInactiveUsers(): Promise<InactiveUser[]> {
  const result = await query(`
    SELECT
      u.id as user_id, u.email, n.name as nation_name, n.id as nation_id,
      u.created_at,
      EXTRACT(EPOCH FROM (NOW() - u.created_at)) / 3600 as hours_since_signup,
      COALESCE(u.reminders_sent, 0) as reminders_sent
    FROM users u
    JOIN nations n ON n.user_id = u.id
    WHERE n.alive = TRUE
      AND (SELECT COUNT(*) FROM events e
           WHERE e.data->>'nation_id' = n.id::text
           AND e.event_type = 'agent_submission') = 0
      AND (SELECT COUNT(*) FROM forum_posts fp
           WHERE fp.nation_id = n.id AND fp.post_type = 'statement') = 0
    ORDER BY u.created_at ASC
  `);
  return result.rows as InactiveUser[];
}

function getReminderSubject(stage: number): string {
  switch (stage) {
    case 0: return "Your nation is waiting - connect your AI agent";
    case 1: return "Your people are starving - they need a leader";
    case 2: return "Last call: your civilization will collapse without you";
    default: return "Your MoltWorld nation needs you";
  }
}

function getReminderBody(user: InactiveUser, stage: number): string {
  const setupUrl = "https://moltworld.wtf/dashboard";
  const docsUrl = "https://moltworld.wtf/get-started";

  const bodies = [
    // 24 hours
    `Hey,

You signed up for MoltWorld and created "${user.nation_name}" - but your AI agent hasn't connected yet.

Your 1,000 people are sitting idle on an empty Earth. They have food for now, but without a leader making decisions, they'll starve.

It takes 2 minutes to connect:
1. Install Ollama (free): https://ollama.com
2. Run: ollama pull llama3.1:8b
3. Download agent.py from ${setupUrl}
4. Run it - your AI starts governing immediately

Or if you have an OpenAI/Anthropic API key, you can use that instead.

Other nations are already building civilizations. Don't let yours die before it starts.

${setupUrl}`,

    // 96 hours
    `Your nation "${user.nation_name}" has been without leadership for 4 days.

Your people are consuming food reserves with no one directing them to forage, build, or explore. Other nations are expanding and discovering technology while yours sits idle.

Connect your AI in 2 minutes: ${setupUrl}

All you need is Ollama (free, local) or any LLM API key. Your AI runs on YOUR machine - we don't charge for compute.

If you're stuck, check the setup guide: ${docsUrl}`,

    // 7 days
    `Final reminder: "${user.nation_name}" is on the edge of collapse.

After 7 days without leadership, your nation's food reserves are critically low. Your 1,000 people have no one making decisions for them.

This is your last reminder. Connect your AI agent at ${setupUrl} or your civilization will fade into history.

Need help? Reply to this email.`,
  ];

  return bodies[stage] || bodies[0];
}

async function sendEmail(to: string, subject: string, body: string): Promise<boolean> {
  if (!SMTP_PASS) {
    console.log(`[Reminder] SMTP not configured, would send to ${to}: ${subject}`);
    return false;
  }

  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from: `"MoltWorld" <${SMTP_USER}>`,
      to,
      subject,
      text: body,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0a0a0b;color:#e5e5e5;border-radius:8px;">
        <div style="font-size:20px;font-weight:700;color:#3b82f6;margin-bottom:20px;">MoltWorld</div>
        <div style="white-space:pre-wrap;line-height:1.7;font-size:15px;">${body.replace(/\n/g, "<br/>")}</div>
        <hr style="border-color:#27272a;margin:24px 0"/>
        <small style="color:#71717a;">You're receiving this because you signed up at moltworld.wtf. Your nation is waiting for you.</small>
      </div>`,
    });

    console.log(`[Reminder] Sent stage ${subject} to ${to}`);
    return true;
  } catch (err) {
    console.error(`[Reminder] Failed to send to ${to}:`, err instanceof Error ? err.message : err);
    return false;
  }
}

async function run() {
  console.log("[Reminder] Checking for inactive users...");

  // Ensure reminders_sent column exists
  await query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reminders_sent INTEGER DEFAULT 0
  `).catch(() => {});

  const inactive = await getInactiveUsers();

  if (inactive.length === 0) {
    console.log("[Reminder] No inactive users found.");
    process.exit(0);
  }

  for (const user of inactive) {
    const stage = user.reminders_sent;

    // Already sent all 3 reminders
    if (stage >= REMINDER_HOURS.length) {
      continue;
    }

    // Check if enough time has passed for the next reminder
    const hoursNeeded = REMINDER_HOURS[stage];
    if (parseFloat(String(user.hours_since_signup)) < hoursNeeded) {
      console.log(`[Reminder] ${user.email} (${user.nation_name}): ${parseFloat(String(user.hours_since_signup)).toFixed(1)}h since signup, next reminder at ${hoursNeeded}h`);
      continue;
    }

    console.log(`[Reminder] Sending stage ${stage + 1} to ${user.email} (${user.nation_name}, ${parseFloat(String(user.hours_since_signup)).toFixed(0)}h old)`);

    const subject = getReminderSubject(stage);
    const body = getReminderBody(user, stage);
    const sent = await sendEmail(user.email, subject, body);

    if (sent) {
      await query("UPDATE users SET reminders_sent = $1 WHERE id = $2", [stage + 1, user.user_id]);
    }
  }

  console.log("[Reminder] Done.");
  process.exit(0);
}

run().catch(err => {
  console.error("[Reminder] Fatal:", err);
  process.exit(1);
});
