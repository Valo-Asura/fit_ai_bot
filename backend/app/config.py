import os
from pydantic_settings import BaseSettings
from pydantic import Field

class Settings(BaseSettings):
    PORT: int = Field(default=8000, validation_alias="PORT")
    MONGODB_URI: str = Field(default="mongodb://localhost:27017/fit_ai", validation_alias="MONGODB_URI")
    MONGODB_DB: str = Field(default="fit_ai", validation_alias="MONGODB_DB")
    DATABASE_URL: str = Field(default="sqlite+aiosqlite:///./fit_ai.db", validation_alias="DATABASE_URL")
    LLM_PROVIDER: str = Field(default="gemini", validation_alias="LLM_PROVIDER")
    
    # Pinecone
    PINECONE_API_KEY: str = Field(default="", validation_alias="PINECONE_API_KEY")
    PINECONE_INDEX_NAME: str = Field(default="rag-chatbot-2", validation_alias="PINECONE_INDEX_NAME")
    PINECONE_CLOUD: str = Field(default="aws", validation_alias="PINECONE_CLOUD")
    PINECONE_REGION: str = Field(default="us-east-1", validation_alias="PINECONE_REGION")
    
    # API Keys & Models
    GROQ_API_KEY: str = Field(default="", validation_alias="GROQ_API_KEY")
    GROQ_MODEL: str = Field(default="llama3-70b-8192", validation_alias="GROQ_MODEL")
    
    GEMINI_API_KEY: str = Field(default="", validation_alias="GEMINI_API_KEY")
    GEMINI_MODEL: str = Field(default="gemini-3.5-flash", validation_alias="GEMINI_MODEL")
    
    OLLAMA_BASE_URL: str = Field(default="http://localhost:11434", validation_alias="OLLAMA_BASE_URL")
    OLLAMA_MODEL: str = Field(default="qwen3:4b", validation_alias="OLLAMA_MODEL")

    class Config:
        env_file = ".env"
        extra = "ignore"

# Instantiate settings
settings = Settings()
