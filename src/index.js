import "dotenv/config";
import express from "express";
import { db, getOrCreateUser, getLastMessages, addMessage } from "./db.js";
import { chatWithTools } from "./llm/agent.js";
import { sendWhatsApp } from "./services/whatsapp.js";
import { startScheduler } from "./scheduler.js";
import { config } from "./config.js";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.json({ app: config.appName, status: "ok" });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/webhook/whatsapp", async (req, res) => {
  try {
    const fromNumber = (req.body?.From || req.body?.from || "").replace("whatsapp:", "").trim();
    const msgBody = (req.body?.Body || req.body?.body || "").trim();
    if (!msgBody) {
      res.status(200).send("");
      return;
    }

    const userPhoneNorm = (config.userPhone || "").replace("+", "");
    const fromNorm = fromNumber.replace("+", "");
    if (userPhoneNorm && fromNorm !== userPhoneNorm) {
      res.status(200).send("");
      return;
    }

    const phone = fromNumber.startsWith("+") ? fromNumber : `+${fromNumber}`;
    const user = getOrCreateUser(phone);
    const history = getLastMessages(user.id, 20).map((m) => ({ role: m.role, content: m.content }));

    addMessage(user.id, "user", msgBody);

    let reply;
    const confirmMsg = msgBody.toUpperCase().trim();
    if (user.pending_delete_confirm && (confirmMsg === "SÍ" || confirmMsg === "SI" || confirmMsg === "YES")) {
      const { deleteAllMyData } = await import("./tools/handlers.js");
      reply = deleteAllMyData(db, user.id, {});
    } else {
      reply = await chatWithTools(user.id, db, history, msgBody);
    }

    addMessage(user.id, "assistant", reply);

    if (config.twilio.accountSid && config.twilio.authToken) {
      sendWhatsApp(phone, reply);
    }
  } catch (e) {
    if (config.debug) throw e;
    res.status(500).send(String(e.message));
    return;
  }
  res.status(200).send("");
});

startScheduler();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Entrenadora IA listening on http://localhost:${PORT}`);
});
