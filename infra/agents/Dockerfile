FROM node:24.21.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global opencode-ai@1.19.3 \
    && npm cache clean --force
ENV HOME=/tmp/agent-home XDG_CONFIG_HOME=/tmp/agent-config XDG_DATA_HOME=/tmp/agent-data \
    XDG_CACHE_HOME=/tmp/agent-cache OPENCODE_DISABLE_AUTOUPDATE=true \
    OPENCODE_DISABLE_DEFAULT_PLUGINS=true OPENCODE_DISABLE_PROJECT_CONFIG=true
USER node
WORKDIR /workspace
ENTRYPOINT ["opencode"]
