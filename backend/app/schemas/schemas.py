from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import date, datetime

# User Schemas
class UserBase(BaseModel):
    username: str
    full_name: str
    role: str = Field(..., pattern="^(admin|trainer)$")

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    is_active: Optional[bool] = None

class UserResponse(UserBase):
    id: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

# Auth Schemas
class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str

class TokenRefreshRequest(BaseModel):
    refresh_token: str

class TokenData(BaseModel):
    username: Optional[str] = None

class LoginRequest(BaseModel):
    username: str
    password: str

# Trainer Schemas
class TrainerBase(BaseModel):
    first_name: str
    last_name: str
    phone: Optional[str] = None
    specialization: Optional[str] = None

class TrainerCreate(TrainerBase):
    user_id: Optional[int] = None

class TrainerUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    specialization: Optional[str] = None

class TrainerResponse(TrainerBase):
    id: int
    user_id: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True

# Group Schemas
class GroupBase(BaseModel):
    name: str
    schedule: Optional[str] = None
    lesson_type: str = "gymnastics"
    is_individual: bool = False
    trainer_id: Optional[int] = None

class GroupCreate(GroupBase):
    pass

class GroupUpdate(BaseModel):
    name: Optional[str] = None
    schedule: Optional[str] = None
    lesson_type: Optional[str] = None
    is_individual: Optional[bool] = None
    trainer_id: Optional[int] = None
    is_active: Optional[bool] = None

class GroupResponse(GroupBase):
    id: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

# Student Schemas
class StudentBase(BaseModel):
    first_name: str
    last_name: str
    birth_date: date
    phone_parent: str
    telegram_parent: Optional[str] = None
    group_id: Optional[int] = None
    trainer_id: Optional[int] = None
    insurance_start: Optional[date] = None
    insurance_end: Optional[date] = None
    medical_certificate: bool = False
    notes: Optional[str] = None

class StudentCreate(StudentBase):
    pass

class StudentUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    birth_date: Optional[date] = None
    phone_parent: Optional[str] = None
    telegram_parent: Optional[str] = None
    group_id: Optional[int] = None
    trainer_id: Optional[int] = None
    insurance_start: Optional[date] = None
    insurance_end: Optional[date] = None
    medical_certificate: Optional[bool] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None

class StudentResponse(StudentBase):
    id: int
    photo: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True

class AssignmentStudentResponse(StudentResponse):
    is_present: bool = False
    is_paid: bool = False
    attendance_id: Optional[int] = None
    payment_choice: Optional[str] = None

    class Config:
        from_attributes = True

# Attendance Schemas
class AttendanceBase(BaseModel):
    student_id: int
    date: date
    status: str = Field(..., pattern="^(present|absent|sick|excused)$")
    group_id: Optional[int] = None
    trainer_id: Optional[int] = None
    payment_choice: Optional[str] = None
    is_paid: bool = False
    notes: Optional[str] = None

class AttendanceCreate(AttendanceBase):
    pass

class AttendanceUpdate(BaseModel):
    payment_choice: Optional[str] = None
    is_paid: Optional[bool] = None
    group_id: Optional[int] = None
    trainer_id: Optional[int] = None
    status: Optional[str] = Field(None, pattern="^(present|absent|sick|excused)$")
    notes: Optional[str] = None

class AttendanceResponse(AttendanceBase):
    id: int
    marked_by: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True

# Subscription Schemas
class SubscriptionBase(BaseModel):
    student_id: int
    pricelist_item_id: int
    classes_remaining: int

class SubscriptionCreate(SubscriptionBase):
    pass

class SubscriptionUpdate(BaseModel):
    classes_remaining: Optional[int] = None
    is_active: Optional[bool] = None

class SubscriptionResponse(SubscriptionBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True

# Payment Schemas
class PaymentBase(BaseModel):
    student_id: int
    amount: float
    payment_date: date
    next_payment_date: Optional[date] = None
    payment_type: str = Field(..., pattern="^(single|subscription|insurance|fund|other)$")
    status: str = Field(default="paid", pattern="^(paid|pending|overdue)$")
    notes: Optional[str] = None

class PaymentCreate(PaymentBase):
    pass

class PaymentUpdate(BaseModel):
    amount: Optional[float] = None
    next_payment_date: Optional[date] = None
    status: Optional[str] = Field(None, pattern="^(paid|pending|overdue)$")
    notes: Optional[str] = None

class PaymentResponse(PaymentBase):
    id: int
    created_by: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True

# Insurance Schemas
class InsuranceBase(BaseModel):
    student_id: int
    insurance_company: Optional[str] = None
    start_date: date
    end_date: date
    notes: Optional[str] = None

class InsuranceCreate(InsuranceBase):
    pass

class InsuranceUpdate(BaseModel):
    insurance_company: Optional[str] = None
    end_date: Optional[date] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None

class InsuranceResponse(InsuranceBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True

# Fund Payment Schemas
class FundPaymentBase(BaseModel):
    student_id: int
    amount: float
    purpose: str
    payment_date: Optional[date] = None
    is_paid: bool = False
    notes: Optional[str] = None

class FundPaymentCreate(FundPaymentBase):
    pass

class FundPaymentUpdate(BaseModel):
    payment_date: Optional[date] = None
    is_paid: Optional[bool] = None
    notes: Optional[str] = None

class FundPaymentResponse(FundPaymentBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

# Notification Schemas
class NotificationBase(BaseModel):
    student_id: int
    type: str = Field(..., pattern="^(payment_reminder|subscription_expiring|insurance_expiring|custom)$")
    message: str
    scheduled_date: date

class NotificationCreate(NotificationBase):
    pass

class NotificationResponse(NotificationBase):
    id: int
    sent_date: Optional[datetime]
    is_sent: bool
    created_at: datetime

    class Config:
        from_attributes = True

# Statistics Schemas
class AttendanceStats(BaseModel):
    student_id: int
    first_name: str
    last_name: str
    total_present: int
    total_absent: int
    total_sick: int
    total_classes: int
    attendance_rate: float

class DashboardStats(BaseModel):
    total_students: int
    active_students: int
    total_groups: int
    today_attendance: int
    students_with_debts: int
    expiring_subscriptions: int
    expiring_insurance: int
    expired_insurance: int

# Assignment Schemas
class AssignmentStudentData(BaseModel):
    student_id: int
    payment_choice: str # 'subscription' або ID ціни

class AssignmentCreate(BaseModel):
    group_id: int
    trainer_id: int
    students_data: List[AssignmentStudentData]
    lesson_date: date

class AssignmentResponse(BaseModel):
    id: int
    lesson_date: date
    is_subscription: bool
    group: GroupResponse
    trainer: TrainerResponse
    students: List[AssignmentStudentResponse]
    price: Optional[BaseModel] = None # Для спрощення

    class Config:
        from_attributes = True
