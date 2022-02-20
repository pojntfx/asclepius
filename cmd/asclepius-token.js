#!/usr/bin/env node

import { MatrixAuth } from "matrix-bot-sdk";

const homeserver = process.env.HOMESERVER;
const username = process.env.USERNAME;
const password = process.env.PASSWORD;

if (!homeserver || !username || !password) {
  console.error(
    "Please set the HOMESERVER, USERNAME and PASSWORD env variables to continue"
  );

  process.exit(1);
}

const auth = new MatrixAuth(homeserver);
const client = await auth.passwordLogin(username, password);

console.log(client.accessToken);
