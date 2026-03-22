"""Tests for TalkToStellar agent."""

import pytest
from src.talktostellar_agent import SimpleAgent
from src.talktostellar_agent.types import QueryRequest, IntentType


class TestSimpleAgent:
    """Test SimpleAgent functionality."""
    
    @pytest.fixture
    def agent(self):
        """Create agent instance."""
        return SimpleAgent()
    
    def test_agent_initialization(self, agent):
        """Test agent initializes correctly."""
        assert agent is not None
        assert agent.llm is not None
        assert len(agent.tools) == 12
    
    def test_intent_detection_login(self, agent):
        """Test intent detection for login."""
        intent = agent._detect_intent("login with email@example.com", False)
        assert intent == IntentType.LOGIN
    
    def test_intent_detection_payment(self, agent):
        """Test intent detection for payment."""
        intent = agent._detect_intent("send 100 USDC to Alice", True)
        assert intent == IntentType.PAYMENT
    
    def test_intent_detection_balance(self, agent):
        """Test intent detection for balance."""
        intent = agent._detect_intent("what's my balance?", True)
        assert intent == IntentType.BALANCE
    
    def test_email_extraction(self, agent):
        """Test email extraction."""
        email = agent._extract_email("login with user@example.com")
        assert email == "user@example.com"
    
    def test_email_extraction_none(self, agent):
        """Test email extraction when none present."""
        email = agent._extract_email("hello world")
        assert email is None
    
    def test_secret_key_extraction(self, agent):
        """Test Stellar secret key extraction."""
        secret = "SBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
        extracted = agent._extract_secret_key(secret)
        assert extracted == secret
    
    def test_secret_key_extraction_invalid(self, agent):
        """Test that invalid secret key returns None."""
        extracted = agent._extract_secret_key("this is not a secret key")
        assert extracted is None


class TestQueryRequest:
    """Test QueryRequest type."""
    
    def test_query_request_creation(self):
        """Test creating a QueryRequest."""
        req = QueryRequest(query="test", session_id="session_1")
        assert req.query == "test"
        assert req.session_id == "session_1"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
