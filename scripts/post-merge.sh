#!/bin/bash
set -e
npm install --no-audit
npm run db:push
