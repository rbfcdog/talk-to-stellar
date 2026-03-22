"""API routes for TalkToStellar agent."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any

from talktostellar_agent.agent import SimpleAgent, SESSION_STORAGE
from talktostellar_agent.types import QueryRequest, AgentResponse


router = APIRouter(prefix="/api/actions", tags=["agent"])


class QueryRequestModel(BaseModel):
    """Request model for agent queries."""
    query: str
    session_id: str = "default_session"


class SessionInfoResponse(BaseModel):
    """Response model for session info."""
    session_id: str
    authenticated: bool
    user_id: str = ""
    email: str = ""


@router.post("/query")
async def query_endpoint(request: QueryRequestModel) -> Dict[str, Any]:
    """
    Process user query through LangChain agent and execute backend operations.
    
    Args:
        request: QueryRequestModel with query and session_id
        
    Returns:
        Agent response with message, task, and params
    """
    try:
        agent = SimpleAgent()
        query_request = QueryRequest(query=request.query, session_id=request.session_id)
        result = agent.run(query_request, session_id=request.session_id)
        return {"result": result.to_dict()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent error: {str(e)}")


@router.get("/session/{session_id}", response_model=SessionInfoResponse)
async def get_session_info(session_id: str) -> SessionInfoResponse:
    """
    Get session information for a given session ID.
    
    Args:
        session_id: The session identifier
        
    Returns:
        Session information including auth status and user details
    """
    session_data = SESSION_STORAGE.get(session_id)
    
    return SessionInfoResponse(
        session_id=session_id,
        authenticated=bool(session_data and session_data.session_token),
        user_id=session_data.user_id if session_data else "",
        email=session_data.email if session_data else ""
    )


@router.post("/logout/{session_id}")
async def logout(session_id: str) -> Dict[str, Any]:
    """
    Logout user and clear session.
    
    Args:
        session_id: The session identifier
        
    Returns:
        Success message
    """
    if session_id in SESSION_STORAGE:
        del SESSION_STORAGE[session_id]
        return {"message": "Logout successful", "success": True}
    
    raise HTTPException(status_code=404, detail="Session not found")


@router.get("/health")
async def health_check() -> Dict[str, str]:
    """
    Health check endpoint.
    
    Returns:
        Health status
    """
    return {"status": "healthy", "service": "talktostellar-agent"}
