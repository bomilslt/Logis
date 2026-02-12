"""Sync routes - Endpoints pour la synchronisation par snapshots.

Ces endpoints permettent le push/pull de snapshots complets
pour la version offline de l'application.

Requirements: 3.2, 4.1
"""
from flask import Blueprint, request, jsonify, g

from app.services.auth_service import auth_required
from app.services.sync_service import SyncService

sync_bp = Blueprint('sync', __name__, url_prefix='/api/sync')

@sync_bp.route('/push', methods=['POST'])
@auth_required
def push_data():
    """Receive data from offline client."""
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'No data provided'}), 400
        
    # auth_required decorator sets g.store_id and g.current_user
    store_id = g.store_id
    user_id = g.user_id if hasattr(g, 'user_id') else None
    
    result = SyncService.handle_push(data, store_id, user_id)
    return jsonify(result)

@sync_bp.route('/pull', methods=['GET'])
@auth_required
def pull_data():
    """Send latest data to offline client."""
    store_id = g.store_id
    # Optional: get last_sync timestamp from query params if sending delta updates
    # last_sync = request.args.get('last_sync')
    
    result = SyncService.handle_pull(store_id)
    return jsonify({'success': True, 'data': result})