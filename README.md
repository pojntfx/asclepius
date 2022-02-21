# Asclepius

> The Greco-Roman god of medicine

A medication reminder bot for Matrix.

[![Docker CI](https://github.com/pojntfx/asclepius/actions/workflows/docker.yaml/badge.svg)](https://github.com/pojntfx/asclepius/actions/workflows/docker.yaml)
[![Matrix](https://img.shields.io/matrix/asclepius:matrix.org)](https://matrix.to/#/#asclepius:matrix.org?via=matrix.org)

## Installation

> Don't want to self-host the bot? Just add the hosted version on Matrix: [@asclepius-bot:matrix.org](https://matrix.to/#/@asclepius-bot:matrix.org)!

You can get the OCI image like so:

```shell
$ podman pull ghcr.io/pojntfx/asclepius
```

## Usage

### 1. Getting an API Key

First, [create a Matrix account for the bot](https://matrix.org/docs/guides/introduction#how-can-i-try-it-out). Once you've done so, generate an API key:

```shell
$ sudo mkdir -p /var/lib/asclepius
$ podman run -v /var/lib/asclepius:/data:z -e HOMESERVER='https://matrix.org' -e USERNAME='youruser' -e PASSWORD='yourpassword' ghcr.io/pojntfx/asclepius node /app/cmd/asclepius-token.js
```

### 2. Starting the Container

```shell
$ sudo podman run -d --restart=always --label "io.containers.autoupdate=image" -v /var/lib/asclepius:/data:z -e HOMESERVER='https://matrix.org' -e TOKEN='yourtokenfromabove' --name asclepius ghcr.io/pojntfx/asclepius
$ sudo podman generate systemd --new asclepius | sudo tee /lib/systemd/system/asclepius.service

$ sudo systemctl daemon-reload
$ sudo systemctl enable --now asclepius
```

### 3. Testing the Bot

You can now add the bot on Matrix using your preferred client. Once you've added the bot, it should greet you with a welcome message, which you can also show again by typing `!help`.

### 4. Maintenance

You can send maintenance messages to all users who have added Asclepius like so:

```shell
$ podman run -v /var/lib/asclepius:/data:z -e HOMESERVER='https://matrix.org' -e TOKEN='yourtokenfromabove' -e MSG='Going into maintenance mode!' ghcr.io/pojntfx/asclepius node /app/cmd/asclepius-maintenance.js
```

## Reference

### Chat Commands

<p>Hey 👋! I'm <strong>Asclepius</strong>, your friendly medication reminder bot 🤖!</p>
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

### Environment Variables

Asclepius is configured using the following environment variables:

- `HOMESERVER`: The Matrix homeserver to use, i.e. `https://matrix.org`
- `USERNAME`: The Matrix username to use, i.e. `asclepius-bot` (only relevant for `asclepius-token.js`)
- `PASSWORD`: The password for the Matrix user (only relevant for `asclepius-token.js`)
- `TOKEN`: The access token to use (you can get it from `asclepius-token.js`)
- `MSG`: The message to send in maintenance mode (only relevant for `asclepius-maintenance.js`)

## Acknowledgements

- This project would not have been possible without [turt2live/matrix-bot-sdk](https://github.com/turt2live/matrix-bot-sdk), which provides the bot SDK for Matrix. Thanks!
- [node-schedule](https://github.com/node-schedule/node-schedule) provides the CRON implementation
- [bradymholt/cRonstrue](https://github.com/bradymholt/cronstrue) enables the translation of CRON expressions to English
- All the rest of the authors who worked on the dependencies used! Thanks a lot!

## Contributing

To contribute, please use the [GitHub flow](https://guides.github.com/introduction/flow/) and follow our [Code of Conduct](./CODE_OF_CONDUCT.md).

To build and start a development version of Asclepius locally, run the following:

```shell
$ git clone https://github.com/pojntfx/asclepius.git
$ cd asclepius
$ npm i
$ npm link
$ HOMESERVER='https://matrix.org' USERNAME='youruser' PASSWORD='yourpassword' asclepius-token
$ HOMESERVER='https://matrix.org' TOKEN='yourtokenfromabove' asclepius
# Now add the bot on Matrix and start using it!
```

## License

Asclepius (c) 2022 Felicitas Pojtinger and contributors

SPDX-License-Identifier: AGPL-3.0
