import os

os.environ.setdefault("SECRET_KEY", "campusflow-test-only-secret-key-with-at-least-32-chars")
os.environ.setdefault("DATABASE_URL", "sqlite://")
