FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_ONLY_BINARY=:all: \
    PIP_NO_BUILD_ISOLATION=1 \
    CARGO_HOME=/app/.cargo \
    RUSTUP_HOME=/app/.rustup

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential rustc cargo pkg-config \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/.cargo /app/.rustup

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --upgrade pip setuptools wheel \
    && pip install --prefer-binary -r requirements.txt

COPY . /app

EXPOSE 8000

CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}"]


