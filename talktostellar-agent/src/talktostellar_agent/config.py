"""Configuration management for TalkToStellar agent."""

import os
from dataclasses import dataclass
from dotenv import load_dotenv


@dataclass
class Config:
    """Configuration for TalkToStellar agent."""
    
    # OpenAI Configuration
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4")
    temperature: float = float(os.getenv("TEMPERATURE", "0.5"))
    
    # Backend Configuration
    backend_base_url: str = os.getenv("NODE_API_BASE_URL", "http://localhost:3001")
    internal_api_secret: str = os.getenv("INTERNAL_API_SECRET", "hackathon-secret-2024")
    
    # Agent Configuration
    max_iterations: int = 5
    verbose: bool = os.getenv("VERBOSE", "False").lower() == "true"
    
    # Stellar Configuration
    default_public_key: str = os.getenv("STELLAR_PUBLIC_KEY", "GAW7MQA7YLQLJZF7GD6M7JZWQCB4EGPPC46YSZAXQ7Z5LKLKNYFFOIGU")
    default_phone_number: str = os.getenv("PHONE_NUMBER", "100000000")
    
    @classmethod
    def from_env(cls) -> "Config":
        """Load configuration from environment variables."""
        load_dotenv()
        return cls()
    
    def validate(self) -> bool:
        """Validate that all required configuration is present."""
        if not self.openai_api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")
        return True
