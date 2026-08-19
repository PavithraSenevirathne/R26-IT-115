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
    # Executes the fuzzy logic engine using structured field parameters gathered from conversation
    try:
        result = recommend_complete_cinnamon_plan(
            age_years=age_years, spacing=spacing, season=season, 
            rainfall_mm_year=rainfall_mm_year, elevation_m=elevation_m, soil_ph_value=soil_ph_value
        )
        
        # Format the calculation results into readable instructions and dosage summaries
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
    # Load the PDF document
    loader = PyPDFLoader("main.pdf")
    raw_documents = loader.load()

    # Break the document into manageable chunks for the LLM context window
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=800, 
        chunk_overlap=150,
        separators=["\n\n", "\n", ".", " ", ""]
    )
    chunked_docs = text_splitter.split_documents(raw_documents)

    # Create embeddings and build the FAISS index
    embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
    return FAISS.from_documents(chunked_docs, embeddings)

vector_store = setup_vector_store()
retriever = vector_store.as_retriever(search_kwargs={"k": 2})

@tool
def search_agronomy_knowledge(query: str) -> str:
    # Performs semantic search over the knowledge base to answer descriptive farming questions
    docs = retriever.invoke(query)
    return "\n\n".join([doc.page_content for doc in docs])

def get_agent_executor():
    # Initializes the language model endpoint with low temperature to minimize hallucinations
    llm = ChatOpenAI(
        api_key=os.environ.get("GROQ_API_KEY"), 
        base_url="https://api.groq.com/openai/v1",
        model="llama-3.1-8b-instant", 
        temperature=0.1 
    )

    # Sets operational guardrails, enforcing tool execution over generated estimations
    system_prompt = """You are an expert Cinnamon Agronomy Assistant.

    RULES:
    1. NEVER invent fertilizer dosages. Use the `calculate_cinnamon_fertilizer` tool.
    2. To calculate dosage, you MUST gather all 6 inputs from the farmer (age, spacing, season, rainfall, elevation, soil pH). Ask conversationally if any are missing.
    3. Use `search_agronomy_knowledge` for general cinnamon farming questions.
    4. If the tools don't have the answer, politely say you don't know.
    """

    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        MessagesPlaceholder(variable_name="chat_history"),
        ("human", "{input}"),
        MessagesPlaceholder(variable_name="agent_scratchpad"),
    ])

    # Compiles the agent pipeline with dialogue memory and function-calling capabilities
    tools = [calculate_cinnamon_fertilizer, search_agronomy_knowledge]
    agent = create_tool_calling_agent(llm, tools, prompt)
    return AgentExecutor(agent=agent, tools=tools, verbose=True)