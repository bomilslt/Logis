"""
Railway migration script
========================
Runs database migrations on deploy.
If Flask-Migrate is set up, runs `flask db upgrade`.
Otherwise, falls back to `db.create_all()`.
"""
import os
import sys

def main():
    os.environ.setdefault('FLASK_ENV', 'production')
    
    from app import create_app, db
    app = create_app('production')
    
    with app.app_context():
        try:
            # Try Flask-Migrate first
            from flask_migrate import upgrade
            upgrade()
            print("[MIGRATE] Flask-Migrate upgrade completed successfully.")
        except Exception as e:
            # Fallback to create_all
            print(f"[MIGRATE] Flask-Migrate not available or failed ({e}), using db.create_all()...")
            db.create_all()
            print("[MIGRATE] db.create_all() completed successfully.")

if __name__ == '__main__':
    main()
else:
    # When called via `python railway_migrate.py` from Procfile
    main()
