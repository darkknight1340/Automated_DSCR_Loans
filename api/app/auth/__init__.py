"""Authentication module."""

from app.auth.firebase import get_current_user, FirebaseUser, init_firebase

__all__ = ["get_current_user", "FirebaseUser", "init_firebase"]
