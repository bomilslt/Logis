"""Seed system permissions

Revision ID: seed_permissions_001
Revises: 
Create Date: 2026-02-12 23:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'seed_permissions_001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # Import et exécution du seed des permissions
    from app.models.permission import seed_system_permissions
    seed_system_permissions()


def downgrade():
    # Suppression des permissions système
    from app import db
    from app.models.permission import Permission
    
    Permission.query.filter_by(is_system=True).delete()
    db.session.commit()
