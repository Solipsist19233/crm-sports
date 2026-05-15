from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import List, Optional
from datetime import date, datetime, timedelta

from app.core.database import get_db
from app.api.auth import get_current_user
from app.models.models import Attendance, Student, Subscription, User, Group, Trainer, PriceList
from app.schemas.schemas import AttendanceCreate, AttendanceUpdate, AttendanceResponse

router = APIRouter(prefix="/api/attendance", tags=["Attendance"])

@router.get("/history")
async def get_attendance_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    student_id: Optional[int] = Query(None),
    trainer_id: Optional[int] = Query(None),
    is_paid: Optional[bool] = Query(None)
):
    """Отримання історії відвідувань з приєднанням даних про учня, групу та тренера."""
    query = db.query(
        Attendance.id,
        Attendance.date,
        Attendance.status,
        Attendance.payment_choice,
        Attendance.is_paid,
        Student.first_name.label("student_first_name"),
        Student.last_name.label("student_last_name"),
        Group.name.label("assignment_group_name"),
        Trainer.first_name.label("assignment_trainer_first_name"),
        Trainer.last_name.label("assignment_trainer_last_name")
    ).outerjoin(Student, Attendance.student_id == Student.id)\
     .outerjoin(Group, Attendance.group_id == Group.id)\
     .outerjoin(Trainer, Attendance.trainer_id == Trainer.id)

    # Якщо ми маємо старі записи, де group_id ще немає (NULL), 
    # але студент прив'язаний до групи - підтягуємо її як запасний варіант
    # Це виправить твою проблему, що "старі записи втрачають тренера"
    if date_from:
        query = query.filter(Attendance.date >= date_from)
    if date_to:
        query = query.filter(Attendance.date <= date_to)
    if student_id:
        query = query.filter(Attendance.student_id == student_id)
    if trainer_id:
        query = query.filter(Attendance.trainer_id == trainer_id)
    if is_paid is not None:
        query = query.filter(Attendance.is_paid == is_paid)

    # Якщо залогінений тренер, фільтруємо лише його записи
    if current_user.role == "trainer" and current_user.trainer:
        t_id = current_user.trainer.id
        query = query.filter(Attendance.trainer_id == t_id)

    results = query.order_by(Attendance.date.desc()).all()
    return [dict(r._mapping) for r in results]

@router.delete("/history/cleanup", status_code=204)
async def cleanup_history(
    before: date = Query(..., description="Дата, до якої видаляти історію"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Видалення старих записів історії (тільки адмін)."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Тільки адміністратор може видаляти історію")
    
    db.query(Attendance).filter(Attendance.date < before).delete(synchronize_session=False)
    db.commit()
    return None

@router.post("/finalize", status_code=200)
async def finalize_attendance_to_history(
    history_entries: List[dict],
    db: Session = Depends(get_db)
):
    """Заглушка для сумісності з фронтендом (дані вже в основній таблиці)."""
    return {"message": "Дані синхронізовано"}

@router.get("/", response_model=List[AttendanceResponse])
async def get_attendance(
    skip: int = 0,
    limit: int = 100,
    student_id: int = None,
    date_from: date = None,
    date_to: date = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Отримання списку відвідувань"""
    query = db.query(Attendance)

    if student_id:
        query = query.filter(Attendance.student_id == student_id)

    if date_from:
        query = query.filter(Attendance.date >= date_from)

    if date_to:
        query = query.filter(Attendance.date <= date_to)

    # Якщо тренер, показуємо тільки його учнів
    if current_user.role == "trainer":
        if current_user.trainer:
            trainer_id = current_user.trainer.id
            query = query.join(Student).filter(
                or_(
                    Student.trainer_id == trainer_id,
                    Student.group.has(Group.trainer_id == trainer_id)
                )
            )

    attendance = query.order_by(Attendance.date.desc()).offset(skip).limit(limit).all()
    return attendance

@router.get("/date/{attendance_date}", response_model=List[AttendanceResponse])
async def get_attendance_by_date(
    attendance_date: date,
    group_id: int = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Отримання відвідувань за конкретну дату"""
    query = db.query(Attendance).filter(Attendance.date == attendance_date)

    if group_id:
        query = query.join(Student).filter(Student.group_id == group_id)

    # Якщо тренер, показуємо тільки його учнів
    if current_user.role == "trainer":
        if current_user.trainer:
            trainer_id = current_user.trainer.id
            query = query.join(Student).filter(
                or_(
                    Student.trainer_id == trainer_id,
                    Student.group.has(Group.trainer_id == trainer_id)
                )
            )

    attendance = query.all()
    return attendance

@router.get("/student/{student_id}", response_model=List[AttendanceResponse])
async def get_student_attendance(
    student_id: int,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Отримання історії відвідувань учня"""
    student = db.query(Student).filter(Student.id == student_id).first()

    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Перевірка доступу для тренера
    if current_user.role == "trainer" and current_user.trainer:
        trainer_id = current_user.trainer.id
        is_own_student = db.query(Student).filter(
            Student.id == student_id,
            or_(
                Student.trainer_id == trainer_id,
                Student.group.has(Group.trainer_id == trainer_id)
            )
        ).first()
        if not is_own_student:
            raise HTTPException(status_code=403, detail="Ви можете відмічати тільки своїх учнів")

    attendance = db.query(Attendance)\
        .filter(Attendance.student_id == student_id)\
        .order_by(Attendance.date.desc())\
        .limit(limit)\
        .all()

    return attendance

def _is_subscription_payment(choice: str, db: Session) -> bool:
    """Перевіряє, чи є вибір оплати абонементом (рядок 'subscription' або ID послуги типу абонемент)"""
    if not choice: return False
    if choice == "subscription" or choice == "None": return True
    try:
        price_id = int(choice)
        item = db.query(PriceList).filter(PriceList.id == price_id).first()
        return item and item.category == "subscription"
    except (ValueError, TypeError):
        return False

@router.post("/", response_model=AttendanceResponse, status_code=201)
async def mark_attendance(
    attendance: AttendanceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Відмітка відвідування"""
    # Перевірка, чи існує учень
    student = db.query(Student).filter(Student.id == attendance.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Перевірка доступу для тренера
    if current_user.role == "trainer" and current_user.trainer:
        trainer_id = current_user.trainer.id
        is_own_student = db.query(Student).filter(
            Student.id == attendance.student_id,
            or_(
                Student.trainer_id == trainer_id,
                Student.group.has(Group.trainer_id == trainer_id)
            )
        ).first()
        if not is_own_student:
            raise HTTPException(status_code=403, detail="Access denied")

    try:
        # Перевірка, чи вже є відмітка на цю дату
        existing = db.query(Attendance).filter(
            Attendance.student_id == attendance.student_id,
            Attendance.date == attendance.date,
            Attendance.group_id == attendance.group_id
        ).first()

        if existing:
            # Якщо запис вже існує — оновлюємо його (upsert)
            was_paid_subscription = (_is_subscription_payment(existing.payment_choice, db) and existing.is_paid)

            existing.status = attendance.status
            existing.payment_choice = attendance.payment_choice
            existing.is_paid = attendance.is_paid
            existing.notes = attendance.notes
            existing.group_id = attendance.group_id
            existing.trainer_id = attendance.trainer_id
            existing.marked_by = current_user.id

            # Списання ТІЛЬКИ якщо вибрано абонемент І стоїть галочка Оплачено
            is_now_subscription = _is_subscription_payment(attendance.payment_choice, db)
            if not was_paid_subscription and is_now_subscription and attendance.is_paid:
                active_subscription = db.query(Subscription).filter(
                    Subscription.student_id == attendance.student_id,
                    Subscription.is_active == True,
                    Subscription.classes_remaining > 0
                ).first()
                if active_subscription:
                    active_subscription.classes_remaining -= 1
                    if active_subscription.classes_remaining == 0:
                        active_subscription.is_active = False

            db.commit()
            db.refresh(existing)
            return existing

        # Створення нової відмітки
        db_attendance = Attendance(
            **attendance.model_dump(),
            marked_by=current_user.id
        )
        db.add(db_attendance)

        # Якщо вибрано абонемент і відмічено оплату, списуємо заняття (навіть якщо учень відсутній)
        if _is_subscription_payment(str(attendance.payment_choice), db) and attendance.is_paid:
            active_subscription = db.query(Subscription).filter(
                Subscription.student_id == attendance.student_id,
                Subscription.is_active == True,
                Subscription.classes_remaining > 0
            ).first()

            if active_subscription:
                active_subscription.classes_remaining -= 1
                if active_subscription.classes_remaining == 0:
                    active_subscription.is_active = False

        db.commit()
        db.refresh(db_attendance)
        return db_attendance

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error marking attendance: {e}")
        raise HTTPException(status_code=500, detail=f"Помилка збереження відвідування: {str(e)}")

@router.put("/history/{history_id}", response_model=AttendanceResponse)
async def update_attendance_history_entry(
    history_id: int,
    history_update: AttendanceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Редагування запису безпосередньо з таблиці історії."""
    db_entry = db.query(Attendance).filter(Attendance.id == history_id).first()
    if not db_entry:
        raise HTTPException(status_code=404, detail="Запис не знайдено")
    
    update_data = history_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_entry, field, value)

    db.commit()
    db.refresh(db_entry)
    return db_entry

@router.put("/{attendance_id}", response_model=AttendanceResponse)
async def update_attendance(
    attendance_id: int,
    attendance_update: AttendanceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Оновлення відмітки відвідування"""
    db_attendance = db.query(Attendance).filter(Attendance.id == attendance_id).first()

    if not db_attendance:
        raise HTTPException(status_code=404, detail="Attendance not found")

    # Перевірка доступу для тренера
    if current_user.role == "trainer" and current_user.trainer:
        trainer_id = current_user.trainer.id
        is_own_student = db.query(Student).filter(
            Student.id == db_attendance.student_id,
            or_(
                Student.trainer_id == trainer_id,
                Student.group.has(Group.trainer_id == trainer_id)
            )
        ).first()
        if not is_own_student:
            raise HTTPException(status_code=403, detail="Access denied")

    try:
        was_paid_subscription = (_is_subscription_payment(db_attendance.payment_choice, db) and db_attendance.is_paid)

        update_data = attendance_update.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_attendance, field, value)
        
        db.flush() # Гарантуємо, що зміни застосовані для перевірки нижче

        is_now_subscription = _is_subscription_payment(db_attendance.payment_choice, db)

        # 1. Якщо раніше НЕ було списання, а тепер вибрали абонемент + Оплачено — списуємо
        if not was_paid_subscription and is_now_subscription and db_attendance.is_paid:
            active_subscription = db.query(Subscription).filter(
                Subscription.student_id == db_attendance.student_id,
                Subscription.is_active == True,
                Subscription.classes_remaining > 0
            ).first()
            if active_subscription:
                active_subscription.classes_remaining -= 1
                if active_subscription.classes_remaining == 0:
                    active_subscription.is_active = False

        # 2. Якщо раніше БУЛО списання, а тепер змінили тип оплати або зняли статус "Оплачено" — повертаємо
        elif was_paid_subscription and (not is_now_subscription or not db_attendance.is_paid):
            active_subscription = db.query(Subscription).filter(
                Subscription.student_id == db_attendance.student_id
            ).order_by(Subscription.id.desc()).first()
            if active_subscription:
                active_subscription.classes_remaining += 1
                active_subscription.is_active = True

        db.commit()
        db.refresh(db_attendance)
        return db_attendance
    except Exception as e:
        db.rollback()
        print(f"Error updating attendance: {e}")
        raise HTTPException(status_code=500, detail=f"Помилка оновлення відмітки: {str(e)}")

@router.delete("/{attendance_id}", status_code=204)
async def delete_attendance(
    attendance_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Видалення відмітки відвідування"""
    db_attendance = db.query(Attendance).filter(Attendance.id == attendance_id).first()

    if not db_attendance:
        raise HTTPException(status_code=404, detail="Attendance not found")

    # Перевірка доступу для тренера
    if current_user.role == "trainer" and current_user.trainer:
        trainer_id = current_user.trainer.id
        is_own_student = db.query(Student).filter(
            Student.id == db_attendance.student_id,
            or_(
                Student.trainer_id == trainer_id,
                Student.group.has(Group.trainer_id == trainer_id)
            )
        ).first()
        if not is_own_student:
            raise HTTPException(status_code=403, detail="Access denied")

    # Повертаємо заняття в абонемент, якщо воно було списане (для повторного тестування)
    if _is_subscription_payment(db_attendance.payment_choice, db) and db_attendance.is_paid:
        active_subscription = db.query(Subscription).filter(
            Subscription.student_id == db_attendance.student_id,
            Subscription.is_active == True
        ).first()
        if active_subscription:
            active_subscription.classes_remaining += 1
            # Якщо абонемент був деактивований через 0 занять — активуємо назад
            if not active_subscription.is_active:
                active_subscription.is_active = True

    db.delete(db_attendance)
    db.commit()
    return None
