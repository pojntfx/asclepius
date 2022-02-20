FROM node:alpine

RUN apk add rustup cargo build-base cmake
RUN rustup-init -y
RUN ln -s /usr/bin/rustup-init /usr/bin/rustup

RUN mkdir -p /app
WORKDIR /app

COPY cmd package.json package-lock.json /app/

RUN npm ci

CMD node cmd/asclepius.js