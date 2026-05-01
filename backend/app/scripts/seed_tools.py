from app.core.database import Base, SessionLocal, engine
from app.models.tool import Tool, ToolCategory
import app.models  # noqa: F401 - ensure model registration


SEED_TOOLS = [
    {
        "name": "Torque Wrench",
        "category": ToolCategory.hand_tool,
        "description": "Used to tighten bolts and nuts to a specified torque value.",
        "serial_number": "TW-001",
        "marker_id": None,
    },
    {
        "name": "Voltage Tester",
        "category": ToolCategory.diagnostic,
        "description": "Checks for presence of electrical voltage in circuits.",
        "serial_number": "VT-002",
        "marker_id": None,
    },
    {
        "name": "Digital Caliper",
        "category": ToolCategory.measuring,
        "description": "Measures internal and external dimensions with high precision.",
        "serial_number": "DC-003",
        "marker_id": None,
    },
    {
        "name": "Cordless Drill",
        "category": ToolCategory.power_tool,
        "description": "Battery-powered drill for fastening and boring operations.",
        "serial_number": "CD-004",
        "marker_id": None,
    },
    {
        "name": "Hard Hat",
        "category": ToolCategory.safety,
        "description": "Personal protective equipment — mandatory in all operational zones.",
        "serial_number": "HH-005",
        "marker_id": None,
    },
]


def seed_tools() -> None:
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        for data in SEED_TOOLS:
            existing = db.query(Tool).filter(Tool.serial_number == data["serial_number"]).first()

            if existing:
                existing.name = data["name"]
                existing.category = data["category"]
                existing.description = data["description"]
                existing.is_available = True
            else:
                db.add(
                    Tool(
                        name=data["name"],
                        category=data["category"],
                        description=data["description"],
                        serial_number=data["serial_number"],
                        marker_id=data["marker_id"],
                        is_available=True,
                    )
                )

        db.commit()

        tools = db.query(Tool).order_by(Tool.id).all()
        print("Seed complete. Current tools:")
        for tool in tools:
            marker = tool.marker_id or "unassigned"
            print(f"  - [{tool.serial_number}] {tool.name} ({tool.category.value}) marker={marker}")
        print()
        print("Assign marker IDs to each tool via the Tool Management page in the app.")
    finally:
        db.close()


if __name__ == "__main__":
    seed_tools()
