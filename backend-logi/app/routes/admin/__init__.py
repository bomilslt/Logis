"""
Routes Admin - Blueprint principal
Regroupe toutes les routes d'administration du tenant
"""

from flask import Blueprint

# Blueprint principal admin
admin_bp = Blueprint('admin', __name__)

# Import des sous-modules après création du blueprint
from app.routes.admin import dashboard
from app.routes.admin import packages
from app.routes.admin import clients
from app.routes.admin import payments
from app.routes.admin import invoices
from app.routes.admin import departures
from app.routes.admin import announcements
from app.routes.admin import staff
from app.routes.admin import settings
from app.routes.admin import notifications
from app.routes.admin import finance
from app.routes.admin import accounting
from app.routes.admin import exports
from app.routes.admin import payment_providers
