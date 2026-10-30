from pymongo import MongoClient
from pymongo.database import Database

from .config import database_url

_client: MongoClient | None = None


def connect() -> None:
    global _client
    _client = MongoClient(database_url(), serverSelectionTimeoutMS=5000)


def close() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None


def get_database() -> Database:
    if _client is None:
        raise RuntimeError("The MongoDB client has not been started.")
    return _client.get_default_database()


def ping() -> None:
    if _client is None:
        raise RuntimeError("The MongoDB client has not been started.")
    _client.admin.command("ping")
