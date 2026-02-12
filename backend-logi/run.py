import os
from dotenv import load_dotenv
load_dotenv()

env = os.environ.get('FLASK_ENV', 'development')
from app import create_app, db

app = create_app(env)

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=(env == 'development'), port=int(os.environ.get('PORT', 5000)))
