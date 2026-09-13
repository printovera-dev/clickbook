# Gunicorn config for ClickBook API (production).
import multiprocessing
import os

bind = "0.0.0.0:8001"
worker_class = "uvicorn.workers.UvicornWorker"
workers = int(os.environ.get("WEB_CONCURRENCY", max(2, min(multiprocessing.cpu_count(), 4))))
threads = 1
timeout = 120                 # image processing + PDF rendering can take a while
graceful_timeout = 30
keepalive = 5
max_requests = 2000           # recycle workers to avoid memory creep from Pillow
max_requests_jitter = 200
preload_app = False           # each worker opens its own Mongo client

accesslog = "-"               # stdout -> docker json-file logs (rotated, see compose)
errorlog = "-"
loglevel = os.environ.get("LOG_LEVEL", "info")
access_log_format = '%(h)s %(l)s %(t)s "%(r)s" %(s)s %(b)s %(L)ss "%(a)s"'
forwarded_allow_ips = "*"     # trust X-Forwarded-* from the nginx container
