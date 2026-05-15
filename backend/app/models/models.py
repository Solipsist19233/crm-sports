from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, ForeignKey, Numeric, Text, CheckConstraint, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

# Таблиця зв'язку Призначення <-> Учні
assignment_students = Table(
    "assignment_students",
    Base.metadata,
    Column("assignment_id", Integer, ForeignKey("assignments.id", ondelete="CASCADE"), primary_key=True),
    Column("student_id", Integer, ForeignKey("students.id", ondelete="CASCADE"), primary_key=True),
    Column("payment_choice", String(50), default="subscription")
)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)
    full_name = Column(String(100), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    trainer = relationship("Trainer", back_populates="user", uselist=False)

    __table_args__ = (
        CheckConstraint("role IN ('admin', 'trainer')", name="check_user_role"),
    )


class Trainer(Base):
    __tablename__ = "trainers"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), unique=True)
    first_name = Column(String(50), nullable=False)
    last_name = Column(String(50), nullable=False)
    phone = Column(String(20))
    specialization = Column(String(100))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="trainer")
    groups = relationship("Group", back_populates="trainer")
    students = relationship("Student", back_populates="trainer")


class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    schedule = Column(Text)
    lesson_type = Column(String(50), default="gymnastics")
    is_individual = Column(Boolean, default=False)
    trainer_id = Column(Integer, ForeignKey("trainers.id", ondelete="SET NULL"))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    trainer = relationship("Trainer", back_populates="groups")
    students = relationship("Student", back_populates="group")


class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String(50), nullable=False)
    last_name = Column(String(50), nullable=False)
    birth_date = Column(Date, nullable=False)
    phone_parent = Column(String(20), nullable=False)
    telegram_parent = Column(String(100))
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="SET NULL"))
    trainer_id = Column(Integer, ForeignKey("trainers.id", ondelete="SET NULL"))
    insurance_start = Column(Date, nullable=True)
    insurance_end = Column(Date, nullable=True)
    medical_certificate = Column(Boolean, default=False)
    has_contract = Column(Boolean, default=False)
    photo = Column(String(255))
    notes = Column(Text)
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    group = relationship("Group", back_populates="students")
    trainer = relationship("Trainer", back_populates="students")
    attendance = relationship("Attendance", back_populates="student", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="student", cascade="all, delete-orphan")
    subscriptions = relationship("Subscription", back_populates="student", cascade="all, delete-orphan")
    insurance = relationship("Insurance", back_populates="student", cascade="all, delete-orphan")
    fund_payments = relationship("FundPayment", back_populates="student", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="student", cascade="all, delete-orphan")


class Attendance(Base):
    __tablename__ = "attendance"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    status = Column(String(20), nullable=False)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="SET NULL"), nullable=True)
    trainer_id = Column(Integer, ForeignKey("trainers.id", ondelete="SET NULL"), nullable=True)
    payment_choice = Column(String(50))
    is_paid = Column(Boolean, default=False)
    notes = Column(Text)
    marked_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    student = relationship("Student", back_populates="attendance")

    __table_args__ = (
        CheckConstraint("status IN ('present', 'absent', 'sick', 'excused')", name="check_attendance_status"),
    )


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    pricelist_item_id = Column(Integer, ForeignKey("price_list.id", ondelete="CASCADE"), nullable=False)
    classes_remaining = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    student = relationship("Student", back_populates="subscriptions")


class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    amount = Column(Numeric(10, 2), nullable=False)
    payment_date = Column(Date, nullable=False, index=True)
    next_payment_date = Column(Date, index=True)
    payment_type = Column(String(50), nullable=False)
    status = Column(String(20), nullable=False, default="paid")
    notes = Column(Text)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    student = relationship("Student", back_populates="payments")

    __table_args__ = (
        CheckConstraint("payment_type IN ('single', 'subscription', 'insurance', 'fund', 'other')", name="check_payment_type"),
        CheckConstraint("status IN ('paid', 'pending', 'overdue')", name="check_payment_status"),
    )


class Insurance(Base):
    __tablename__ = "insurance"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    insurance_company = Column(String(100))
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    is_active = Column(Boolean, default=True, index=True)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    student = relationship("Student", back_populates="insurance")


class FundPayment(Base):
    __tablename__ = "fund_payments"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    amount = Column(Numeric(10, 2), nullable=False)
    purpose = Column(String(200), nullable=False)
    payment_date = Column(Date)
    is_paid = Column(Boolean, default=False)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    student = relationship("Student", back_populates="fund_payments")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(String(50), nullable=False)
    message = Column(Text, nullable=False)
    scheduled_date = Column(Date, nullable=False, index=True)
    sent_date = Column(DateTime(timezone=True))
    is_sent = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    student = relationship("Student", back_populates="notifications")

    __table_args__ = (
        CheckConstraint("type IN ('payment_reminder', 'subscription_expiring', 'insurance_expiring', 'custom')", name="check_notification_type"),
    )


class PriceList(Base):
    __tablename__ = "price_list"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    price = Column(Numeric(10, 2), nullable=False)
    category = Column(String(50), default="subscription")
    description = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False)
    trainer_id = Column(Integer, ForeignKey("trainers.id", ondelete="SET NULL"))
    price_id = Column(Integer, ForeignKey("price_list.id", ondelete="SET NULL"))
    lesson_date = Column(Date, nullable=False, index=True)
    is_subscription = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Зв'язки
    group = relationship("Group")
    trainer = relationship("Trainer")
    price = relationship("PriceList")
    students = relationship("Student", secondary=assignment_students)
