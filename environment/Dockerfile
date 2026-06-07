FROM node:22-bookworm-slim

WORKDIR /app

COPY layouts/ /app/layouts/
COPY solve.js /app/solve.js
COPY intrinsics.js /app/intrinsics.js
COPY validate.js /app/validate.js
COPY DSL.md /app/DSL.md
COPY systems.schema.json /app/systems.schema.json
COPY systems.json /app/systems.json

RUN node --version | grep -q '^v22\.'
