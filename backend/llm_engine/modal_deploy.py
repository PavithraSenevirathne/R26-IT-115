import modal
from pydantic import BaseModel
from typing import List, Dict

# Defines the core cloud application under a specific name for the Modal dashboard
app = modal.App("cinnamon-agent-api")

# Builds the container environment, installing required libraries and injecting necessary local scripts into the cloud instance
image = (
    modal.Image.debian_slim()
    .pip_install(
        "langchain", "langchain-classic", "langchain-openai", "langchain-community", 
        "langchain-huggingface", "faiss-cpu", "sentence-transformers", 
        "scikit-fuzzy", "numpy", "fastapi", "pypdf", "langchain-text-splitters" # Added pypdf and splitters
    )
    .add_local_file("agent.py", remote_path="/root/agent.py")
    .add_local_file("fuzzy.py", remote_path="/root/fuzzy.py")
    .add_local_file("main.pdf", remote_path="/root/main.pdf")
)

# Validates the incoming API request structure, ensuring a message and an optional conversation history are provided
class ChatRequest(BaseModel):
    message: str
    chat_history: List[Dict[str, str]] = [] 

# Wraps the function as a serverless POST endpoint, binding it to the configured environment and securely loading API keys
@app.function(
    image=image, 
    secrets=[modal.Secret.from_name("cinn-llm-api")]
)
@modal.fastapi_endpoint(method="POST")
def chat_endpoint(request: ChatRequest):
    # Defers imports until runtime in the cloud container to prevent local environment mismatch errors
    from langchain_core.messages import HumanMessage, AIMessage
    from agent import get_agent_executor
    
    # Initializes the language model agent and its toolsets
    agent_executor = get_agent_executor()
    
    # Reconstructs the raw dictionary history into LangChain-compatible message objects to maintain context across multi-turn chats
    formatted_history = []
    for msg in request.chat_history:
        if msg["role"] == "user":
            formatted_history.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "assistant":
            formatted_history.append(AIMessage(content=msg["content"]))

    # Executes the agent pipeline and safely packages the final output or catches any system failures
    try:
        response = agent_executor.invoke({
            "input": request.message,
            "chat_history": formatted_history
        })
        return {"response": response["output"], "status": "success"}
    except Exception as e:
        return {"response": f"System error: {str(e)}", "status": "error"}