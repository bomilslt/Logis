"""
Modèles de l'application
Export centralisé de tous les modèles SQLAlchemy
"""

from app.models.enums import (
    PackageStatus, TransportMode, PackageType, UserRole,
    DepartureStatus, PaymentStatus, PaymentMethod,
    NotificationType, NotificationChannel, AnnouncementType,
    SUPPORTED_CARRIERS, get_carrier_name
)
from app.models.tenant import Tenant
from app.models.user import User, user_warehouses, VALID_ACCESS_MODULES
from app.models.permission import Permission
from app.models.role import Role, role_permissions, user_roles, user_permissions
from app.models.package import Package, PackageHistory
from app.models.notification import Notification
from app.models.departure import Departure
from app.models.payment import Payment, PackagePayment
from app.models.invoice import Invoice
from app.models.announcement import Announcement
from app.models.config import TenantConfig, Warehouse
from app.models.push_subscription import PushSubscription
from app.models.accounting import DepartureExpense, Salary, Expense, OtherIncome
from app.models.template import RecipientTemplate
from app.models.pickup import Pickup
from app.models.otp import OTPCode
from app.models.subscription import SubscriptionPlan, Subscription, SubscriptionPayment, SubscriptionPlanPrice, SubscriptionLog
from app.models.platform_config import PlatformConfig, PlatformPaymentProvider, SuperAdmin, CurrencyRate
from app.models.device import UserDevice, DeviceVerificationLog
from app.models.tenant_payment_provider import TenantPaymentProvider, TENANT_PROVIDER_TEMPLATES
from app.models.support_message import SupportMessage

__all__ = [
    # Enums
    'PackageStatus',
    'TransportMode',
    'PackageType',
    'UserRole',
    'DepartureStatus',
    'PaymentStatus',
    'PaymentMethod',
    'NotificationType',
    'NotificationChannel',
    'AnnouncementType',
    'SUPPORTED_CARRIERS',
    'get_carrier_name',
    # Models
    'Tenant',
    'User', 
    'user_warehouses',
    'VALID_ACCESS_MODULES',
    'Permission',
    'Role',
    'role_permissions',
    'user_roles', 
    'user_permissions',
    'Package',
    'PackageHistory',
    'Notification',
    'Departure',
    'Payment',
    'PackagePayment',
    'Invoice',
    'Announcement',
    'TenantConfig',
    'Warehouse',
    'PushSubscription',
    'DepartureExpense',
    'Salary',
    'Expense',
    'OtherIncome',
    'RecipientTemplate',
    'Pickup',
    'OTPCode',
    # Subscription & Platform
    'SubscriptionPlan',
    'SubscriptionPlanPrice',
    'Subscription',
    'SubscriptionPayment',
    'SubscriptionLog',
    'PlatformConfig',
    'PlatformPaymentProvider',
    'CurrencyRate',
    'SuperAdmin',
    # Devices
    'UserDevice',
    'DeviceVerificationLog',
    # Tenant Payment
    'TenantPaymentProvider',
    'TENANT_PROVIDER_TEMPLATES',
    # Support
    'SupportMessage'
]
