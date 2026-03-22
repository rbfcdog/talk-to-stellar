"""Tool definitions for TalkToStellar agent - LangChain tools for backend integration."""

from langchain.tools import tool
from typing import Dict, Any
import requests
from talktostellar_agent.config import Config


# Global config
config = Config.from_env()


def _get_headers(session_token: str = "") -> Dict[str, str]:
    """Get HTTP headers for backend requests."""
    headers = {
        "Content-Type": "application/json",
        "x-internal-secret": config.internal_api_secret
    }
    if session_token:
        headers["Authorization"] = f"Bearer {session_token}"
    return headers


def _make_request(method: str, endpoint: str, session_token: str = "", data: Dict[str, Any] = None) -> Dict[str, Any]:
    """Make HTTP request to backend."""
    url = f"{config.backend_base_url}/api/actions/{endpoint}"
    headers = _get_headers(session_token)
    
    try:
        if method.upper() == "POST":
            response = requests.post(url, headers=headers, json=data or {})
        elif method.upper() == "GET":
            response = requests.get(url, headers=headers)
        else:
            return {"success": False, "message": f"Unsupported method: {method}"}
        
        response.raise_for_status()
        return response.json()
    except requests.exceptions.HTTPError as e:
        return {"success": False, "message": f"HTTP Error: {str(e)}"}
    except Exception as e:
        return {"success": False, "message": f"Request failed: {str(e)}"}


# ===== AUTHENTICATION TOOLS =====

@tool
def login_user(email: str) -> dict:
    """Authenticates a user by email and returns a session token."""
    return _make_request("POST", "login", data={"email": email})


@tool
def create_account(email: str) -> dict:
    """Creates a new user account and returns necessary keys."""
    return _make_request("POST", "onboard-user", data={
        "email": email,
        "phone_number": config.default_phone_number,
        "public_key": ""
    })


# ===== CONTACT TOOLS =====

@tool
def list_contacts(session_token: str) -> dict:
    """Lists all contacts for the authenticated user."""
    return _make_request("POST", "list-contacts", session_token=session_token)


@tool
def add_contact(session_token: str, user_id: str, contact_name: str, public_key: str) -> dict:
    """Adds a new contact for the user."""
    return _make_request("POST", "add-contact", session_token=session_token, data={
        "userId": user_id,
        "contact_name": contact_name,
        "public_key": public_key
    })


@tool
def lookup_contact(session_token: str, contact_name: str) -> dict:
    """Looks up a contact by name to get their public key."""
    return _make_request("POST", "lookup-contact-by-name", session_token=session_token, data={
        "contactName": contact_name
    })


# ===== ACCOUNT OPERATION TOOLS =====

@tool
def get_account_balance(session_token: str) -> dict:
    """Gets the current account balance."""
    return _make_request("POST", "get-account-balance", session_token=session_token)


@tool
def get_operations_history(session_token: str) -> dict:
    """Gets the transaction history for the user."""
    return _make_request("POST", "get-operation-history", session_token=session_token)


# ===== PAYMENT TOOLS =====

@tool
def build_payment_xdr(session_token: str, destination: str, amount: str, asset_code: str, memo: str = "") -> dict:
    """Builds a payment transaction XDR."""
    return _make_request("POST", "build-payment-xdr", session_token=session_token, data={
        "sourcePublicKey": config.default_public_key,
        "destination": destination,
        "amount": amount,
        "asset_code": asset_code,
        "memo": memo
    })


@tool
def sign_and_submit_xdr(session_token: str, user_id: str, secret_key: str, unsigned_xdr: str, 
                        destination: str, amount: str, asset_code: str, memo: str = "") -> dict:
    """Signs and submits an XDR transaction."""
    return _make_request("POST", "sign-and-submit-xdr", session_token=session_token, data={
        "secretKey": secret_key,
        "unsignedXdr": unsigned_xdr,
        "operationData": {
            "user_id": user_id,
            "type": "PAYMENT",
            "destination_key": destination,
            "amount": amount,
            "asset_code": asset_code,
            "context": memo
        }
    })


@tool
def build_path_payment_xdr(session_token: str, destination: str, dest_asset: str, 
                           dest_amount: str, source_asset: str) -> dict:
    """Builds a path payment transaction (cross-asset payment)."""
    return _make_request("POST", "build-path-payment-xdr", session_token=session_token, data={
        "sourcePublicKey": config.default_public_key,
        "destination": destination,
        "destAsset": dest_asset,
        "destAmount": dest_amount,
        "sourceAsset": source_asset
    })


# ===== PIX DEPOSIT TOOLS =====

@tool
def initiate_pix_deposit(session_token: str, amount: str, asset_code: str) -> dict:
    """Initiates a PIX deposit."""
    return _make_request("POST", "initiate-pix-deposit", session_token=session_token, data={
        "amount": amount,
        "assetCode": asset_code
    })


@tool
def check_deposit_status(session_token: str, deposit_id: str) -> dict:
    """Checks the status of a PIX deposit."""
    return _make_request("POST", "check-deposit-status", session_token=session_token, data={
        "depositId": deposit_id
    })


# Tool collection for agent
AVAILABLE_TOOLS = [
    login_user,
    create_account,
    list_contacts,
    add_contact,
    lookup_contact,
    get_account_balance,
    get_operations_history,
    build_payment_xdr,
    sign_and_submit_xdr,
    build_path_payment_xdr,
    initiate_pix_deposit,
    check_deposit_status
]
