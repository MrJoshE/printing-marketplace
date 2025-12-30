# ==========================================
# Stage 1: The Builder (Heavy, Full Toolchain)
# ==========================================
FROM golang:1.24-alpine AS builder

# 1. Install system dependencies (git is often needed for go mod)
RUN apk add --no-cache git

# 2. Set working directory
WORKDIR /app

# 3. Copy dependencies first (Optimization: Caching)
# Docker checks if these files changed. If not, it skips to the next layer.
COPY go.mod go.sum ./

# 4. Download modules (Optimization: BuildKit Cache)
# This mounts a cache volume so re-running this doesn't re-download everything
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

# 5. Copy the rest of the source code
COPY . .

# 6. Build the application (Optimization: Flags)
# CGO_ENABLED=0  -> Disables C bindings (required for 'scratch' image)
# GOOS=linux     -> Target OS
# -ldflags="-s -w" -> Strips debug info (Reduces binary size by ~25%)
RUN --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w" \
    -o main ./cmd/*.go

# ==========================================
# Stage 2: The Runner (Tiny, Production Only)
# ==========================================
# 'scratch' is an empty image. Size: 0MB.
FROM scratch

WORKDIR /

# 7. Copy necessary system files from builder
# We need SSL certs to make HTTPS calls (e.g. to Keycloak)
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# 8. Copy the binary
COPY --from=builder /app/main /main

# 9. (Optional) Copy .env if you aren't using Docker Compose env vars
# COPY .env .

# 10. Run
EXPOSE 8080
CMD ["/main"]