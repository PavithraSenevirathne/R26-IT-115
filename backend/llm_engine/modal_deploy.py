import modal
from pydantic import BaseModel
from typing import List, Dict, Optional

# Defines the core cloud application under a specific name for the Modal dashboard
app = modal.App("cinnamon-agent-api")

# Builds the container environment, installing required libraries and injecting necessary local scripts into the cloud instance
image = (
    modal.Image.debian_slim()
    .pip_install(
        "langchain", "langchain-classic", "langchain-openai", "langchain-community", 
        "langchain-huggingface", "faiss-cpu", "sentence-transformers", 
        "scikit-fuzzy", "numpy", "fastapi", "pypdf", "langchain-text-splitters", "openai"
    )
    .add_local_file("agent.py", remote_path="/root/agent.py")
    .add_local_file("fuzzy.py", remote_path="/root/fuzzy.py")
    .add_local_file("main.pdf", remote_path="/root/main.pdf")
    .add_local_file("vision.py", remote_path="/root/vision.py")
)

# Validates the incoming API request structure, ensuring a message and an optional conversation history are provided
class ChatRequest(BaseModel):
    message: str
    chat_history: List[Dict[str, str]] = [] 
    image_base64: Optional[str] = None

# Wraps the function as a serverless POST endpoint, binding it to the configured environment and securely loading API keys
@app.function(
    image=image, 
    secrets=[modal.Secret.from_name("cinn-llm-api")]
)
@modal.fastapi_endpoint(method="POST")
def chat_endpoint(request: ChatRequest):
    # Defers imports until runtime in the cloud container to prevent local environment mismatch errors
    from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
    from agent import get_agent_executor
    from vision import extract_data_from_image
    import json
    
    # Initializes the language model agent and its toolsets
    agent_executor = get_agent_executor()
    
    # Reconstructs the raw dictionary history into LangChain-compatible message objects to maintain context across multi-turn chats
    formatted_history = []
    for msg in request.chat_history:
        if msg["role"] == "user":
            formatted_history.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "assistant":
            formatted_history.append(AIMessage(content=msg["content"]))

    if request.image_base64:
        extracted_data = extract_data_from_image(request.image_base64)
        
        if extracted_data: 
            injection = f"System Note: The user uploaded a soil report. I successfully extracted the following data: {json.dumps(extracted_data)}. Acknowledge this data and seamlessly ask the user for any remaining variables needed for the fertilizer calculation."
        else:
            injection = "System Note: The user uploaded an image, but I could not automatically extract any specific soil or weather variables from it. Acknowledge the upload and ask the user to manually provide the missing details."
            
        formatted_history.append(SystemMessage(content=injection))

    try:
        response = agent_executor.invoke({
            "input": request.message,
            "chat_history": formatted_history
        })
        return {"response": response["output"], "status": "success"}
    except Exception as e:
        return {"response": f"System error: {str(e)}", "status": "error"}