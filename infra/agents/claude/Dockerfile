FROM node:24.21.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global @anthropic-ai/claude-code@2.1.306 \
    && npm cache clean --force
ENV HOME=/tmp/claude-home CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
USER node
WORKDIR /workspace
ENTRYPOINT ["claude"]
