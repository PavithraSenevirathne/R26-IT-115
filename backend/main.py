from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes import router as api_router

app = FastAPI(title="Cinnamon AI Inference API", version="1.0")

# Crucial for React Native connectivity
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all origins for local development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include the ML routes
app.include_router(api_router, prefix="/api/v1")

@app.get("/")
def health_check():
    return {"status": "online", "message": "Cinnamon AI Backend is running."}

if __name__ == "__main__":
    import uvicorn
    # Run server on all network interfaces so phone can connect
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)