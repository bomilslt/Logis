#!/usr/bin/env python3
"""
Seed initial data for LOGi backend.

Creates:
  1. Database tables (if missing)
  2. System permissions & roles
  3. SuperAdmin account (platform-level)
  4. Demo Tenant + admin user + client user
  5. Default subscription plans

Usage:
    python seed.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

from datetime import date, datetime, timedelta
from app import create_app, db


# ── Configuration ────────────────────────────────────────────
SUPERADMIN_EMAIL    = 'franckybomil@gmail.com'
SUPERADMIN_PASSWORD = 'admin123!'
SUPERADMIN_FIRST    = 'Francky'
SUPERADMIN_LAST     = 'Admin'

TENANT_ID    = 'ec-tenant-001'
TENANT_NAME  = 'Express Cargo Demo'
TENANT_SLUG  = 'express-cargo'
TENANT_EMAIL = 'contact@expresscargo.com'
TENANT_PHONE = '+237600000000'

ADMIN_EMAIL    = 'admin@expresscargo.com'
ADMIN_PASSWORD = 'admin123'

CLIENT_EMAIL    = 'client@test.com'
CLIENT_PASSWORD = 'client123'
# ─────────────────────────────────────────────────────────────


def seed():
    env = os.environ.get('FLASK_ENV', 'development')
    app = create_app(env)

    with app.app_context():
        # 1. Create tables
        db.create_all()
        print('✓ Tables créées / vérifiées')

        # 2. System permissions
        from app.models.permission import seed_system_permissions
        seed_system_permissions()
        print('✓ Permissions système')

        # 3. System roles (tenant_id=None)
        from app.models.role import seed_default_roles
        seed_default_roles(tenant_id=None)
        print('✓ Rôles système')

        # 4. SuperAdmin
        from app.models.platform_config import SuperAdmin
        sa = SuperAdmin.query.filter_by(email=SUPERADMIN_EMAIL).first()
        if not sa:
            sa = SuperAdmin(
                email=SUPERADMIN_EMAIL,
                first_name=SUPERADMIN_FIRST,
                last_name=SUPERADMIN_LAST,
                is_primary=True,
                is_active=True,
                permissions=['*'],
            )
            sa.set_password(SUPERADMIN_PASSWORD)
            db.session.add(sa)
            db.session.commit()
            print(f'✓ SuperAdmin créé: {SUPERADMIN_EMAIL} / {SUPERADMIN_PASSWORD}')
        else:
            print(f'✓ SuperAdmin existe déjà: {sa.email}')

        # 5. Tenant
        from app.models.tenant import Tenant
        tenant = Tenant.query.filter_by(id=TENANT_ID).first()
        if not tenant:
            tenant = Tenant(
                id=TENANT_ID,
                name=TENANT_NAME,
                slug=TENANT_SLUG,
                email=TENANT_EMAIL,
                phone=TENANT_PHONE,
                is_active=True,
                settings={
                    'default_origin_country': 'China',
                    'supported_destinations': ['Cameroon', 'Nigeria', 'Senegal', 'Ivory Coast'],
                },
            )
            db.session.add(tenant)
            db.session.commit()
            print(f'✓ Tenant créé: {TENANT_NAME} ({TENANT_ID})')
        else:
            print(f'✓ Tenant existe déjà: {tenant.name}')

        # 6. Roles for tenant
        seed_default_roles(tenant_id=TENANT_ID)
        print(f'✓ Rôles tenant')

        # 7. Admin user
        from app.models.user import User
        from app.models.role import Role
        admin = User.query.filter_by(tenant_id=TENANT_ID, email=ADMIN_EMAIL).first()
        if not admin:
            admin = User(
                tenant_id=TENANT_ID,
                email=ADMIN_EMAIL,
                first_name='Admin',
                last_name='Express',
                role='admin',
                position='Directeur',
                salary=500000,
                hire_date=date(2024, 1, 1),
                is_active=True,
                is_verified=True,
            )
            admin.set_password(ADMIN_PASSWORD)
            admin.permissions = [
                'packages', 'clients', 'payments', 'invoices',
                'reports', 'departures', 'tarifs', 'warehouses',
                'announcements', 'payroll', 'settings',
            ]
            db.session.add(admin)
            db.session.flush()

            admin_role = Role.query.filter_by(tenant_id=TENANT_ID, name='admin').first()
            if admin_role:
                admin.roles.append(admin_role)

            db.session.commit()
            print(f'✓ Admin tenant créé: {ADMIN_EMAIL} / {ADMIN_PASSWORD}')
        else:
            print(f'✓ Admin tenant existe déjà: {admin.email}')

        # 8. Client user
        client = User.query.filter_by(tenant_id=TENANT_ID, email=CLIENT_EMAIL).first()
        if not client:
            client = User(
                tenant_id=TENANT_ID,
                email=CLIENT_EMAIL,
                first_name='Jean',
                last_name='Dupont',
                phone='+237699999999',
                role='client',
                is_active=True,
                is_verified=True,
            )
            client.set_password(CLIENT_PASSWORD)
            db.session.add(client)
            db.session.flush()

            client_role = Role.query.filter_by(tenant_id=TENANT_ID, name='client').first()
            if client_role:
                client.roles.append(client_role)

            db.session.commit()
            print(f'✓ Client créé: {CLIENT_EMAIL} / {CLIENT_PASSWORD}')
        else:
            print(f'✓ Client existe déjà: {client.email}')

        # 9. Default subscription plans
        from app.models.subscription import SubscriptionPlan
        existing_plans = SubscriptionPlan.query.count()
        if existing_plans == 0:
            plans = [
                SubscriptionPlan(
                    code='starter',
                    name='Starter',
                    description='Idéal pour les petites entreprises de livraison',
                    price_monthly=15000,
                    price_yearly=150000,
                    currency='XAF',
                    max_packages_monthly=500,
                    max_staff=3,
                    max_clients=200,
                    allowed_channels=['web_admin', 'web_client'],
                    features=[
                        'Gestion de colis (500/mois)',
                        '3 utilisateurs staff',
                        '200 clients',
                        'Interface web admin + client',
                        'Notifications email',
                        'Support standard',
                    ],
                    trial_days=14,
                    is_active=True,
                    display_order=1,
                ),
                SubscriptionPlan(
                    code='pro',
                    name='Pro',
                    description='Pour les entreprises en croissance',
                    price_monthly=35000,
                    price_yearly=350000,
                    currency='XAF',
                    max_packages_monthly=2000,
                    max_staff=10,
                    max_clients=1000,
                    allowed_channels=['web_admin', 'web_client', 'mobile_client'],
                    features=[
                        'Gestion de colis (2000/mois)',
                        '10 utilisateurs staff',
                        '1000 clients',
                        'Interface web + mobile client',
                        'Notifications WhatsApp',
                        'Rapports avancés',
                        'Support prioritaire',
                    ],
                    trial_days=14,
                    is_active=True,
                    is_popular=True,
                    display_order=2,
                ),
                SubscriptionPlan(
                    code='business',
                    name='Business',
                    description='Solution complète pour les grandes entreprises',
                    price_monthly=75000,
                    price_yearly=750000,
                    currency='XAF',
                    max_packages_monthly=10000,
                    max_staff=50,
                    max_clients=5000,
                    allowed_channels=['web_admin', 'web_client', 'mobile_client', 'desktop_admin'],
                    features=[
                        'Gestion de colis (10 000/mois)',
                        '50 utilisateurs staff',
                        '5000 clients',
                        'Tous les canaux (web + mobile + desktop)',
                        'WhatsApp + Email + SMS',
                        'Rapports personnalisés',
                        'Support dédié',
                    ],
                    trial_days=14,
                    is_active=True,
                    display_order=3,
                ),
                SubscriptionPlan(
                    code='enterprise',
                    name='Enterprise',
                    description='Sur mesure, sans limites',
                    price_monthly=150000,
                    price_yearly=1500000,
                    currency='XAF',
                    max_packages_monthly=-1,
                    max_staff=-1,
                    max_clients=-1,
                    allowed_channels=['web_admin', 'web_client', 'mobile_client', 'desktop_admin', 'api'],
                    features=[
                        'Colis illimités',
                        'Staff illimité',
                        'Clients illimités',
                        'Tous les canaux + API',
                        'Tous les canaux de notification',
                        'White-label',
                        'Support VIP 24/7',
                    ],
                    trial_days=30,
                    is_active=True,
                    display_order=4,
                ),
            ]
            db.session.add_all(plans)
            db.session.commit()
            print(f'✓ {len(plans)} plans créés (starter, pro, business, enterprise)')
        else:
            print(f'✓ {existing_plans} plan(s) déjà présent(s)')

        # 10. Subscription for demo tenant (Starter, active, 30 days)
        from app.models.subscription import Subscription
        sub = Subscription.query.filter_by(tenant_id=TENANT_ID).first()
        if not sub:
            starter = SubscriptionPlan.query.filter_by(code='starter').first()
            if starter:
                now = datetime.utcnow()
                sub = Subscription(
                    tenant_id=TENANT_ID,
                    plan_id=starter.id,
                    status='active',
                    duration_months=1,
                    started_at=now,
                    current_period_start=now,
                    current_period_end=now + timedelta(days=30),
                    payment_method='manual',
                )
                db.session.add(sub)
                db.session.commit()
                print(f'✓ Abonnement Starter activé pour {TENANT_NAME}')
        else:
            print(f'✓ Abonnement existe déjà (status: {sub.status})')

        # Done
        print('\n' + '=' * 50)
        print('SEED TERMINÉ')
        print('=' * 50)
        print(f'\nSuperAdmin:  {SUPERADMIN_EMAIL} / {SUPERADMIN_PASSWORD}')
        print(f'Admin:       {ADMIN_EMAIL} / {ADMIN_PASSWORD}')
        print(f'Client:      {CLIENT_EMAIL} / {CLIENT_PASSWORD}')
        print(f'Tenant ID:   {TENANT_ID}')


if __name__ == '__main__':
    seed()
