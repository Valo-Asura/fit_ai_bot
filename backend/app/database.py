import logging
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings

logger = logging.getLogger("fit_ai.database")
logging.basicConfig(level=logging.INFO)

# In-memory Mock DB fallback structures
class MockCursor:
    def __init__(self, data):
        self._data = data
        self._index = 0

    def skip(self, n):
        self._data = self._data[n:]
        return self

    def limit(self, n):
        self._data = self._data[:n]
        return self

    def sort(self, key_or_list, direction=None):
        # Very simple sorting
        # key_or_list could be [('timestamp', -1)]
        if not self._data:
            return self
        if isinstance(key_or_list, list):
            sort_key, desc = key_or_list[0]
            reverse = (desc == -1)
        else:
            sort_key = key_or_list
            reverse = (direction == -1) if direction is not None else False
        
        self._data = sorted(
            self._data, 
            key=lambda x: x.get(sort_key) if x.get(sort_key) is not None else "",
            reverse=reverse
        )
        return self

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self._index >= len(self._data):
            raise StopAsyncIteration
        val = self._data[self._index]
        self._index += 1
        return val

    async def to_list(self, length=None):
        if length is not None:
            return self._data[:length]
        return self._data

class MockCollection:
    def __init__(self, name):
        self.name = name
        self.documents = []
        self._counter = 1

    async def find_one(self, filter_dict):
        for doc in self.documents:
            match = True
            for k, v in filter_dict.items():
                if k == "$or":
                    or_match = False
                    for cond in v:
                        if all(doc.get(sub_k) == sub_v for sub_k, sub_v in cond.items()):
                            or_match = True
                            break
                    if not or_match:
                        match = False
                        break
                elif isinstance(v, dict):
                    # handle simple operations like $regex or $in
                    doc_val = doc.get(k)
                    if "$regex" in v:
                        import re
                        pattern = v["$regex"]
                        flags = re.IGNORECASE if v.get("$options") == "i" else 0
                        if not doc_val or not re.search(pattern, str(doc_val), flags):
                            match = False
                            break
                    elif "$in" in v:
                        if doc_val not in v["$in"]:
                            match = False
                            break
                elif doc.get(k) != v:
                    match = False
                    break
            if match:
                return doc
        return None

    def find(self, filter_dict=None):
        if filter_dict is None:
            filter_dict = {}
        matched = []
        for doc in self.documents:
            match = True
            for k, v in filter_dict.items():
                if k == "$or":
                    or_match = False
                    for cond in v:
                        if all(doc.get(sub_k) == sub_v for sub_k, sub_v in cond.items()):
                            or_match = True
                            break
                    if not or_match:
                        match = False
                        break
                elif isinstance(v, dict):
                    doc_val = doc.get(k)
                    if "$regex" in v:
                        import re
                        pattern = v["$regex"]
                        flags = re.IGNORECASE if v.get("$options") == "i" else 0
                        if not doc_val or not re.search(pattern, str(doc_val), flags):
                            match = False
                            break
                    elif "$in" in v:
                        if doc_val not in v["$in"]:
                            match = False
                            break
                    elif "$gte" in v or "$lte" in v:
                        if "$gte" in v and not (doc_val >= v["$gte"]):
                            match = False
                            break
                        if "$lte" in v and not (doc_val <= v["$lte"]):
                            match = False
                            break
                elif doc.get(k) != v:
                    match = False
                    break
            if match:
                matched.append(doc)
        return MockCursor(matched)

    async def insert_one(self, doc):
        from bson import ObjectId
        if "_id" not in doc:
            doc["_id"] = str(ObjectId())
        self.documents.append(doc)
        class InsertResult:
            def __init__(self, inserted_id):
                self.inserted_id = inserted_id
        return InsertResult(doc["_id"])

    async def insert_many(self, docs):
        from bson import ObjectId
        inserted_ids = []
        for doc in docs:
            if "_id" not in doc:
                doc["_id"] = str(ObjectId())
            self.documents.append(doc)
            inserted_ids.append(doc["_id"])
        class InsertManyResult:
            def __init__(self, ids):
                self.inserted_ids = ids
        return InsertManyResult(inserted_ids)

    async def update_one(self, filter_dict, update_dict, upsert=False):
        doc = await self.find_one(filter_dict)
        class UpdateResult:
            def __init__(self, matched, modified):
                self.matched_count = matched
                self.modified_count = modified
        
        if not doc:
            if upsert:
                new_doc = filter_dict.copy()
                if "$set" in update_dict:
                    new_doc.update(update_dict["$set"])
                await self.insert_one(new_doc)
                return UpdateResult(0, 1)
            return UpdateResult(0, 0)
        
        # Apply updates
        if "$set" in update_dict:
            doc.update(update_dict["$set"])
        if "$push" in update_dict:
            for push_key, push_val in update_dict["$push"].items():
                if push_key not in doc:
                    doc[push_key] = []
                if isinstance(push_val, dict) and "$each" in push_val:
                    doc[push_key].extend(push_val["$each"])
                else:
                    doc[push_key].append(push_val)
        return UpdateResult(1, 1)

    async def delete_one(self, filter_dict):
        doc = await self.find_one(filter_dict)
        class DeleteResult:
            def __init__(self, deleted):
                self.deleted_count = deleted
        if doc:
            self.documents.remove(doc)
            return DeleteResult(1)
        return DeleteResult(0)

    async def delete_many(self, filter_dict):
        class DeleteResult:
            def __init__(self, deleted):
                self.deleted_count = deleted
        
        if not filter_dict:
            count = len(self.documents)
            self.documents = []
            return DeleteResult(count)
            
        matched = []
        for doc in self.documents:
            match = True
            for k, v in filter_dict.items():
                if doc.get(k) != v:
                    match = False
                    break
            if match:
                matched.append(doc)
                
        for doc in matched:
            self.documents.remove(doc)
            
        return DeleteResult(len(matched))

    async def create_index(self, keys, unique=False):
        return f"{self.name}_index"

class MockDatabase:
    def __init__(self):
        self._collections = {}

    def __getitem__(self, name):
        if name not in self._collections:
            self._collections[name] = MockCollection(name)
        return self._collections[name]

# Global DB client variable initialized to mock by default
db = MockDatabase()
use_mock_db = True

class CollectionProxy:
    def __init__(self, name):
        self._name = name

    @property
    def _coll(self):
        return db[self._name]

    def __getattr__(self, name):
        return getattr(self._coll, name)

# Global collections defined as Proxy objects
users_collection = CollectionProxy("users")
foods_collection = CollectionProxy("foods")
food_aliases_collection = CollectionProxy("food_aliases")
user_food_presets_collection = CollectionProxy("user_food_presets")
recipes_collection = CollectionProxy("recipes")
recipe_items_collection = CollectionProxy("recipe_items")
daily_logs_collection = CollectionProxy("daily_logs")
knowledge_documents_collection = CollectionProxy("knowledge_documents")

# Try connecting to MongoDB, fallback to mock DB if unavailable
async def init_db():
    global db, use_mock_db
    
    try:
        # 1.5s timeout for fast fallback
        client = AsyncIOMotorClient(settings.MONGODB_URI, serverSelectionTimeoutMS=1500)
        await client.server_info()
        db = client.get_database()
        use_mock_db = False
        logger.info("Successfully connected to MongoDB.")
        
        # Setup indexes asynchronously (if using real DB)
        await db["foods"].create_index("name", unique=True)
        await db["food_aliases"].create_index("alias", unique=True)
        await db["daily_logs"].create_index([("user_id", 1), ("date", 1)], unique=True)
    except Exception as e:
        logger.warning(f"MongoDB connection failed: {e}. Keeping In-Memory Database.")

