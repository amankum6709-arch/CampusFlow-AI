from fastapi import APIRouter

router = APIRouter(tags=["system"])


@router.get("/health")
def health():
    return {"status": "ok", "service": "campus-flow-api", "version": "2.0-foundation"}
