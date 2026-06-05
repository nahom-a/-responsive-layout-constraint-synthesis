FROM python:3.13-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=node:22-bookworm-slim /usr/local/bin/node /usr/local/bin/node
RUN node --version | grep -q '^v22\.'

RUN pip install --no-cache-dir pytest==9.1.1 pytest-json-ctrf==0.5.2

COPY . /tests/

RUN node /tests/prebuild_identifiability.mjs && rm -rf /tests/.identifiability_scratch

RUN mkdir -p /app
