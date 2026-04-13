"""
AR Annotation endpoints.

GET    /api/annotations              — list annotations (filter by fault/marker)
POST   /api/annotations              — create annotation
GET    /api/annotations/{id}         — get annotation
PUT    /api/annotations/{id}         — update annotation
DELETE /api/annotations/{id}         — delete annotation
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import get_db
from app.models.user import User, UserRole
from app.models.annotation import ARAnnotation
from app.schemas.annotation import AnnotationCreate, AnnotationUpdate, AnnotationResponse
from app.api.deps import get_current_user

router = APIRouter(prefix="/annotations", tags=["annotations"])


@router.get("", response_model=List[AnnotationResponse])
def list_annotations(
    fault_id: Optional[int] = Query(None),
    ar_marker_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(ARAnnotation)
    if fault_id:
        q = q.filter(ARAnnotation.fault_id == fault_id)
    if ar_marker_id:
        q = q.filter(ARAnnotation.ar_marker_id == ar_marker_id)
    return q.order_by(ARAnnotation.created_at.desc()).all()


@router.post("", response_model=AnnotationResponse, status_code=status.HTTP_201_CREATED)
def create_annotation(
    payload: AnnotationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    annotation = ARAnnotation(**payload.model_dump(), created_by_id=current_user.id)
    db.add(annotation)
    db.commit()
    db.refresh(annotation)
    return annotation


@router.get("/{annotation_id}", response_model=AnnotationResponse)
def get_annotation(
    annotation_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    annotation = db.query(ARAnnotation).filter(ARAnnotation.id == annotation_id).first()
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")
    return annotation


@router.put("/{annotation_id}", response_model=AnnotationResponse)
def update_annotation(
    annotation_id: int,
    payload: AnnotationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    annotation = db.query(ARAnnotation).filter(ARAnnotation.id == annotation_id).first()
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")

    # Only creator or admin can edit
    if annotation.created_by_id != current_user.id and current_user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(annotation, field, value)
    db.commit()
    db.refresh(annotation)
    return annotation


@router.delete("/{annotation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_annotation(
    annotation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    annotation = db.query(ARAnnotation).filter(ARAnnotation.id == annotation_id).first()
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")

    if annotation.created_by_id != current_user.id and current_user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    db.delete(annotation)
    db.commit()
