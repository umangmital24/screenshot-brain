import os
from supabase import create_client, Client

_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_KEY"]
        _client = create_client(url, key)
    return _client


def get_bucket_name() -> str:
    return os.environ.get("SUPABASE_STORAGE_BUCKET", "screenshots")


def get_signed_screenshot_url(storage_path: str, expires_in: int = 3600) -> str:
    """Generates a short-lived signed URL for a screenshot (bucket is private,
    so a permanent public URL no longer works). Default expiry: 1 hour."""
    client = get_client()
    bucket = get_bucket_name()
    result = client.storage.from_(bucket).create_signed_url(storage_path, expires_in)
    return result["signedURL"]
