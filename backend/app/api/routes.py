from fastapi import APIRouter
from app.api.endpoints import auth, users, faults, tools, annotations, audit, markers

# All routes are prefixed with /api
router = APIRouter(prefix="/api")

router.include_router(auth.router)
router.include_router(users.router)
router.include_router(faults.router)
router.include_router(markers.router)
router.include_router(tools.router)
router.include_router(annotations.router)
router.include_router(audit.router)
