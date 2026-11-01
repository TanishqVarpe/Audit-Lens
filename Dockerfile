FROM node:22-bookworm-slim

# Python + Slither + solc for static analysis
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip git curl ca-certificates build-essential \
  && rm -rf /var/lib/apt/lists/* \
  && pip3 install --no-cache-dir --break-system-packages slither-analyzer solc-select \
  && solc-select install 0.8.20 && solc-select use 0.8.20

# Foundry, so "Prove it" exploit tests actually run
RUN curl -L https://foundry.paradigm.xyz | bash && /root/.foundry/bin/foundryup
ENV PATH="/root/.foundry/bin:${PATH}"

# Optional: Rust + Scout for Soroban (large; build with --build-arg INSTALL_SCOUT=true)
ARG INSTALL_SCOUT=false
ENV PATH="/root/.cargo/bin:${PATH}"
RUN if [ "$INSTALL_SCOUT" = "true" ]; then \
      curl https://sh.rustup.rs -sSf | sh -s -- -y --profile minimal \
      && rustup target add wasm32-unknown-unknown \
      && cargo install cargo-scout-audit; \
    fi

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
