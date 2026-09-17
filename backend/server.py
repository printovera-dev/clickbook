"""ClickBook backend - FastAPI app assembly. All routes are /api/*; logic lives in routers/."""
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

from core import client, now_iso, logger  # loads .env before anything reads it
from storage_manager import STORAGE_BASE
from seed import seed
from routers import auth, catalog, albums, orders, payments, admin, files, notifications

app = FastAPI(title="ClickBook API")
api = APIRouter(prefix="/api")


@api.get("/health")
async def health():
    return {"ok": True, "service": "clickbook", "time": now_iso()}


for r in (auth.router, catalog.router, albums.router, orders.router, payments.router, admin.router, files.router,
          notifications.router):
    api.include_router(r)

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    STORAGE_BASE.mkdir(parents=True, exist_ok=True)
    await seed()
    logger.info("ClickBook API ready.")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
