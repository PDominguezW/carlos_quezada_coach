import { config } from "../config.js";
import twilio from "twilio";

export function sendWhatsApp(to, body) {
  const { accountSid, authToken, whatsappNumber } = config.twilio;
  if (!accountSid || !authToken) return false;
  const client = twilio(accountSid, authToken);
  const toNorm = to.startsWith("+") ? to : `+${to}`;
  client.messages.create({
    body,
    from: whatsappNumber,
    to: `whatsapp:${toNorm}`,
  }).catch(() => false);
  return true;
}
