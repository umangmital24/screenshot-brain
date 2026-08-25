import os
import asyncio
from fastapi import APIRouter, HTTPException, Depends, Request, Header
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

from app.services.db import get_client
from app.services.auth import get_current_user_id

router = APIRouter(prefix="/billing", tags=["billing"])

STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")

# Plan Price IDs (Configured in Stripe Dashboard)
PLAN_PRICES = {
    "pro_monthly": os.environ.get("STRIPE_PRICE_PRO_MONTHLY", "price_pro_monthly"),
    "pro_annual": os.environ.get("STRIPE_PRICE_PRO_ANNUAL", "price_pro_annual"),
    "lifetime": os.environ.get("STRIPE_PRICE_LIFETIME", "price_lifetime_pass"),
}

FREE_TIER_MONTHLY_LIMIT = 30


class CheckoutRequest(BaseModel):
    plan: str = "pro_monthly"  # "pro_monthly" | "pro_annual" | "lifetime"


@router.get("/subscription")
async def get_user_subscription(user_id: str = Depends(get_current_user_id)):
    """Fetch current user tier, quota, and billing status."""
    client = get_client()

    def _fetch_sub():
        try:
            row = client.table("user_subscriptions").select("*").eq("user_id", user_id).execute()
            if row.data and len(row.data) > 0:
                return row.data[0]
        except Exception:
            pass
        return {
            "tier": "free",
            "status": "active",
            "monthly_upload_count": 0,
            "monthly_limit": FREE_TIER_MONTHLY_LIMIT,
        }

    sub = await asyncio.to_thread(_fetch_sub)
    return {
        "tier": sub.get("tier", "free"),
        "status": sub.get("status", "active"),
        "monthly_upload_count": sub.get("monthly_upload_count", 0),
        "monthly_limit": 999999 if sub.get("tier") in ("pro", "lifetime") else FREE_TIER_MONTHLY_LIMIT,
        "is_pro": sub.get("tier") in ("pro", "lifetime"),
    }


@router.post("/checkout-session")
async def create_checkout_session(
    body: CheckoutRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Creates a Stripe Checkout Session URL for upgrading to Pro / Lifetime."""
    if not STRIPE_SECRET_KEY:
        # Development / Sandbox Mode Fallback
        return {
            "url": f"{FRONTEND_URL}?upgraded=mock_success",
            "mode": "sandbox",
            "message": "Stripe key not set; simulated checkout",
        }

    import stripe
    stripe.api_key = STRIPE_SECRET_KEY

    price_id = PLAN_PRICES.get(body.plan, PLAN_PRICES["pro_monthly"])
    mode = "payment" if body.plan == "lifetime" else "subscription"

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{"price": price_id, "quantity": 1}],
            mode=mode,
            client_reference_id=user_id,
            success_url=f"{FRONTEND_URL}?session_id={{CHECKOUT_SESSION_ID}}&billing=success",
            cancel_url=f"{FRONTEND_URL}?billing=canceled",
            metadata={"user_id": user_id, "plan": body.plan},
        )
        return {"url": session.url, "session_id": session.id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Stripe session creation failed: {e}")


@router.post("/portal-session")
async def create_customer_portal_session(user_id: str = Depends(get_current_user_id)):
    """Creates a self-serve Stripe Customer Portal session to manage/cancel subscription."""
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=400, detail="Stripe is not configured in this environment.")

    import stripe
    stripe.api_key = STRIPE_SECRET_KEY
    client = get_client()

    def _get_customer_id():
        row = client.table("user_subscriptions").select("stripe_customer_id").eq("user_id", user_id).execute()
        if row.data and len(row.data) > 0:
            return row.data[0].get("stripe_customer_id")
        return None

    customer_id = await asyncio.to_thread(_get_customer_id)
    if not customer_id:
        raise HTTPException(status_code=400, detail="No active Stripe customer record found.")

    try:
        portal_session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=FRONTEND_URL,
        )
        return {"url": portal_session.url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not open billing portal: {e}")


@router.post("/webhook")
async def stripe_webhook(request: Request, stripe_signature: str = Header(None)):
    """Stripe webhook to listen for successful payments and upgrade users in Supabase."""
    payload = await request.body()

    if not STRIPE_SECRET_KEY:
        return {"status": "ignored"}

    import stripe
    stripe.api_key = STRIPE_SECRET_KEY

    event = None
    if STRIPE_WEBHOOK_SECRET and stripe_signature:
        try:
            event = stripe.Webhook.construct_event(payload, stripe_signature, STRIPE_WEBHOOK_SECRET)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Webhook signature verification failed: {e}")
    else:
        import json
        event = json.loads(payload)

    client = get_client()
    event_type = event.get("type", "")

    if event_type == "checkout.session.completed":
        session = event["data"]["object"]
        user_id = session.get("client_reference_id") or session.get("metadata", {}).get("user_id")
        plan = session.get("metadata", {}).get("plan", "pro_monthly")
        tier = "lifetime" if plan == "lifetime" else "pro"
        customer_id = session.get("customer")
        subscription_id = session.get("subscription")

        if user_id:
            def _upsert_sub():
                client.table("user_subscriptions").upsert({
                    "user_id": user_id,
                    "stripe_customer_id": customer_id,
                    "stripe_subscription_id": subscription_id,
                    "tier": tier,
                    "status": "active",
                }).execute()
            await asyncio.to_thread(_upsert_sub)

    elif event_type in ("customer.subscription.deleted", "customer.subscription.updated"):
        subscription = event["data"]["object"]
        status = subscription.get("status")
        customer_id = subscription.get("customer")

        def _update_status():
            client.table("user_subscriptions").update({
                "status": status,
                "tier": "free" if status in ("canceled", "unpaid") else "pro",
            }).eq("stripe_customer_id", customer_id).execute()
        await asyncio.to_thread(_update_status)

    return {"status": "success"}


# ============================================================================
# RAZORPAY INTEGRATION (India UPI, Cards, NetBanking & Global Cards)
# ============================================================================

RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")

RAZORPAY_PRICES_INR = {
    "pro_monthly": 19900,   # ₹199 in paisa (~$2.40) - 60% PPP Discount
    "pro_annual": 149900,   # ₹1,499 in paisa (~$18.00)
    "lifetime": 299900,     # ₹2,999 in paisa (~$36.00)
}


class RazorpayOrderRequest(BaseModel):
    plan: str = "pro_monthly"  # "pro_monthly" | "pro_annual" | "lifetime"


class RazorpayVerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    plan: str = "pro_monthly"


@router.post("/razorpay/create-order")
async def create_razorpay_order(
    body: RazorpayOrderRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Creates a Razorpay Order for Indian UPI, Cards, NetBanking and Global Cards."""
    amount = RAZORPAY_PRICES_INR.get(body.plan, RAZORPAY_PRICES_INR["pro_monthly"])

    if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
        # Development Sandbox Simulation
        return {
            "order_id": f"order_mock_{user_id[:8]}",
            "amount": amount,
            "currency": "INR",
            "key_id": "rzp_test_mock_sandbox",
            "mode": "sandbox",
        }

    import razorpay
    client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))

    try:
        order = client.order.create({
            "amount": amount,
            "currency": "INR",
            "receipt": f"rcpt_{user_id[:8]}_{int(asyncio.get_event_loop().time())}",
            "notes": {
                "user_id": user_id,
                "plan": body.plan,
            },
        })
        return {
            "order_id": order["id"],
            "amount": order["amount"],
            "currency": order["currency"],
            "key_id": RAZORPAY_KEY_ID,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Razorpay order creation failed: {e}")


@router.post("/razorpay/verify-payment")
async def verify_razorpay_payment(
    body: RazorpayVerifyRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Cryptographically verifies the Razorpay signature and upgrades user in database."""
    if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
        # Mock mode upgrade
        client = get_client()
        tier = "lifetime" if body.plan == "lifetime" else "pro"
        def _mock_upgrade():
            client.table("user_subscriptions").upsert({
                "user_id": user_id,
                "tier": tier,
                "status": "active",
                "stripe_customer_id": f"rzp_mock_{body.razorpay_payment_id}",
            }).execute()
        await asyncio.to_thread(_mock_upgrade)
        return {"status": "success", "tier": tier, "mode": "sandbox"}

    import razorpay
    client_rzp = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))

    params_dict = {
        "razorpay_order_id": body.razorpay_order_id,
        "razorpay_payment_id": body.razorpay_payment_id,
        "razorpay_signature": body.razorpay_signature,
    }

    try:
        client_rzp.utility.verify_payment_signature(params_dict)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid payment signature: {e}")

    tier = "lifetime" if body.plan == "lifetime" else "pro"
    client = get_client()

    def _upgrade_user():
        client.table("user_subscriptions").upsert({
            "user_id": user_id,
            "tier": tier,
            "status": "active",
            "stripe_customer_id": f"rzp_{body.razorpay_payment_id}",
        }).execute()

    await asyncio.to_thread(_upgrade_user)
    return {"status": "success", "tier": tier}


# ============================================================================
# LEMON SQUEEZY INTEGRATION (100% Real Global SaaS for Indian Founders)
# ============================================================================

LEMONSQUEEZY_API_KEY = os.environ.get("LEMONSQUEEZY_API_KEY", "")
LEMONSQUEEZY_STORE_ID = os.environ.get("LEMONSQUEEZY_STORE_ID", "")
LEMONSQUEEZY_WEBHOOK_SECRET = os.environ.get("LEMONSQUEEZY_WEBHOOK_SECRET", "")

LEMONSQUEEZY_VARIANTS = {
    "pro_monthly": os.environ.get("LEMONSQUEEZY_VARIANT_MONTHLY", "variant_monthly"),
    "pro_annual": os.environ.get("LEMONSQUEEZY_VARIANT_ANNUAL", "variant_annual"),
    "lifetime": os.environ.get("LEMONSQUEEZY_VARIANT_LIFETIME", "variant_lifetime"),
}


class LemonSqueezyCheckoutRequest(BaseModel):
    plan: str = "pro_monthly"  # "pro_monthly" | "pro_annual" | "lifetime"


@router.post("/lemonsqueezy/create-checkout")
async def create_lemonsqueezy_checkout(
    body: LemonSqueezyCheckoutRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Creates a Lemon Squeezy Checkout URL for US / European / Global customers.
    Payouts land directly in your Indian bank account with full tax compliance.
    """
    if not LEMONSQUEEZY_API_KEY or not LEMONSQUEEZY_STORE_ID:
        # Development / Sandbox Mode Fallback
        return {
            "url": f"{FRONTEND_URL}?upgraded=lemonsqueezy_mock_success",
            "mode": "sandbox",
            "message": "Lemon Squeezy key not set; simulated checkout",
        }

    variant_id = LEMONSQUEEZY_VARIANTS.get(body.plan, LEMONSQUEEZY_VARIANTS["pro_monthly"])

    import requests
    headers = {
        "Authorization": f"Bearer {LEMONSQUEEZY_API_KEY}",
        "Accept": "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
    }

    payload = {
        "data": {
            "type": "checkouts",
            "attributes": {
                "checkout_data": {
                    "custom": {
                        "user_id": user_id,
                        "plan": body.plan,
                    }
                },
                "product_options": {
                    "redirect_url": f"{FRONTEND_URL}?billing=success",
                },
            },
            "relationships": {
                "store": {
                    "data": {
                        "type": "stores",
                        "id": str(LEMONSQUEEZY_STORE_ID),
                    }
                },
                "variant": {
                    "data": {
                        "type": "variants",
                        "id": str(variant_id),
                    }
                },
            },
        }
    }

    def _call_ls():
        return requests.post("https://api.lemonsqueezy.com/v1/checkouts", json=payload, headers=headers)

    res = await asyncio.to_thread(_call_ls)
    if res.status_code not in (200, 201):
        raise HTTPException(status_code=500, detail=f"Lemon Squeezy error: {res.text}")

    data = res.json()
    checkout_url = data["data"]["attributes"]["url"]
    return {"url": checkout_url}


@router.post("/lemonsqueezy/webhook")
async def lemonsqueezy_webhook(request: Request, x_signature: str = Header(None)):
    """Lemon Squeezy Webhook: Automatically unlocks Pro on subscription / order creation."""
    raw_body = await request.body()

    if LEMONSQUEEZY_WEBHOOK_SECRET and x_signature:
        import hmac
        import hashlib
        digest = hmac.new(LEMONSQUEEZY_WEBHOOK_SECRET.encode(), raw_body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(digest, x_signature):
            raise HTTPException(status_code=400, detail="Invalid Lemon Squeezy signature.")

    import json
    event = json.loads(raw_body)
    event_name = event.get("meta", {}).get("event_name", "")
    custom_data = event.get("meta", {}).get("custom_data", {})
    user_id = custom_data.get("user_id")
    plan = custom_data.get("plan", "pro_monthly")

    client = get_client()

    if event_name in ("order_created", "subscription_created") and user_id:
        tier = "lifetime" if plan == "lifetime" else "pro"
        def _unlock():
            client.table("user_subscriptions").upsert({
                "user_id": user_id,
                "tier": tier,
                "status": "active",
                "stripe_customer_id": f"ls_{event.get('data', {}).get('id')}",
            }).execute()
        await asyncio.to_thread(_unlock)

    elif event_name in ("subscription_cancelled", "subscription_expired") and user_id:
        def _cancel():
            client.table("user_subscriptions").update({
                "status": "canceled",
                "tier": "free",
            }).eq("user_id", user_id).execute()
        await asyncio.to_thread(_cancel)

    return {"status": "success"}


