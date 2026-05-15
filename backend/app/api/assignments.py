from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, timedelta
from app.core.database import get_db # type: ignore
from app.api.auth import get_current_user
from app.models.models import User, Assignment, Student, Group, assignment_students, Attendance # Import Attendance
from app.schemas.schemas import AssignmentCreate, AssignmentResponse, AssignmentStudentData # type: ignore

router = APIRouter(prefix="/api/assignments", tags=["Assignments"])

def _attach_payment_choices(db: Session, assignments: List[Assignment]):
    """Прикріплює payment_choice з таблиці assignment_students до кожного студента в призначеннях"""
    for a in assignments:
        assoc_rows = db.execute(
            assignment_students.select().where(assignment_students.c.assignment_id == a.id)
        ).all()
        payment_map = {row._mapping["student_id"]: row._mapping["payment_choice"] for row in assoc_rows}
        for s in a.students:
            s.payment_choice = payment_map.get(s.id)

@router.get("", response_model=List[AssignmentResponse])
async def get_assignments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    date_from: Optional[date] = Query(None, alias="date_from"),
    date_to: Optional[date] = Query(None, alias="date_to"),
    lesson_date: Optional[date] = Query(None),
    trainer_id: Optional[int] = Query(None, description="Filter assignments by trainer ID")):
    """Отримати всі призначення (з авто-очищенням)"""
    query = db.query(Assignment)

    # Фільтрація за датою (конкретна дата або діапазон)
    if lesson_date:
        query = query.filter(Assignment.lesson_date == lesson_date)
    elif date_from and date_to:
        query = query.filter(Assignment.lesson_date >= date_from, Assignment.lesson_date <= date_to)
    elif date_from:
        query = query.filter(Assignment.lesson_date >= date_from)

    # Тренер бачить лише свої призначення
    if current_user.role == "trainer":
        if current_user.trainer:
            query = query.filter(Assignment.trainer_id == current_user.trainer.id)
    
    assignments = query.order_by(Assignment.lesson_date.asc()).all()
    _attach_payment_choices(db, assignments)
    return assignments

@router.post("", response_model=AssignmentResponse, status_code=201)
async def create_assignment(
    data: AssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Створення призначення (тільки адмін)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Тільки адміністратор може створювати призначення")

    # Перевірка на минулу дату
    if data.lesson_date < date.today():
        raise HTTPException(status_code=400, detail="Не можна призначати заняття на минулу дату")

    try:
        db_assignment = Assignment(
            group_id=data.group_id,
            trainer_id=data.trainer_id,
            lesson_date=data.lesson_date,
        )
        db.add(db_assignment)
        db.flush()

        # Зберігаємо учнів та їх вибір оплати
        for item in data.students_data:
            stmt = assignment_students.insert().values(
                assignment_id=db_assignment.id,
                student_id=item.student_id,
                payment_choice=item.payment_choice
            )
            db.execute(stmt)
        
        db.commit()
        db.refresh(db_assignment)
        _attach_payment_choices(db, [db_assignment])
        return db_assignment
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Помилка створення призначення: {str(e)}")

@router.put("/{id}", response_model=AssignmentResponse)
async def update_assignment(
    id: int,
    data: AssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Оновлення призначення (тільки адмін)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Тільки адміністратор може редагувати призначення")

    db_item = db.query(Assignment).filter(Assignment.id == id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Призначення не знайдено")

    try:
        db_item.group_id = data.group_id
        db_item.trainer_id = data.trainer_id
        db_item.lesson_date = data.lesson_date

        # Видаляємо старі зв'язки з учнями
        db.execute(assignment_students.delete().where(assignment_students.c.assignment_id == id))

        # Додаємо нові зв'язки
        for item in data.students_data:
            stmt = assignment_students.insert().values(
                assignment_id=id,
                student_id=item.student_id,
                payment_choice=item.payment_choice
            )
            db.execute(stmt)

        db.commit()
        db.refresh(db_item)
        _attach_payment_choices(db, [db_item])
        return db_item
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Помилка оновлення призначення: {str(e)}")

@router.delete("/{id}", status_code=204)
async def delete_assignment(id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Немає прав")
    
    db_item = db.query(Assignment).filter(Assignment.id == id).first()
    if db_item:
        db.delete(db_item)
        db.commit()
    return None

@router.delete("", status_code=204)
async def cleanup_assignments(
    before: date = Query(..., description="Дата, до якої видаляти призначення"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Масове видалення старих призначень (тільки адмін)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Тільки адміністратор може видаляти історію")
    
    try:
        # Знаходимо ID всіх призначень, дата яких раніше вказаної
        old_assignments_query = db.query(Assignment.id).filter(Assignment.lesson_date < before)
        ids_to_delete = [r.id for r in old_assignments_query.all()]
        
        if ids_to_delete:
            # Спочатку видаляємо зв'язки в таблиці assignment_students
            db.execute(
                assignment_students.delete().where(
                    assignment_students.c.assignment_id.in_(ids_to_delete)
                )
            )

            # Потім видаляємо самі призначення
            db.query(Assignment).filter(Assignment.id.in_(ids_to_delete)).delete(synchronize_session=False)
            db.commit()
        
        return None
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Помилка при очищенні призначень: {str(e)}")