"""
Base Connector class for all data source connectors.
Provides a standard interface with caching, rate limiting, retry logic,
and structured logging.
"""

import time
import hashlib
import json
import logging
from abc import ABC, abstractmethod
from collections import deque
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional


# ── Custom Exceptions ────────────────────────────────────────────────────────

class ConnectorError(Exception):
    """Base exception for all connector errors."""

    def __init__(self, connector_name: str, message: str):
        self.connector_name = connector_name
        super().__init__(f"[{connector_name}] {message}")


class ConnectionError(ConnectorError):
    """Raised when a connector cannot reach its data source."""


class AuthenticationError(ConnectorError):
    """Raised when authentication fails."""


class RateLimitError(ConnectorError):
    """Raised when the connector's internal rate limit is exceeded."""


class DataFetchError(ConnectorError):
    """Raised when fetching data fails after all retries."""


# ── Base Connector ───────────────────────────────────────────────────────────

class BaseConnector(ABC):
    """Abstract base class for all data connectors.

    Provides:
    - Abstract interface (test_connection, fetch_data, get_metadata)
    - In-memory caching with TTL
    - Rate limiting (default 100 requests/minute)
    - Automatic retry with exponential backoff
    - Structured logging for every API call
    """

    MAX_REQUESTS_PER_MINUTE = 100
    MAX_RETRIES = 3
    RETRY_BASE_DELAY = 1  # seconds

    def __init__(
        self,
        connector_name: str,
        cache_ttl: int = 300,
        max_requests_per_minute: int = MAX_REQUESTS_PER_MINUTE,
        max_retries: int = MAX_RETRIES,
    ):
        """
        Args:
            connector_name: Human-readable name used in logs and errors.
            cache_ttl: Cache time-to-live in seconds (default 5 minutes).
            max_requests_per_minute: Rate limit ceiling.
            max_retries: Number of retry attempts for failed requests.
        """
        self.connector_name = connector_name
        self.logger = logging.getLogger(f"connector.{connector_name}")

        # Caching
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._cache_ttl = cache_ttl

        # Rate limiting — sliding window of timestamps
        self._max_rpm = max_requests_per_minute
        self._request_timestamps: deque = deque()

        # Retry config
        self._max_retries = max_retries

    # ── Abstract interface ───────────────────────────────────────────────

    @abstractmethod
    def test_connection(self) -> bool:
        """Return True if the connector can reach its data source."""
        ...

    @abstractmethod
    def fetch_data(
        self,
        start_date: datetime,
        end_date: datetime,
        limit: int = 100,
    ) -> List[Dict]:
        """Fetch records from the data source for the given date range.

        Args:
            start_date: Inclusive start of the date range.
            end_date: Inclusive end of the date range.
            limit: Maximum number of records to return.

        Returns:
            A list of record dictionaries.
        """
        ...

    @abstractmethod
    def get_metadata(self) -> Dict:
        """Return metadata about the data source.

        Expected keys (at minimum):
            - source: Name of the data source.
            - connected: Whether the source is currently reachable.
            - last_sync: ISO-8601 timestamp of the last successful fetch.
        """
        ...

    # ── Caching ──────────────────────────────────────────────────────────

    def _cache_key(self, *args, **kwargs) -> str:
        raw = json.dumps({"a": args, "k": kwargs}, sort_keys=True, default=str)
        return hashlib.md5(raw.encode()).hexdigest()

    def _get_cached(self, key: str) -> Optional[Any]:
        entry = self._cache.get(key)
        if entry and time.time() - entry["ts"] < self._cache_ttl:
            return entry["data"]
        return None

    def _set_cached(self, key: str, data: Any) -> None:
        self._cache[key] = {"data": data, "ts": time.time()}

    def clear_cache(self) -> None:
        self._cache.clear()

    # ── Rate limiting ────────────────────────────────────────────────────

    def _check_rate_limit(self) -> None:
        """Enforce the sliding-window rate limit.

        Raises RateLimitError if the limit would be exceeded.
        """
        now = time.time()
        window_start = now - 60

        # Discard timestamps outside the 1-minute window
        while self._request_timestamps and self._request_timestamps[0] < window_start:
            self._request_timestamps.popleft()

        if len(self._request_timestamps) >= self._max_rpm:
            wait = 60 - (now - self._request_timestamps[0])
            raise RateLimitError(
                self.connector_name,
                f"Rate limit reached ({self._max_rpm}/min). "
                f"Retry in {wait:.1f}s.",
            )

        self._request_timestamps.append(now)

    # ── Retry with exponential backoff ───────────────────────────────────

    def _execute_with_retry(self, func: Callable, *args, **kwargs) -> Any:
        """Call *func* with automatic retries and exponential backoff.

        Args:
            func: The callable to execute.
            *args, **kwargs: Forwarded to *func*.

        Returns:
            The return value of *func*.

        Raises:
            DataFetchError: If all retry attempts are exhausted.
        """
        last_exception: Optional[Exception] = None

        for attempt in range(1, self._max_retries + 1):
            try:
                self._check_rate_limit()
                self.logger.info(
                    "API call attempt %d/%d – %s",
                    attempt,
                    self._max_retries,
                    func.__name__,
                )
                result = func(*args, **kwargs)
                self.logger.info(
                    "API call succeeded – %s (attempt %d)",
                    func.__name__,
                    attempt,
                )
                return result
            except RateLimitError:
                raise  # Don't retry rate-limit errors
            except Exception as exc:
                last_exception = exc
                if attempt < self._max_retries:
                    delay = self.RETRY_BASE_DELAY * (2 ** (attempt - 1))
                    self.logger.warning(
                        "API call failed – %s (attempt %d/%d). "
                        "Retrying in %ds. Error: %s",
                        func.__name__,
                        attempt,
                        self._max_retries,
                        delay,
                        exc,
                    )
                    time.sleep(delay)

        self.logger.error(
            "API call failed after %d attempts – %s. Last error: %s",
            self._max_retries,
            func.__name__,
            last_exception,
        )
        raise DataFetchError(
            self.connector_name,
            f"{func.__name__} failed after {self._max_retries} attempts: "
            f"{last_exception}",
        ) from last_exception
