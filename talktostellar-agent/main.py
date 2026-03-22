"""Main entry point for TalkToStellar Agent."""

import sys
import logging
from pathlib import Path

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent / "src"))

import uvicorn
from api.main import app


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    logger = logging.getLogger(__name__)
    logger.info("🚀 Starting TalkToStellar Agent API...")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
            port=int(os.getenv("PORT", "8000")),
        log_level="info"
    )
