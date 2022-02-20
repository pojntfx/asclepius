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

// Get configuration from environment
const homeserver = process.env.HOMESERVER;
const token = process.env.TOKEN;
if (!homeserver || !token) {
  console.error(
    "Please set the HOMESERVER and TOKEN env variables to continue"
  );

  process.exit(1);
}

// Connect to Matrix
const idGenerator = short();
const state = new SimpleFsStorageProvider("state.json");
const crypto = new RustSdkCryptoStorageProvider("crypto");
const client = new MatrixClient(homeserver, token, state, crypto);
AutojoinRoomsMixin.setupOnClient(client);
const adapter = new JSONFile("storage.json");
const storage = new Low(adapter);

// Global in-memory state
let jobs = [];

/**
 * Get a traceable suffix for room and sender ID
 * @param {string} roomId Matrix room ID
 * @param {string} senderId Matrix sender ID
 * @returns Traceable suffix
 */
const getTraceableSuffix = (roomId, senderId) =>
  `in ${roomId} for user ${senderId}`;

/**
 * Get a human description of a CRON expression
 * @param {string} cron CRON expression
 * @returns Human description of the CRON expression
 */
const getHumanCron = (cron) =>
  cronstrue.toString(cron + " *", {
    use24HourTimeFormat: true,
    verbose: true,
  });

/**
 *
 * @param {string} roomId Matrix room ID
 * @param {string} senderId Matrix sender ID
 * @param {string} medication Name of the medication
 * @param {string} schedule CRON expression for the reminder
 * @param {string} id ID of the reminder
 */
const scheduleReminder = async (roomId, senderId, medication, schedule, id) => {
  console.log("Scheduling reminder", getTraceableSuffix(roomId, senderId));

  const job = scheduleJob(schedule, async () => {
    console.log("Sending reminder", getTraceableSuffix(roomId, senderId));

    // Check if the reminder exists
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

    // Send the reminder message
    await client.sendText(
      roomId,
      `${reminder.senderId} ⌛ Your medication "${reminder.medication}" is due :)`
    );
  });

  // Add the reminder job to the in-memory database
  jobs.push({
    id,
    job,
  });
};

// Message to send to clients upon first contact with Asclepius
const helpMessage = `<p>Hey 👋! I'm <strong>Asclepius</strong>, your friendly medication reminder bot 🤖!</p>
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

// Send help message to clients upon first contact with Asclepius
client.on("room.join", async (roomId, event) => {
  console.log("Joined room", roomId);

  await client.replyText(roomId, event, undefined, helpMessage);
});

// Log when leaving a room
client.on("room.leave", async (roomId) => {
  console.log("Left room", roomId);
});

// Respond to incoming messages
client.on("room.message", async (roomId, event) => {
  // Ignore non-text messages
  if (event["content"]?.["msgtype"] !== "m.text") return;

  // Ignore messages not directed at Asclepius
  const senderId = event["sender"];
  if (senderId === (await client.getUserId())) return;

  // Get the text body
  const body = event["content"]["body"];

  // Handle help command
  if (body?.startsWith("!help")) {
    console.log("Got help message", getTraceableSuffix(roomId, senderId));

    await client.replyText(roomId, event, undefined, helpMessage);

    return;
  }

  // Handle schedule command
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

    // Parse medication and schedule
    const medication = body.split("\n")[0]?.split(" ").slice(1, -4).join(" ");
    const schedule = body.split("\n")[0]?.split(" ").slice(-4).join(" ");
    if (!medication || !schedule) {
      return await abort();
    }

    // Validate the schedule
    try {
      getHumanCron(schedule); // This also validates it
    } catch (e) {
      return await abort();
    }

    // Abort if the reminder already exists
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

    // Save the reminder to the DB
    const id = idGenerator.new();

    storage.data.reminders.push({
      id,
      roomId,
      senderId,
      medication,
      schedule,
    });

    await storage.write();

    // Schedule the reminder
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

  // Handle list command
  if (body?.startsWith("!list")) {
    console.log("Got list message", getTraceableSuffix(roomId, senderId));

    // Create HTML table of the reminders in the DB
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

  // Handle unschedule command
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

    // Parse the ID
    const matches = body.match(/^!unschedule (.*)/);
    if (!matches) {
      return await abort();
    }

    const [_, id] = matches;
    if (!id) {
      return await abort();
    }

    // Abort if the reminder does not exist
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

    // Remove the reminder from the DB
    storage.data.reminders = storage.data.reminders.filter(
      (r) => !(r.roomId == roomId && r.senderId == senderId && r.id == id)
    );

    await storage.write();

    // Cancel the reminder's job
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

  // Handle unknown commands
  console.error("Got unknown message", getTraceableSuffix(roomId, senderId));

  await client.replyText(
    roomId,
    event,
    undefined,
    "🔭 Sorry, I don't know how to respond to that request 😔. Please type <code>!help</code> to list the available commands."
  );
});

(async () => {
  // Read the existing state
  await storage.read();

  // Initialize the existing state
  storage.data ||= { reminders: [] };

  // Connect to Matrix
  await client.start();

  console.log("Asclepius is running and connected to", homeserver);

  // Add reminders from existing state
  storage.data.reminders.forEach((r) =>
    scheduleReminder(r.roomId, r.senderId, r.medication, r.schedule, r.id)
  );
})();
