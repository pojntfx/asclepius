#!/usr/bin/env node

import { JSONFile, Low } from "lowdb";
import {
  AutojoinRoomsMixin,
  MatrixClient,
  RustSdkCryptoStorageProvider,
  SimpleFsStorageProvider,
} from "matrix-bot-sdk";

// Get configuration from environment
const homeserver = process.env.HOMESERVER;
const token = process.env.TOKEN;
const msg = process.env.MSG;
if (!homeserver || !token || !msg) {
  console.error(
    "Please set the HOMESERVER, TOKEN and MSG env variables to continue"
  );

  process.exit(1);
}

// Connect to Matrix
const state = new SimpleFsStorageProvider("state.json");
const crypto = new RustSdkCryptoStorageProvider("crypto");
const client = new MatrixClient(homeserver, token, state, crypto);
AutojoinRoomsMixin.setupOnClient(client);
const adapter = new JSONFile("storage.json");
const storage = new Low(adapter);

(async () => {
  // Read the existing state
  await storage.read();

  // Initialize the existing state
  storage.data ||= { reminders: [] };

  // Connect to Matrix
  await client.start();

  console.log("Asclepius Maintenance is running and connected to", homeserver);

  // Get joined rooms
  const rooms = await client.getJoinedRooms();

  // Send message to each room
  await Promise.all(rooms.map((roomId) => client.sendText(roomId, msg)));

  // Disconnect from Matrix
  client.stop();
})();
