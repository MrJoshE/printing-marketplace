# ==========================================
# Stage 1: Builder (Compiling dependencies)
# ==========================================
FROM python:3.11-slim as builder

# Prevent python from writing pyc files
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system build dependencies
# - gcc/libpq-dev: Required if psycopg needs to build from source (failsafe)
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install python deps
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ==========================================
# Stage 2: Runner (Secure, Lean Image)
# ==========================================
FROM python:3.11-slim

WORKDIR /app

ENV PYOPENGL_PLATFORM=egl

# 1. Install Runtime System Libraries
# - libmagic1: Required by 'puremagic'
# - libgl1-mesa-glx / libxrender1: REQUIRED by 'trimesh' to load 3D files
# - libpq5: Runtime lib for postgres
RUN apt-get update && apt-get install -y \
    libmagic1 \
    libxrender1 \
    libpq5 \
    libgl1 \ 
    libegl1 \ 
    libosmesa6 \
    libgl1-mesa-dev \
    libglu1-mesa \
    freeglut3-dev \
    && rm -rf /var/lib/apt/lists/*
# 2. Copy installed python packages from builder
COPY --from=builder /install /usr/local

# 3. Create non-root user for security
RUN useradd -m workeruser
USER workeruser

# 4. Copy Application Code
COPY . .

# 5. Run
CMD ["python", "main.py"]