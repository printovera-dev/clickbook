# ClickBook API — production image
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    libjpeg62-turbo libopenjp2-7 libtiff6 libwebp7 libheif1 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt && pip install "gunicorn>=22"

COPY . .
RUN mkdir -p /data/storage /var/log/clickbook

# Non-root runtime user
RUN useradd -r -u 10001 clickbook && chown -R clickbook:clickbook /app /data /var/log/clickbook
USER clickbook

EXPOSE 8001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8001/api/health || exit 1

# Production server: gunicorn process manager + uvicorn workers (no --reload, no debug).
CMD ["gunicorn", "server:app", "-c", "deploy/gunicorn.conf.py"]
