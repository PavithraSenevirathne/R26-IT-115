import os
import json
from langchain_core.tools import tool
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_core.documents import Document
from langchain_openai import ChatOpenAI
from langchain_classic.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter

from fuzzy import recommend_complete_cinnamon_plan

@tool
def calculate_cinnamon_fertilizer(age_years: float, spacing: str, season: str, rainfall_mm_year: float, elevation_m: float, soil_ph_value: float) -> str:
    """Executes the fuzzy logic engine to calculate exact fertilizer dosages and safety guidelines based on field parameters. Use this ONLY when the user asks for a fertilizer plan."""
    try:
        result = recommend_complete_cinnamon_plan(
            age_years=age_years, spacing=spacing, season=season, 
            rainfall_mm_year=rainfall_mm_year, elevation_m=elevation_m, soil_ph_value=soil_ph_value
        )
        
        farmer_actions = "\n".join(result.get("farmer_message", []))
        if result.get("status") == "blocked":
            return f"Fertilizer blocked. Reason: {result.get('reason')}\nFarmer Actions:\n{farmer_actions}"
            
        if result.get("fertilizer_recommendation"):
            dose = result["fertilizer_recommendation"].get("inorganic_fertilizer", {})
            dose_str = json.dumps(dose, indent=2)
            return f"Status: {result['status']}.\nActions:\n{farmer_actions}\n\nExact Dosage Rules:\n{dose_str}"
            
        return f"Status: {result['status']}.\nActions:\n{farmer_actions}"
    except Exception as e:
        return f"Error calculating: {str(e)}"

def setup_vector_store():
    loader = PyPDFLoader("main.pdf")
    raw_documents = loader.load()

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=800, 
        chunk_overlap=150,
        separators=["\n\n", "\n", ".", " ", ""]
    )
    chunked_docs = text_splitter.split_documents(raw_documents)

    embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
    return FAISS.from_documents(chunked_docs, embeddings)

vector_store = setup_vector_store()
retriever = vector_store.as_retriever(search_kwargs={"k": 2})

@tool
def search_agronomy_knowledge(query: str) -> str:
    """Searches the knowledge base for information on cinnamon diseases, pests, remedies, harvesting techniques, and general farming practices. Use this for all questions not related to calculating fertilizer dosage."""
    docs = retriever.invoke(query)
    return "\n\n".join([doc.page_content for doc in docs])

def get_agent_executor():
    llm = ChatOpenAI(
        api_key=os.environ.get("GROQ_API_KEY"), 
        base_url="https://api.groq.com/openai/v1",
        model="openai/gpt-oss-20b", 
        temperature=0.1 
    )

    system_prompt = """You are CInnLLM, a comprehensive Cinnamon Agronomy Assistant. You help farmers with Pests, Diseases, Harvesting, and Fertilizer.

    RULES:
    1. For questions about diseases, pests, remedies, or harvesting, ALWAYS use the `search_agronomy_knowledge` tool to find the verified answer.
    2. If the user asks for a fertilizer plan or dosage calculation, use the `calculate_cinnamon_fertilizer` tool.
    3. To calculate fertilizer, you MUST gather all 6 inputs from the farmer (age, spacing, season, rainfall, elevation, soil pH). Ask conversationally if any are missing.
    4. Speak in a helpful, conversational tone. Format your answers clearly with bullet points where appropriate.
    5. If the knowledge base does not contain the answer, politely state that you do not have that specific information.
    """

    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        MessagesPlaceholder(variable_name="chat_history"),
        ("human", "{input}"),
        MessagesPlaceholder(variable_name="agent_scratchpad"),
    ])

    tools = [calculate_cinnamon_fertilizer, search_agronomy_knowledge]
    agent = create_tool_calling_agent(llm, tools, prompt)
    return AgentExecutor(agent=agent, tools=tools, verbose=True)