"""Type definitions for TalkToStellar agent."""

from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field
from enum import Enum


class IntentType(str, Enum):
    """User intent types."""
    LOGIN = "login"
    ONBOARD = "onboard"
    CONTACTS = "contacts"
    PAYMENT = "payment"
    BALANCE = "balance"
    HISTORY = "history"
    PIX = "pix"
    GENERAL = "general"


class ToolType(str, Enum):
    """Available tool types."""
    LOGIN = "login_user"
    CREATE_ACCOUNT = "create_account"
    LIST_CONTACTS = "list_contacts"
    ADD_CONTACT = "add_contact"
    GET_BALANCE = "get_account_balance"
    GET_HISTORY = "get_operations_history"
    LOOKUP_CONTACT = "lookup_contact"
    BUILD_PAYMENT = "build_payment_xdr"
    SIGN_PAYMENT = "sign_and_submit_xdr"
    BUILD_PATH_PAYMENT = "build_path_payment_xdr"
    INITIATE_PIX = "initiate_pix_deposit"
    CHECK_PIX = "check_deposit_status"


@dataclass
class SessionData:
    """User session data."""
    session_token: str
    user_id: str
    email: str
    public_key: Optional[str] = None


@dataclass
class QueryRequest:
    """User query request."""
    query: str
    session_id: str


@dataclass
class AgentResponse:
    """Agent response structure."""
    message: str
    task: str
    params: Dict[str, Any] = field(default_factory=dict)
    success: bool = True
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert response to dictionary."""
        return {
            "message": self.message,
            "task": self.task,
            "params": self.params,
            "success": self.success
        }


@dataclass
class PaymentData:
    """Pending payment data."""
    xdr: str
    destination: str
    amount: str
    asset_code: str
    memo: str = ""
