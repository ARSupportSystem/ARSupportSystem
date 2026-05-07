from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
import app.models  # noqa: F401 - register all models with SQLAlchemy
from app.models.tool import Tool
from app.models.user import User, UserRole
import app.api.endpoints.tools as tools_endpoint


def _make_db_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return session_local()


def _user(db, email, role=UserRole.technician):
    user = User(
        email=email,
        full_name=email.split("@")[0],
        hashed_password="fake-hash",
        role=role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _tool(db, owner, name, marker_id):
    tool = Tool(name=name, marker_id=marker_id, owner_id=owner.id)
    db.add(tool)
    db.commit()
    db.refresh(tool)
    return tool


def test_engineer_lists_only_their_own_tools():
    db = _make_db_session()
    try:
        engineer = _user(db, "engineer@example.com")
        other = _user(db, "other@example.com")
        own_tool = _tool(db, engineer, "Phone", "1")
        _tool(db, other, "Wrench", "2")

        tools = tools_endpoint.list_tools(db=db, current_user=engineer)

        assert [tool.id for tool in tools] == [own_tool.id]
    finally:
        db.close()


def test_admin_lists_all_tools():
    db = _make_db_session()
    try:
        admin = _user(db, "admin@example.com", role=UserRole.admin)
        engineer = _user(db, "engineer@example.com")
        other = _user(db, "other@example.com")
        first = _tool(db, engineer, "Phone", "1")
        second = _tool(db, other, "Wrench", "2")

        tools = tools_endpoint.list_tools(db=db, current_user=admin)

        assert {tool.id for tool in tools} == {first.id, second.id}
    finally:
        db.close()


def test_engineer_cannot_delete_another_users_tool():
    db = _make_db_session()
    try:
        engineer = _user(db, "engineer@example.com")
        other = _user(db, "other@example.com")
        other_tool = _tool(db, other, "Wrench", "2")

        try:
            tools_endpoint.delete_tool(tool_id=other_tool.id, db=db, current_user=engineer)
            assert False, "Expected forbidden delete"
        except HTTPException as exc:
            assert exc.status_code == 403
    finally:
        db.close()


def test_same_marker_can_exist_in_different_toolkits():
    db = _make_db_session()
    try:
        engineer = _user(db, "engineer@example.com")
        other = _user(db, "other@example.com")

        first = tools_endpoint.create_tool(
            payload=tools_endpoint.ToolCreate(name="Phone", marker_id="1"),
            db=db,
            current_user=engineer,
        )
        second = tools_endpoint.create_tool(
            payload=tools_endpoint.ToolCreate(name="Phone", marker_id="1"),
            db=db,
            current_user=other,
        )

        assert first.marker_id == second.marker_id == "1"
        assert first.owner_id == engineer.id
        assert second.owner_id == other.id
    finally:
        db.close()


def test_admin_can_create_tool_for_an_engineer():
    db = _make_db_session()
    try:
        admin = _user(db, "admin@example.com", role=UserRole.admin)
        engineer = _user(db, "engineer@example.com")

        tool = tools_endpoint.create_tool(
            payload=tools_endpoint.ToolCreate(name="Phone", marker_id="1", owner_id=engineer.id),
            db=db,
            current_user=admin,
        )

        assert tool.owner_id == engineer.id
    finally:
        db.close()


def test_admin_can_reassign_tool_to_another_engineer():
    db = _make_db_session()
    try:
        admin = _user(db, "admin@example.com", role=UserRole.admin)
        engineer = _user(db, "engineer@example.com")
        other = _user(db, "other@example.com")
        tool = _tool(db, engineer, "Phone", "1")

        updated = tools_endpoint.update_tool(
            tool_id=tool.id,
            payload=tools_endpoint.ToolUpdate(owner_id=other.id),
            db=db,
            current_user=admin,
        )

        assert updated.owner_id == other.id
    finally:
        db.close()


def test_engineer_cannot_reassign_tool():
    db = _make_db_session()
    try:
        engineer = _user(db, "engineer@example.com")
        other = _user(db, "other@example.com")
        tool = _tool(db, engineer, "Phone", "1")

        try:
            tools_endpoint.update_tool(
                tool_id=tool.id,
                payload=tools_endpoint.ToolUpdate(owner_id=other.id),
                db=db,
                current_user=engineer,
            )
            assert False, "Expected forbidden reassignment"
        except HTTPException as exc:
            assert exc.status_code == 403
    finally:
        db.close()
