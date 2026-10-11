"""Configurable listener; production TLS remains at the M24 edge proxy."""
import os
import uvicorn

if __name__ == "__main__":
    uvicorn.run("sdc_gateway.app:create_app", factory=True, host=os.environ.get("SDC_GATEWAY_HOST", "127.0.0.1"),
                port=int(os.environ.get("SDC_GATEWAY_PORT", "8000")), access_log=False,
                limit_concurrency=128, limit_max_requests=10000, timeout_keep_alive=5, timeout_graceful_shutdown=25)
