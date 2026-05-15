import sys
import os

# Додати backend до Python path
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.core.config import settings
from app.core.database import engine, Base, SessionLocal
from app.api import auth, students, attendance, prices, payments, stats, groups, trainers, users, assignments, subscriptions
from sqlalchemy import text

# Створення таблиць та ініціалізація БД
print("Initializing database...")
Base.metadata.create_all(bind=engine)

# Автоматична ініціалізація адміна при старті
from app.core.security import get_password_hash
from app.models.models import User

db = SessionLocal()
try:
    # Перевірка, чи є хоча б один користувач
    existing_user = db.query(User).first()
    if not existing_user:
        print("Creating default admin user...")
        admin = User(
            username="admin",
            password_hash=get_password_hash("admin123"),
            role="admin",
            full_name="Адміністратор",
            is_active=True
        )
        db.add(admin)
        db.commit()
        print("Default admin created: username='admin', password='admin123'")

    # Гарантуємо наявність всіх колонок в таблиці відвідувань для стабільної роботи історії
    required_columns = [
        ("group_id", "INTEGER"),
        ("trainer_id", "INTEGER"),
        ("is_paid", "BOOLEAN"),
        ("payment_choice", "VARCHAR")
    ]
    for col_name, col_type in required_columns:
        try:
            # Використовуємо EXECUTE для перевірки/додавання
            db.execute(text(f"ALTER TABLE attendance ADD COLUMN {col_name} {col_type}"))
            db.commit()
            print(f"Migration: Column {col_name} successfully added.")
        except Exception:
            db.rollback()

except Exception as e:
    print(f"Error during initialization: {e}")
    db.rollback()
finally:
    db.close()

app = FastAPI(
    title="CRM для спортивної школи",
    description="API для управління учнями, відвідуваннями, оплатами та абонементами",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Дозволити всі origins для розробки
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Підключення роутерів
app.include_router(auth.router)
app.include_router(students.router)
app.include_router(attendance.router)
app.include_router(assignments.router)
app.include_router(prices.router)
app.include_router(payments.router)
app.include_router(stats.router)
app.include_router(groups.router)
app.include_router(trainers.router)
app.include_router(users.router)
app.include_router(subscriptions.router)

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(status_code=204)

# Mount static files (frontend)
frontend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))
print(f"Frontend path: {frontend_path}")
print(f"Frontend exists: {os.path.exists(frontend_path)}")

css_path = os.path.join(frontend_path, "css")
js_path = os.path.join(frontend_path, "js")
images_path = os.path.join(frontend_path, "images")

if os.path.exists(css_path):
    app.mount("/css", StaticFiles(directory=css_path), name="css")
    print("Mounted /css")
if os.path.exists(js_path):
    app.mount("/js", StaticFiles(directory=js_path), name="js")
    print("Mounted /js")
if os.path.exists(images_path):
    app.mount("/images", StaticFiles(directory=images_path), name="images")
    print("Mounted /images")

@app.get("/")
async def serve_frontend():
    login_path = os.path.join(frontend_path, "pages", "login.html")
    if os.path.exists(login_path):
        return FileResponse(login_path)
    return {"error": "Frontend not found", "path": login_path}

@app.get("/{page}.html")
async def serve_page(page: str):
    file_path = os.path.join(frontend_path, "pages", f"{page}.html")
    if os.path.exists(file_path):
        return FileResponse(file_path)
    return {"error": "Page not found", "path": file_path}
