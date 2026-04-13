from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password
from app.models.user import User, UserRole
import app.models  # noqa: F401 - ensure model registration


SEED_USERS = [
    {
        "email": "admin@test.com",
        "full_name": "Test Admin",
        "role": UserRole.admin,
        "password": "Admin123!",
    },
    {
        "email": "supervisor@test.com",
        "full_name": "Test Supervisor",
        "role": UserRole.supervisor,
        "password": "Supervisor123!",
    },
    {
        "email": "tech@test.com",
        "full_name": "Test Technician",
        "role": UserRole.technician,
        "password": "Tech123!",
    },
]


def seed_users() -> None:
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        for data in SEED_USERS:
            existing = db.query(User).filter(User.email == data["email"]).first()
            hashed = hash_password(data["password"])

            if existing:
                existing.full_name = data["full_name"]
                existing.role = data["role"]
                existing.hashed_password = hashed
                existing.is_active = True
            else:
                db.add(
                    User(
                        email=data["email"],
                        full_name=data["full_name"],
                        role=data["role"],
                        hashed_password=hashed,
                        is_active=True,
                    )
                )

        db.commit()

        users = db.query(User).order_by(User.id).all()
        print("Seed complete. Current users:")
        for user in users:
            print(f"- {user.email} ({user.role.value}) active={user.is_active}")
    finally:
        db.close()


if __name__ == "__main__":
    seed_users()
