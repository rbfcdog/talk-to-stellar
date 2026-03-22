"""Core agent implementation for TalkToStellar."""

from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from typing import Optional, Dict, Any
import re

from talktostellar_agent.config import Config
from talktostellar_agent.tools import AVAILABLE_TOOLS
from talktostellar_agent.types import (
    AgentResponse, IntentType, SessionData, PaymentData, QueryRequest
)


# Global session storage
SESSION_STORAGE: Dict[str, SessionData] = {}
USER_INFO: Dict[str, Any] = {
    "email": "",
    "userPublicKey": "GAW7MQA7YLQLJZF7GD6M7JZWQCB4EGPPC46YSZAXQ7Z5LKLKNYFFOIGU",
    "phone_number": "100000000"
}


class SimpleAgent:
    """LangChain-based agent for intent detection and backend integration."""
    
    def __init__(self, config: Optional[Config] = None):
        """Initialize the agent with configuration."""
        self.config = config or Config.from_env()
        self.config.validate()
        
        self.llm = ChatOpenAI(
            model=self.config.openai_model,
            temperature=self.config.temperature,
            openai_api_key=self.config.openai_api_key
        )
        
        self.tools = AVAILABLE_TOOLS
        
        # Pending payment data
        self.pending_payment: Dict[str, PaymentData] = {}
        self.pending_payment_session: Dict[str, bool] = {}

    def _extract_email(self, text: str) -> Optional[str]:
        """Extract email from text."""
        email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        emails = re.findall(email_pattern, text)
        return emails[0] if emails else None

    def _extract_secret_key(self, text: str) -> Optional[str]:
        """Extract Stellar secret key from text (starts with S and is ~56 chars)."""
        if text.startswith('S') and len(text) > 50:
            return text.strip()
        return None

    def run(self, query: QueryRequest, session_id: str = "default_session") -> AgentResponse:
        """
        Main agent loop that:
        1. Detects user intent
        2. Calls appropriate tools via agent
        3. Returns conversational response
        """
        user_message = query.query
        
        # Check if user is providing secret key for pending payment
        secret_key = self._extract_secret_key(user_message)
        if secret_key and self.pending_payment_session.get(session_id):
            return self._complete_payment(session_id, secret_key)
        
        # Check authentication for protected operations
        session_data = SESSION_STORAGE.get(session_id)
        intent = self._detect_intent(user_message, bool(session_data))
        
        # Public operations (no auth needed)
        if intent == IntentType.LOGIN:
            return self._handle_login(user_message, session_id)
        
        if intent == IntentType.ONBOARD:
            return self._handle_onboard(user_message)
        
        # Protected operations (auth required)
        if not session_data or not session_data.session_token:
            return AgentResponse(
                message="Você precisa fazer login primeiro. Por favor, envie seu email.",
                task=IntentType.LOGIN.value,
                params={"requires_login": True},
                success=False
            )
        
        # Run agent for protected operations
        return self._run_agent(user_message, session_id, session_data.session_token, intent)

    def _detect_intent(self, message: str, authenticated: bool) -> IntentType:
        """Detect user intent from message."""
        message_lower = message.lower()
        
        # Login/onboard intents
        if any(word in message_lower for word in ["login", "logar", "entrar", "autenticar"]):
            return IntentType.LOGIN
        if any(word in message_lower for word in ["onboard", "criar conta", "registar", "cadastrar"]):
            return IntentType.ONBOARD
        
        # Contact operations
        if any(word in message_lower for word in ["contact", "contato", "add", "adicionar", "list", "listar"]):
            return IntentType.CONTACTS
        
        # Payment operations
        if any(word in message_lower for word in ["send", "enviar", "payment", "pagamento", "transfer", "transferir"]):
            return IntentType.PAYMENT
        
        # Balance/history
        if any(word in message_lower for word in ["balance", "saldo", "account"]):
            return IntentType.BALANCE
        if any(word in message_lower for word in ["history", "histórico", "operations", "operações"]):
            return IntentType.HISTORY
        
        # PIX operations
        if any(word in message_lower for word in ["pix", "deposit", "depósito"]):
            return IntentType.PIX
        
        return IntentType.GENERAL

    def _handle_login(self, message: str, session_id: str) -> AgentResponse:
        """Handle login flow."""
        from talktostellar_agent.tools import login_user, list_contacts
        
        email = self._extract_email(message)
        if not email:
            return AgentResponse(
                message="Por favor, forneça um email válido. Exemplo: 'logar com seu.email@exemplo.com'",
                task=IntentType.LOGIN.value,
                success=False
            )
        
        result = login_user.invoke({"email": email})
        
        if isinstance(result, dict) and result.get("success"):
            SESSION_STORAGE[session_id] = SessionData(
                session_token=result.get("sessionToken"),
                user_id=result.get("userId"),
                email=email
            )
            USER_INFO["email"] = email
            USER_INFO["userId"] = result.get("userId")
            
            # Fetch and cache contacts
            contacts = list_contacts.invoke({"session_token": result.get("sessionToken")})
            
            return AgentResponse(
                message=f"Login realizado com sucesso! Bem-vindo, {email}",
                task=IntentType.LOGIN.value,
                params={"email": email, "success": True}
            )
        
        return AgentResponse(
            message=f"Falha no login: {result.get('message') if isinstance(result, dict) else str(result)}",
            task=IntentType.LOGIN.value,
            params={"success": False},
            success=False
        )

    def _handle_onboard(self, message: str) -> AgentResponse:
        """Handle account creation."""
        from talktostellar_agent.tools import create_account
        
        email = self._extract_email(message)
        if not email:
            return AgentResponse(
                message="Por favor, forneça um email válido para criar sua conta.",
                task=IntentType.ONBOARD.value,
                success=False
            )
        
        result = create_account.invoke({"email": email})
        
        if isinstance(result, dict) and result.get("success"):
            USER_INFO["email"] = email
            USER_INFO["userPublicKey"] = result.get("publicKey")
            
            return AgentResponse(
                message=f"Conta criada com sucesso! Seu public key é {result.get('publicKey')}. Sua chave secreta foi enviada por email. Guarde-a com segurança.",
                task=IntentType.ONBOARD.value,
                params={"email": email, "success": True}
            )
        
        return AgentResponse(
            message=f"Falha ao criar conta: {result.get('message') if isinstance(result, dict) else str(result)}",
            task=IntentType.ONBOARD.value,
            params={"success": False},
            success=False
        )

    def _complete_payment(self, session_id: str, secret_key: str) -> AgentResponse:
        """Complete a pending payment with the secret key."""
        from talktostellar_agent.tools import sign_and_submit_xdr
        
        payment_data = self.pending_payment.get(session_id)
        session_data = SESSION_STORAGE.get(session_id)
        
        if not payment_data or not session_data:
            return AgentResponse(
                message="Nenhum pagamento pendente encontrado.",
                task=IntentType.PAYMENT.value,
                success=False
            )
        
        result = sign_and_submit_xdr.invoke({
            "session_token": session_data.session_token,
            "user_id": session_data.user_id,
            "secret_key": secret_key,
            "unsigned_xdr": payment_data.xdr,
            "destination": payment_data.destination,
            "amount": payment_data.amount,
            "asset_code": payment_data.asset_code,
            "memo": payment_data.memo
        })
        
        # Clear pending payment
        self.pending_payment.pop(session_id, None)
        self.pending_payment_session.pop(session_id, None)
        
        if isinstance(result, dict) and result.get("success"):
            return AgentResponse(
                message=f"Pagamento realizado com sucesso! Transaction ID: {result.get('hash')}",
                task=IntentType.PAYMENT.value,
                params={"success": True, "hash": result.get("hash")}
            )
        
        return AgentResponse(
            message=f"Falha ao processar pagamento: {result.get('message') if isinstance(result, dict) else str(result)}",
            task=IntentType.PAYMENT.value,
            params={"success": False},
            success=False
        )

    def _run_agent(self, message: str, session_id: str, session_token: str, intent: IntentType) -> AgentResponse:
        """Run the LangChain agent for authenticated operations."""
        
        system_prompt = f"""You are TalkToStellar, a helpful blockchain assistant. The user is asking for Stellar network operations.

Session Context:
- Authenticated: True
- Session Token: {session_token}
- Intent: {intent.value}

Available actions you can take with the tools:
1. list_contacts - Show user's contacts
2. get_account_balance - Check account balance
3. get_operations_history - Show transaction history
4. add_contact - Add a new contact
5. lookup_contact - Find contact by name
6. build_payment_xdr - Create a payment transaction (requires secret key confirmation)
7. build_path_payment_xdr - Create cross-asset payment
8. initiate_pix_deposit - Start a PIX deposit
9. check_deposit_status - Check deposit status

Based on the user's intent:
1. Use the appropriate tool to get data from the backend
2. Summarize the result in Portuguese in a friendly way

For payment transactions:
- First call build_payment_xdr to prepare the transaction
- Then ask user for their secret key
- Once secret key is provided, call sign_and_submit_xdr

Always respond in Portuguese and be helpful."""
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("human", message),
            MessagesPlaceholder(variable_name="agent_scratchpad"),
        ])
        
        agent = create_tool_calling_agent(self.llm, self.tools, prompt)
        agent_executor = AgentExecutor(
            agent=agent,
            tools=self.tools,
            verbose=self.config.verbose,
            max_iterations=self.config.max_iterations
        )
        
        try:
            result = agent_executor.invoke({
                "input": message,
                "agent_scratchpad": []
            })
            
            output = result.get("output", "Ação realizada com sucesso.")
            
            # Handle payment intent specially
            if intent == IntentType.PAYMENT and "build_payment_xdr" in str(output):
                self.pending_payment_session[session_id] = True
                return AgentResponse(
                    message="Transação preparada! Por favor, forneça sua chave secreta para autorizar o pagamento.",
                    task=IntentType.PAYMENT.value,
                    params={"requires_secret_key": True},
                    success=False
                )
            
            return AgentResponse(
                message=output,
                task=intent.value,
                params={"success": True}
            )
        except Exception as e:
            return AgentResponse(
                message=f"Erro ao processar sua solicitação: {str(e)}",
                task=intent.value,
                params={"success": False, "error": str(e)},
                success=False
            )
