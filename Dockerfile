FROM node:alpine

RUN apk add rustup cargo build-base cmake
RUN rustup-init -y
RUN ln -s /usr/bin/rustup-init /usr/bin/rustup

RUN mkdir -p /app
WORKDIR /app

COPY cmd cmd
COPY package.json package-lock.json /app/

RUN npm ci

RUN mkdir -p /data
WORKDIR /data

CMD node /app/cmd/asclepius.js
