# Single image for Locodle: the Rust API also serves the built frontend.
#   docker build -t locodle .
#   docker run -p 3001:3001 -e DATABASE_URL=... locodle

# --- Frontend build ---------------------------------------------------------
FROM node:22-alpine AS frontend
WORKDIR /app
COPY frontend/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY frontend/ ./
RUN npm run build
# Precompress text assets once at build time (served as .br/.gz when accepted)
RUN node -e "\
const fs=require('fs'),path=require('path'),zlib=require('zlib');\
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);\
for(const f of walk('dist')){if(!/\.(js|css|html|svg|txt|json|xml|webmanifest)$/.test(f))continue;\
const b=fs.readFileSync(f);if(b.length<1024)continue;\
fs.writeFileSync(f+'.br',zlib.brotliCompressSync(b,{params:{[zlib.constants.BROTLI_PARAM_QUALITY]:11}}));\
fs.writeFileSync(f+'.gz',zlib.gzipSync(b,{level:9}));}"

# --- Backend build ----------------------------------------------------------
FROM rust:1-slim-bookworm AS backend
WORKDIR /app
# Build dependencies on their own layer so code changes don't rebuild them
COPY backend-rs/Cargo.toml backend-rs/Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs \
    && cargo build --release --locked \
    && rm -rf src
COPY backend-rs/ ./
RUN touch src/main.rs && cargo build --release --locked

# --- Runtime ----------------------------------------------------------------
# distroless/cc: glibc + CA certificates. The debug variant adds a busybox
# shell (~1MB) so Railway commands work whether or not they are shell-wrapped.
FROM gcr.io/distroless/cc-debian12:debug-nonroot
ENTRYPOINT []
WORKDIR /app
COPY --from=backend /app/target/release/locodle-server ./locodle-server
COPY --from=frontend /app/dist ./public
ENV STATIC_DIR=/app/public \
    PORT=3001 \
    # glibc otherwise creates an allocator arena per thread
    MALLOC_ARENA_MAX=2
EXPOSE 3001
CMD ["/app/locodle-server"]
