"""
Routes Super-Admin - Blueprint principal
========================================

Routes d'administration de la plateforme SaaS.
Gère les tenants, abonnements, providers de paiement et configuration globale.
"""

from flask import Blueprint

# Blueprint principal super-admin
superadmin_bp = Blueprint('superadmin', __name__)

# Import des sous-modules après création du blueprint
from app.routes.superadmin import auth
from app.routes.superadmin import tenants
from app.routes.superadmin import plans
from app.routes.superadmin import subscriptions
from app.routes.superadmin import providers
from app.routes.superadmin import dashboard
from app.routes.superadmin import config
from app.routes.superadmin import billing
from app.routes.superadmin import support
