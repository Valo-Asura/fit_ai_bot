import re
import math
import logging
import asyncio
from typing import List, Dict, Tuple
from app.database import knowledge_documents_collection
from app.config import settings

logger = logging.getLogger("fit_ai.rag")

# Initialize Pinecone and Gemini RAG integration
use_pinecone = False
pc = None
pinecone_index = None

if settings.PINECONE_API_KEY and settings.GEMINI_API_KEY:
    try:
        import google.generativeai as genai
        from pinecone import Pinecone, ServerlessSpec
        
        genai.configure(api_key=settings.GEMINI_API_KEY)
        pc = Pinecone(api_key=settings.PINECONE_API_KEY)
        
        # Check if index exists or create it
        existing_indexes = [idx.name for idx in pc.list_indexes()]
        if settings.PINECONE_INDEX_NAME not in existing_indexes:
            logger.info(f"Creating Pinecone index: {settings.PINECONE_INDEX_NAME}...")
            pc.create_index(
                name=settings.PINECONE_INDEX_NAME,
                dimension=768,  # models/text-embedding-004 has 768 dimensions
                metric="cosine",
                spec=ServerlessSpec(
                    cloud=settings.PINECONE_CLOUD,
                    region=settings.PINECONE_REGION
                )
            )
        
        pinecone_index = pc.Index(settings.PINECONE_INDEX_NAME)
        use_pinecone = True
        logger.info("Successfully connected to Pinecone vector database.")
    except Exception as e:
        logger.warning(f"Failed to initialize Pinecone client: {e}. Falling back to TF-IDF RAG.")

# Stopwords for simple tokenization (TF-IDF fallback)
STOPWORDS = {
    "the", "a", "an", "is", "of", "and", "to", "in", "for", "on", "with", "at", 
    "by", "from", "it", "this", "that", "these", "those", "are", "was", "were", 
    "be", "been", "being", "have", "has", "had", "do", "does", "did", "but", 
    "if", "or", "because", "as", "until", "while", "about", "into", "through"
}

def tokenize(text: str) -> List[str]:
    # Lowercase and keep alphanumeric tokens
    text = text.lower()
    text = re.sub(r"<[^>]*>", " ", text)  # strip html tags
    tokens = re.findall(r"\b[a-z0-9]{2,}\b", text)
    return [t for t in tokens if t not in STOPWORDS]

class SimpleTFIDFStore:
    def __init__(self):
        self.chunks: List[Dict] = []  # List of {"text": str, "source": str, "tokens": List[str]}
        self.idf: Dict[str, float] = {}

    def fit_and_add(self, documents: List[Dict]):
        self.chunks = []
        for doc in documents:
            text = doc.get("text", "")
            source = doc.get("source", "upload")
            paragraphs = [p.strip() for p in re.split(r"\n\n+", text) if p.strip()]
            for p in paragraphs:
                tokens = tokenize(p)
                if len(tokens) > 2:
                    self.chunks.append({
                        "text": p,
                        "source": source,
                        "tokens": tokens
                    })
        
        total_docs = len(self.chunks)
        if total_docs == 0:
            self.idf = {}
            return
            
        doc_counts = {}
        for chunk in self.chunks:
            unique_tokens = set(chunk["tokens"])
            for t in unique_tokens:
                doc_counts[t] = doc_counts.get(t, 0) + 1
                
        self.idf = {}
        for token, count in doc_counts.items():
            self.idf[token] = math.log(1.0 + (total_docs / count))

    def search(self, query: str, top_k: int = 3) -> List[Tuple[Dict, float]]:
        query_tokens = tokenize(query)
        if not query_tokens or not self.chunks:
            return []
            
        query_tf = {}
        for t in query_tokens:
            query_tf[t] = query_tf.get(t, 0) + 1
            
        query_vec = {}
        query_norm_sq = 0.0
        for t, tf in query_tf.items():
            idf_val = self.idf.get(t, 0.0)
            weight = tf * idf_val
            query_vec[t] = weight
            query_norm_sq += weight * weight
            
        query_norm = math.sqrt(query_norm_sq)
        if query_norm == 0:
            return []
            
        results = []
        for chunk in self.chunks:
            chunk_tokens = chunk["tokens"]
            chunk_tf = {}
            for t in chunk_tokens:
                chunk_tf[t] = chunk_tf.get(t, 0) + 1
                
            dot_product = 0.0
            chunk_norm_sq = 0.0
            for t, tf in chunk_tf.items():
                idf_val = self.idf.get(t, 0.0)
                chunk_weight = tf * idf_val
                chunk_norm_sq += chunk_weight * chunk_weight
                if t in query_vec:
                    dot_product += query_vec[t] * chunk_weight
                    
            chunk_norm = math.sqrt(chunk_norm_sq)
            similarity = 0.0 if chunk_norm == 0 else dot_product / (query_norm * chunk_norm)
            if similarity > 0.0:
                results.append((chunk, similarity))
                
        results.sort(key=lambda x: x[1], reverse=True)
        return results[:top_k]

# Global search index instance
rag_store = SimpleTFIDFStore()

async def get_embedding(text: str) -> List[float]:
    import google.generativeai as genai
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        None,
        lambda: genai.embed_content(
            model="models/text-embedding-004",
            content=text,
            task_type="retrieval_document"
        )
    )
    return result['embedding']

async def sync_rag_index():
    """
    Syncs the local simple TF-IDF index with documents from MongoDB, and optionally seeds Pinecone.
    """
    try:
        cursor = knowledge_documents_collection.find()
        docs = await cursor.to_list()
        
        # Load local TF-IDF cache
        rag_store.fit_and_add(docs)
        logger.info(f"RAG TF-IDF search index synchronized with {len(docs)} documents.")
        
        # Optionally seed Pinecone if index is empty
        if use_pinecone and pinecone_index:
            try:
                stats = pinecone_index.describe_index_stats()
                if stats.get("total_vector_count", 0) == 0 and docs:
                    logger.info("Pinecone index is empty. Seeding existing knowledge base...")
                    for doc in docs:
                        doc_id = str(doc["_id"])
                        text = doc.get("text", "")
                        source = doc.get("source", "upload")
                        paragraphs = [p.strip() for p in re.split(r"\n\n+", text) if p.strip()]
                        for idx, p in enumerate(paragraphs):
                            emb = await get_embedding(p)
                            pinecone_index.upsert(vectors=[(
                                f"{doc_id}_{idx}",
                                emb,
                                {"text": p, "source": source, "doc_id": doc_id}
                            )])
                    logger.info("Pinecone database seeding completed successfully.")
            except Exception as pe:
                logger.warning(f"Failed to auto-seed Pinecone index: {pe}")
    except Exception as e:
        logger.error(f"Error synchronizing RAG index: {e}")

async def add_document(text: str, source: str = "upload") -> str:
    """
    Adds a new knowledge document, escapes text, and updates both MongoDB and Pinecone indexes.
    """
    escaped_text = re.sub(r"&", "&amp;", text)
    escaped_text = re.sub(r"<", "&lt;", escaped_text)
    escaped_text = re.sub(r">", "&gt;", escaped_text)
    
    doc = {
        "text": escaped_text,
        "source": source
    }
    result = await knowledge_documents_collection.insert_one(doc)
    doc_id = str(result.inserted_id)
    
    # Save/index to Pinecone if enabled
    if use_pinecone and pinecone_index:
        try:
            paragraphs = [p.strip() for p in re.split(r"\n\n+", escaped_text) if p.strip()]
            for idx, p in enumerate(paragraphs):
                emb = await get_embedding(p)
                pinecone_index.upsert(vectors=[(
                    f"{doc_id}_{idx}",
                    emb,
                    {"text": p, "source": source, "doc_id": doc_id}
                )])
            logger.info(f"Indexed document {doc_id} to Pinecone vector store ({len(paragraphs)} chunks).")
        except Exception as e:
            logger.error(f"Failed to index to Pinecone: {e}")
            
    # Also sync the RAG index
    await sync_rag_index()
    return doc_id

async def query_rag(query: str) -> List[Dict]:
    """
    Queries the RAG index using Pinecone if available, otherwise falling back to TF-IDF.
    """
    if use_pinecone and pinecone_index:
        try:
            emb = await get_embedding(query)
            res = pinecone_index.query(vector=emb, top_k=3, include_metadata=True)
            matches = []
            for match in res.get("matches", []):
                meta = match.get("metadata", {})
                matches.append({
                    "text": meta.get("text", ""),
                    "source": meta.get("source", "upload"),
                    "score": round(match.get("score", 0.0), 4)
                })
            if matches:
                return matches
        except Exception as e:
            logger.error(f"Pinecone query failed, falling back to TF-IDF: {e}")
            
    # TF-IDF fallback
    if not rag_store.chunks:
        await sync_rag_index()
        
    matches = rag_store.search(query, top_k=3)
    return [
        {
            "text": chunk["text"],
            "source": chunk["source"],
            "score": round(score, 4)
        }
        for chunk, score in matches
    ]
