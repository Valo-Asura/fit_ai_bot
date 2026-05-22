import re
import math
import logging
from typing import List, Dict, Tuple
from app.database import knowledge_documents_collection

logger = logging.getLogger("fit_ai.rag")

# Stopwords for simple tokenization
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
        """
        Fits TF-IDF weights and builds the search index from scratch.
        """
        self.chunks = []
        
        # 1. Chunk documents into smaller paragraphs (e.g. splitting by double newlines or sentences)
        for doc in documents:
            text = doc.get("text", "")
            source = doc.get("source", "upload")
            
            # Split into chunks of approx 3-4 sentences
            paragraphs = [p.strip() for p in re.split(r"\n\n+", text) if p.strip()]
            for p in paragraphs:
                tokens = tokenize(p)
                if len(tokens) > 2:  # skip empty or too short chunks
                    self.chunks.append({
                        "text": p,
                        "source": source,
                        "tokens": tokens
                    })
        
        # 2. Compute IDF
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
            # Standard IDF formula: ln(1 + (N / count))
            self.idf[token] = math.log(1.0 + (total_docs / count))

    def search(self, query: str, top_k: int = 3) -> List[Tuple[Dict, float]]:
        """
        Calculates cosine similarity between query and all stored chunks.
        """
        query_tokens = tokenize(query)
        if not query_tokens or not self.chunks:
            return []
            
        # Compute query vector (TF-IDF weights)
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
            if chunk_norm == 0:
                similarity = 0.0
            else:
                similarity = dot_product / (query_norm * chunk_norm)
                
            if similarity > 0.0:
                results.append((chunk, similarity))
                
        # Sort by similarity descending
        results.sort(key=lambda x: x[1], reverse=True)
        return results[:top_k]

# Global search index instance
rag_store = SimpleTFIDFStore()

async def sync_rag_index():
    """
    Syncs the local simple TF-IDF index with documents from MongoDB.
    """
    try:
        cursor = knowledge_documents_collection.find()
        docs = await cursor.to_list()
        rag_store.fit_and_add(docs)
        logger.info(f"RAG search index synchronized with {len(docs)} documents.")
    except Exception as e:
        logger.error(f"Error synchronizing RAG index: {e}")

async def add_document(text: str, source: str = "upload") -> str:
    """
    Adds a new knowledge document, escapes text, and updates index.
    """
    # Simple HTML escape for protection
    escaped_text = re.sub(r"&", "&amp;", text)
    escaped_text = re.sub(r"<", "&lt;", escaped_text)
    escaped_text = re.sub(r">", "&gt;", escaped_text)
    
    doc = {
        "text": escaped_text,
        "source": source
    }
    result = await knowledge_documents_collection.insert_one(doc)
    # Refresh index
    await sync_rag_index()
    return str(result.inserted_id)

async def query_rag(query: str) -> List[Dict]:
    """
    Queries the RAG index and returns matched chunks.
    """
    # Ensure index is loaded
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
