from redis import Redis
from redis.exceptions import RedisError


def create_redis_client(host="localhost", port=6379, db=0):
    return Redis(
        host=host,
        port=port,
        db=db,
        decode_responses=True,
        socket_connect_timeout=5,
        socket_timeout=5,
    )
