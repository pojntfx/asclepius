#!/usr/bin/env node

import { JSONFile, Low } from "lowdb";
import {
  AutojoinRoomsMixin,
  MatrixClient,
  RustSdkCryptoStorageProvider,
  SimpleFsStorageProvider,
} from "matrix-bot-sdk";
import { scheduleJob } from "node-schedule";
import short from "short-uuid";
import tableify from "tableify";
import cronstrue from "cronstrue";

const idGenerator = short();

const homeserver = process.env.HOMESERVER;
const token = process.env.TOKEN;

if (!homeserver || !token) {
  console.error(
    "Please set the HOMESERVER and TOKEN env variables to continue"
  );

  process.exit(1);
}

const state = new SimpleFsStorageProvider("state.json");
const crypto = new RustSdkCryptoStorageProvider("crypto");
const client = new MatrixClient(homeserver, token, state, crypto);
AutojoinRoomsMixin.setupOnClient(client);

const adapter = new JSONFile("storage.json");
const storage = new Low(adapter);

let jobs = [];

const getTraceableSuffix = (roomId, senderId) =>
  `in ${roomId} for user ${senderId}`;

const getHumanCron = (cron) =>
  cronstrue.toString(cron + " *", {
    use24HourTimeFormat: true,
    verbose: true,
  });

const scheduleReminder = async (roomId, senderId, medication, schedule, id) => {
  console.log("Scheduling reminder", getTraceableSuffix(roomId, senderId));

  const job = scheduleJob(schedule, async () => {
    console.log("Sending reminder", getTraceableSuffix(roomId, senderId));

    const reminder = storage.data.reminders.find(
      (r) =>
        r.roomId == roomId &&
        r.senderId == senderId &&
        r.medication == medication &&
        r.schedule == schedule
    );

    if (!reminder) {
      console.error(
        "Could not find reminder with ID",
        id,
        getTraceableSuffix(roomId, senderId)
      );

      return;
    }

    await client.sendText(
      roomId,
      `${reminder.senderId} ⌛ Your medication "${reminder.medication}" is due :)`
    );
  });

  jobs.push({
    id,
    job,
  });
};

const welcomeMessage = `<p>Hey 👋! I'm <strong>Asclepius</strong>, your friendly medication reminder bot 🤖!</p>
<p>I can send you medication reminders based on <a href="https://crontab.guru/">CRON syntax</a>, which works like the following:</p>
<pre>
<code>*    *    *    *    *
┬    ┬    ┬    ┬    ┬
│    │    │    │    │
│    │    │    │    └ day of week (0 - 7) (0 or 7 is Sun)
│    │    │    └───── month (1 - 12)
│    │    └────────── day of month (1 - 31)
│    └─────────────── hour (0 - 23)
└──────────────────── minute (0 - 59)</code>
</pre>
<p>For example, if you want to ➕ schedule the medication "Vitamin D" every morning at 9 AM, type the following: <code>!schedule Vitamin D 0 9 * * *</code>, and I will send you a reminder message accordingly.</p>

<p>Here are some more commands I support:</p>
<ul>
<li>📜 To list your medication reminders, type: <code>!list</code></li>
<li>❌ To delete a medication reminder, type: <code>!unschedule youridhere</code></li>
</ul>

<p>Thats it! If you want to see this info again, type <code>!help</code>.</p>
<p>Asclepius is ✨ Free/Libre and Open Source Software ✨ licensed under the AGPL-3.0 license. For more information, check out the project on GitHub: <a href="https://github.com/pojntfx/asclepius">github.com/pojntfx/asclepius</a></p>
`;

client.on("room.join", async (roomId, event) => {
  console.log("Joined room", roomId);

  await client.replyText(roomId, event, undefined, welcomeMessage);
});

client.on("room.leave", async (roomId) => {
  console.log("Left room", roomId);
});

client.on("room.message", async (roomId, event) => {
  if (event["content"]?.["msgtype"] !== "m.text") return;

  const senderId = event["sender"];
  if (senderId === (await client.getUserId())) return;

  const body = event["content"]["body"];

  if (body?.startsWith("!help")) {
    console.log("Got help message", getTraceableSuffix(roomId, senderId));

    await client.replyText(roomId, event, undefined, welcomeMessage);

    return;
  }

  if (body?.startsWith("!schedule")) {
    console.log("Got schedule message", getTraceableSuffix(roomId, senderId));

    const abort = async () => {
      console.error(
        "Got invalid schedule payload",
        getTraceableSuffix(roomId, senderId)
      );

      await client.replyText(
        roomId,
        event,
        undefined,
        "❓ Sorry, I didn't get that 😔. Please specify a valid schedule, type <code>!help</code> to find out more."
      );
    };

    const matches = body.match(/^(?:!schedule )(.+?)(?= ([0-9|\*|\ ]{7}))/);
    if (!matches) {
      return await abort();
    }

    const medication = body.split("\n")[0]?.split(" ").slice(1, -4).join(" ");
    const schedule = body.split("\n")[0]?.split(" ").slice(-4).join(" ");

    if (!medication || !schedule) {
      return await abort();
    }

    try {
      getHumanCron(schedule); // This also validates it
    } catch (e) {
      return await abort();
    }

    if (
      storage.data.reminders.find(
        (r) =>
          r.roomId == roomId &&
          r.senderId == senderId &&
          r.medication == medication &&
          r.schedule == schedule
      )
    ) {
      await client.replyText(
        roomId,
        event,
        "❗ A reminder for this medication with the same schedule has already been set up 🖊️."
      );

      return;
    }

    const id = idGenerator.new();

    storage.data.reminders.push({
      id,
      roomId,
      senderId,
      medication,
      schedule,
    });

    await storage.write();

    await scheduleReminder(roomId, senderId, medication, schedule, id);

    await client.replyText(
      roomId,
      event,
      undefined,
      `✅ Successfully set up a reminder for medication "${medication}" with schedule <code>${schedule} (${getHumanCron(
        schedule
      )})</code> and ID <code>${id}</code>!`
    );

    return;
  }

  if (body?.startsWith("!list")) {
    console.log("Got list message", getTraceableSuffix(roomId, senderId));

    const output = tableify(
      storage.data.reminders
        .filter((r) => r.roomId == roomId && r.senderId == senderId)
        .map((m) => ({
          ID: m.id,
          Medication: m.medication,
          Schedule: `${m.schedule} (${getHumanCron(m.schedule)})`,
        }))
    );

    await client.replyText(
      roomId,
      event,
      undefined,
      `<p>📜 Here are your current medication reminders:</p>${output}`
    );

    return;
  }

  if (body?.startsWith("!unschedule")) {
    console.log("Got unschedule message", getTraceableSuffix(roomId, senderId));

    const abort = async () => {
      console.error(
        "Got invalid unschedule payload",
        getTraceableSuffix(roomId, senderId)
      );

      await client.replyText(
        roomId,
        event,
        "❓ Sorry, I didn't get that 😔. Please specify a valid ID, type <code>!list</code> to see all scheduled reminders."
      );
    };

    const matches = body.match(/^!unschedule (.*)/);
    if (!matches) {
      return await abort();
    }

    const [_, id] = matches;
    if (!id) {
      return await abort();
    }

    if (
      !storage.data.reminders.find(
        (r) => r.roomId == roomId && r.senderId == senderId && r.id == id
      )
    ) {
      await client.replyText(
        roomId,
        event,
        "🔭 Sorry, I didn't find a reminder whith this ID 😔. Please specify a valid ID, type <code>!list</code> to see all scheduled reminders."
      );

      return;
    }

    storage.data.reminders = storage.data.reminders.filter(
      (r) => !(r.roomId == roomId && r.senderId == senderId && r.id == id)
    );

    await storage.write();

    const job = jobs.find((j) => j.id === id);

    if (job) {
      job.job.cancel();

      jobs = jobs.filter((j) => j.id !== id);
    } else {
      console.error(
        "Could not find active job with ID",
        id,
        getTraceableSuffix(roomId, senderId)
      );
    }

    await client.replyText(
      roomId,
      event,
      undefined,
      `✅ Successfully removed the reminder with ID <code>${id}</code>!`
    );

    return;
  }

  console.error("Got unknown message", getTraceableSuffix(roomId, senderId));

  await client.replyText(
    roomId,
    event,
    undefined,
    "🔭 Sorry, I don't know how to respond to that request 😔. Please type <code>!help</code> to list the available commands."
  );
});

(async () => {
  await storage.read();

  storage.data ||= { reminders: [] };

  await client.start();

  console.log("Asclepius is running and connected to", homeserver);

  storage.data.reminders.forEach((r) =>
    scheduleReminder(r.roomId, r.senderId, r.medication, r.schedule, r.id)
  );
})();
