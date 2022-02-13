#!/usr/bin/env node

import {
  AutojoinRoomsMixin,
  MatrixClient,
  SimpleFsStorageProvider,
} from "matrix-bot-sdk";

const homeserver = process.env.HOMESERVER;
const token = process.env.TOKEN;

if (!homeserver || !token) {
  console.log("Please set the HOMESERVER and TOKEN env variables to continue");

  process.exit(1);
}

const storage = new SimpleFsStorageProvider("state.json");
const client = new MatrixClient(homeserver, token, storage);
AutojoinRoomsMixin.setupOnClient(client);

client.on("room.join", (roomId) => {
  console.log("Joined room", roomId);
});

client.on("room.leave", (roomId) => {
  console.log("Left room", roomId);
});

client.on("room.message", async (roomId, event) => {
  if (!event["content"]?.["msgtype"]) return;

  console.log("Got message", roomId);

  await client.replyNotice(roomId, event, "Hello world!");
});

client
  .start()
  .then(() => console.log("Asclepius is running and connected to", homeserver));
