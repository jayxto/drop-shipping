#!/bin/sh
set -eu
mkdir -p "$DATA_DIR"
chown node:node "$DATA_DIR"
exec gosu node node server/index.js
