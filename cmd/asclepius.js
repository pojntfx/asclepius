#!/usr/bin/env node

import {
  AutojoinRoomsMixin,
  MatrixClient,
  SimpleFsStorageProvider,
  RustSdkCryptoStorageProvider,
} from "matrix-bot-sdk";

const homeserver = process.env.HOMESERVER;
const token = process.env.TOKEN;

if (!homeserver || !token) {
  console.log("Please set the HOMESERVER and TOKEN env variables to continue");

  process.exit(1);
}

const storage = new SimpleFsStorageProvider("state.json");
const crypto = new RustSdkCryptoStorageProvider("crypto");
const client = new MatrixClient(homeserver, token, storage, crypto);
AutojoinRoomsMixin.setupOnClient(client);

client.on("room.join", (roomId) => {
  console.log("Joined room", roomId);
});

client.on("room.leave", (roomId) => {
  console.log("Left room", roomId);
});

client.on("room.message", async (roomId, event) => {
  if (event["content"]?.["msgtype"] !== "m.text") return;
  if (event["sender"] === (await client.getUserId())) return;

  const suffix = `in room ${roomId} from user ${event["sender"]}`;

  const body = event["content"]["body"];
  if (body?.startsWith("!hello")) {
    console.log("Got hello message", suffix);

    const sender = await client.getUserProfile(event["sender"]);

    await client.replyNotice(roomId, event, `Hello, ${sender.displayname}!`);

    return;
  }

  console.log("Got unknown message", suffix);

  const sender = await client.getUserProfile(event["sender"]);

  await client.replyNotice(
    roomId,
    event,
    `Sorry ${sender.displayname}, I don't know how to respond to that request.`
  );
});

client
  .start()
  .then(() => console.log("Asclepius is running and connected to", homeserver));
