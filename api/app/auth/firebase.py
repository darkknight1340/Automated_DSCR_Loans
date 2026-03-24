"""Firebase Authentication for FastAPI.

Verifies Firebase ID tokens from the Authorization header.
"""

import os
from dataclasses import dataclass
from typing import Optional

import firebase_admin
from firebase_admin import auth, credentials
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

# Security scheme for Bearer token
security = HTTPBearer(auto_error=False)

# Firebase app instance
_firebase_app: Optional[firebase_admin.App] = None


@dataclass
class FirebaseUser:
    """Authenticated Firebase user."""
    uid: str
    email: Optional[str] = None
    name: Optional[str] = None
    email_verified: bool = False


def init_firebase() -> None:
    """Initialize Firebase Admin SDK.

    Uses GOOGLE_APPLICATION_CREDENTIALS env var or FIREBASE_SERVICE_ACCOUNT JSON.
    Falls back to default credentials (useful in Cloud Run).
    """
    global _firebase_app

    if _firebase_app is not None:
        return

    # Check if already initialized
    try:
        _firebase_app = firebase_admin.get_app()
        return
    except ValueError:
        pass

    # Try to initialize with service account JSON from env
    service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT")
    if service_account_json:
        import json
        service_account_info = json.loads(service_account_json)
        cred = credentials.Certificate(service_account_info)
        _firebase_app = firebase_admin.initialize_app(cred)
        return

    # Try GOOGLE_APPLICATION_CREDENTIALS file path
    creds_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if creds_path and os.path.exists(creds_path):
        cred = credentials.Certificate(creds_path)
        _firebase_app = firebase_admin.initialize_app(cred)
        return

    # Fall back to Application Default Credentials (works in Cloud Run)
    try:
        _firebase_app = firebase_admin.initialize_app()
    except Exception as e:
        print(f"Warning: Firebase initialization failed: {e}")
        print("Authentication will be disabled.")


def verify_token(token: str) -> Optional[FirebaseUser]:
    """Verify a Firebase ID token and return user info.

    Args:
        token: The Firebase ID token to verify.

    Returns:
        FirebaseUser if valid, None otherwise.
    """
    if _firebase_app is None:
        return None

    try:
        decoded = auth.verify_id_token(token)
        return FirebaseUser(
            uid=decoded["uid"],
            email=decoded.get("email"),
            name=decoded.get("name"),
            email_verified=decoded.get("email_verified", False),
        )
    except auth.InvalidIdTokenError:
        return None
    except auth.ExpiredIdTokenError:
        return None
    except Exception as e:
        print(f"Token verification error: {e}")
        return None


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> FirebaseUser:
    """FastAPI dependency to get the current authenticated user.

    Usage:
        @app.get("/protected")
        async def protected_route(user: FirebaseUser = Depends(get_current_user)):
            return {"uid": user.uid}

    Raises:
        HTTPException: 401 if not authenticated.
    """
    # Check if auth is disabled (for local development)
    if os.getenv("DISABLE_AUTH", "").lower() == "true":
        return FirebaseUser(uid="dev-user", email="dev@localhost", name="Dev User")

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = verify_token(credentials.credentials)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[FirebaseUser]:
    """FastAPI dependency for optional authentication.

    Returns None if not authenticated instead of raising an exception.
    Useful for endpoints that work differently for authenticated users.
    """
    if credentials is None:
        return None

    return verify_token(credentials.credentials)
