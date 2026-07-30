import os
import jwt
from jwt import PyJWKClient
from fastapi import Header, HTTPException

_jwk_client: PyJWKClient | None = None


def _get_jwk_client() -> PyJWKClient:
    global _jwk_client
    if _jwk_client is None:
        supabase_url = os.environ["SUPABASE_URL"].rstrip("/")
        jwks_url = f"{supabase_url}/auth/v1/.well-known/jwks.json"
        _jwk_client = PyJWKClient(jwks_url)
    return _jwk_client


def get_current_user_id(authorization: str = Header(None)) -> str:
    """FastAPI dependency: verifies the Supabase JWT from the Authorization header
    and returns the authenticated user's UUID (the token's `sub` claim).

    Verifies against Supabase's JWKS endpoint rather than a fixed algorithm/secret,
    so this works whether the project uses legacy HS256 or the newer ES256 signing keys.

    Frontend must send: Authorization: Bearer <supabase_access_token>
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")

    token = authorization.removeprefix("Bearer ").strip()

    try:
        signing_key = _get_jwk_client().get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256", "HS256"],
            audience="authenticated",
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired, please log in again")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid auth token: {e}")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing user id")

    return user_id
