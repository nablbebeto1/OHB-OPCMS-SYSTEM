"""Add must_change_password to users and seed Command Room settings"""
from datetime import datetime
from alembic import op
import sqlalchemy as sa

revision = "0002_command_room_viewer"
down_revision = "0001_initial_opcms"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "must_change_password",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    now = datetime.utcnow()
    defaults = [
        ("commandRoomAutoRotate", "true"),
        ("commandRoomIntervalSec", "15"),
        ("commandRoomEnabledScreens", "1,2,3,4,5"),
        ("commandRoomDefaultScreen", "1"),
        ("commandRoomFullscreenStartup", "false"),
        ("commandRoomDataRefreshSec", "30"),
        ("commandRoomDisplayTitle", "Oromia Health Bureau – Polio Campaign Command Room"),
    ]
    conn = op.get_bind()
    for key, val in defaults:
        conn.execute(
            sa.text(
                "INSERT INTO system_settings (key, value, updated_at) "
                "VALUES (:key, :val, :ts) ON CONFLICT (key) DO NOTHING"
            ),
            {"key": key, "val": val, "ts": now},
        )


def downgrade() -> None:
    conn = op.get_bind()
    for key in [
        "commandRoomAutoRotate",
        "commandRoomIntervalSec",
        "commandRoomEnabledScreens",
        "commandRoomDefaultScreen",
        "commandRoomFullscreenStartup",
        "commandRoomDataRefreshSec",
        "commandRoomDisplayTitle",
    ]:
        conn.execute(sa.text("DELETE FROM system_settings WHERE key = :key"), {"key": key})
    op.drop_column("users", "must_change_password")
