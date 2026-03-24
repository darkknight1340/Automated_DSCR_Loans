"""
Zillow Web Scraper for AVM/Rent Verification

Scrapes Zillow property pages to extract Zestimate and Rent Zestimate values
for verification against primary data sources (RentCast).

Note: Low volume usage only. Implements rate limiting between requests.
"""

import asyncio
import json
import os
import re
import time
from urllib.parse import quote

import httpx

from app.adapters.base import VerificationResult

import logging

logger = logging.getLogger("zillow")
logger.setLevel(logging.DEBUG)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setLevel(logging.DEBUG)
    handler.setFormatter(logging.Formatter('%(message)s'))
    logger.addHandler(handler)

# Default delay between requests (milliseconds)
DELAY_MS = int(os.getenv("ZILLOW_SCRAPE_DELAY_MS", "2000"))


class ZillowScraper:
    """Scrapes Zillow for Zestimate and Rent Zestimate values."""

    def __init__(self) -> None:
        self._last_request: float = 0

    async def _rate_limit(self) -> None:
        """Enforce delay between requests to avoid rate limiting."""
        elapsed_ms = (time.time() - self._last_request) * 1000
        if elapsed_ms < DELAY_MS:
            await asyncio.sleep((DELAY_MS - elapsed_ms) / 1000)
        self._last_request = time.time()

    def _build_url(
        self, street: str, city: str, state: str, zip_code: str
    ) -> str:
        """Build Zillow property URL from address components."""
        # Zillow URL format: https://www.zillow.com/homes/123-Main-St-City-ST-12345_rb/
        addr = f"{street} {city} {state} {zip_code}"
        # Remove special chars and replace spaces with hyphens
        slug = re.sub(r"[^\w\s-]", "", addr).replace(" ", "-")
        return f"https://www.zillow.com/homes/{quote(slug)}_rb/"

    def _get_headers(self) -> dict[str, str]:
        """Get headers that mimic a browser request."""
        return {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            "Cache-Control": "max-age=0",
        }

    async def verify_value(
        self,
        street: str,
        city: str,
        state: str,
        zip_code: str,
        expected_value: int,  # cents
    ) -> VerificationResult:
        """
        Fetch Zestimate from Zillow and compare with expected value.

        Args:
            street: Street address
            city: City name
            state: Two-letter state code
            zip_code: ZIP code
            expected_value: Expected AVM value in cents

        Returns:
            VerificationResult with comparison data
        """
        await self._rate_limit()

        logger.debug(f"[ZILLOW] Verifying AVM for {street}, {city}, {state} {zip_code}")
        logger.debug(f"[ZILLOW] Expected value: ${expected_value / 100:,.0f}")

        try:
            url = self._build_url(street, city, state, zip_code)
            logger.debug(f"[ZILLOW] Fetching: {url}")
            async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
                resp = await client.get(url, headers=self._get_headers())

            logger.debug(f"[ZILLOW] Response status: {resp.status_code}")

            if resp.status_code != 200:
                logger.debug(f"[ZILLOW] ✗ HTTP error: {resp.status_code}")
                return VerificationResult(
                    source="Zillow",
                    found_value=None,
                    expected_value=expected_value,
                    error=f"HTTP {resp.status_code}",
                )

            html = resp.text
            zestimate = self._extract_zestimate(html)

            if zestimate is None:
                logger.debug(f"[ZILLOW] ✗ Zestimate not found in HTML ({len(html)} bytes)")
                return VerificationResult(
                    source="Zillow",
                    found_value=None,
                    expected_value=expected_value,
                    error="Zestimate not found on page",
                )

            zestimate_cents = int(zestimate * 100)
            diff_pct = (
                ((zestimate_cents - expected_value) / expected_value) * 100
                if expected_value
                else 0
            )

            match = abs(diff_pct) < 15
            match_str = "✓ MATCH" if match else "✗ NO MATCH"
            logger.info(
                f"[ZILLOW] {match_str} - Zestimate: ${zestimate:,.0f} (diff: {diff_pct:+.1f}%)"
            )

            return VerificationResult(
                source="Zillow",
                found_value=zestimate_cents,
                expected_value=expected_value,
                diff_pct=round(diff_pct, 1),
                match=match,
            )

        except httpx.TimeoutException:
            return VerificationResult(
                source="Zillow",
                found_value=None,
                expected_value=expected_value,
                error="Request timeout",
            )
        except Exception as e:
            logger.warning(f"Zillow scrape failed: {e}")
            return VerificationResult(
                source="Zillow",
                found_value=None,
                expected_value=expected_value,
                error=str(e),
            )

    def _extract_zestimate(self, html: str) -> float | None:
        """Extract Zestimate value from Zillow page HTML."""
        # Method 1: Try JSON-LD structured data
        ld_match = re.search(
            r'<script type="application/ld\+json">(.*?)</script>',
            html,
            re.DOTALL,
        )
        if ld_match:
            try:
                data = json.loads(ld_match.group(1))
                # Handle array of JSON-LD objects
                if isinstance(data, list):
                    for item in data:
                        if isinstance(item, dict) and "offers" in item:
                            price = item["offers"].get("price")
                            if price:
                                return float(price)
                elif isinstance(data, dict) and "offers" in data:
                    price = data["offers"].get("price")
                    if price:
                        return float(price)
            except (json.JSONDecodeError, ValueError, TypeError):
                pass

        # Method 2: Try __NEXT_DATA__ script (React hydration data)
        next_data_match = re.search(
            r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>',
            html,
            re.DOTALL,
        )
        if next_data_match:
            try:
                data = json.loads(next_data_match.group(1))
                # Navigate through Next.js props structure
                props = data.get("props", {}).get("pageProps", {})
                property_data = props.get("initialData", {}).get("property", {})
                zestimate = property_data.get("zestimate")
                if zestimate:
                    return float(zestimate)
            except (json.JSONDecodeError, ValueError, TypeError, KeyError):
                pass

        # Method 3: Regex for displayed Zestimate value
        patterns = [
            r'Zestimate[®:\s]*\$([0-9,]+)',
            r'"zestimate"\s*:\s*(\d+)',
            r'data-testid="zestimate"[^>]*>\$([0-9,]+)',
        ]
        for pattern in patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                try:
                    return float(match.group(1).replace(",", ""))
                except ValueError:
                    continue

        return None

    async def verify_rent(
        self,
        street: str,
        city: str,
        state: str,
        zip_code: str,
        expected_rent: int,  # dollars/month
    ) -> VerificationResult:
        """
        Fetch Rent Zestimate from Zillow and compare with expected rent.

        Args:
            street: Street address
            city: City name
            state: Two-letter state code
            zip_code: ZIP code
            expected_rent: Expected monthly rent in dollars

        Returns:
            VerificationResult with comparison data
        """
        await self._rate_limit()

        logger.debug(f"[ZILLOW] Verifying rent for {street}, {city}, {state} {zip_code}")
        logger.debug(f"[ZILLOW] Expected rent: ${expected_rent:,}/mo")

        try:
            url = self._build_url(street, city, state, zip_code)
            logger.debug(f"[ZILLOW] Fetching: {url}")
            async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
                resp = await client.get(url, headers=self._get_headers())

            logger.debug(f"[ZILLOW] Response status: {resp.status_code}")

            if resp.status_code != 200:
                logger.debug(f"[ZILLOW] ✗ HTTP error: {resp.status_code}")
                return VerificationResult(
                    source="Zillow",
                    found_value=None,
                    expected_value=expected_rent,
                    error=f"HTTP {resp.status_code}",
                )

            html = resp.text
            rent_zestimate = self._extract_rent_zestimate(html)

            if rent_zestimate is None:
                logger.debug(f"[ZILLOW] ✗ Rent Zestimate not found in HTML ({len(html)} bytes)")
                return VerificationResult(
                    source="Zillow",
                    found_value=None,
                    expected_value=expected_rent,
                    error="Rent Zestimate not found on page",
                )

            diff_pct = (
                ((rent_zestimate - expected_rent) / expected_rent) * 100
                if expected_rent
                else 0
            )

            match = abs(diff_pct) < 15
            match_str = "✓ MATCH" if match else "✗ NO MATCH"
            logger.info(
                f"[ZILLOW] {match_str} - Rent Zestimate: ${rent_zestimate:,}/mo (diff: {diff_pct:+.1f}%)"
            )

            return VerificationResult(
                source="Zillow",
                found_value=rent_zestimate,
                expected_value=expected_rent,
                diff_pct=round(diff_pct, 1),
                match=match,
            )

        except httpx.TimeoutException:
            return VerificationResult(
                source="Zillow",
                found_value=None,
                expected_value=expected_rent,
                error="Request timeout",
            )
        except Exception as e:
            logger.warning(f"Zillow rent scrape failed: {e}")
            return VerificationResult(
                source="Zillow",
                found_value=None,
                expected_value=expected_rent,
                error=str(e),
            )

    def _extract_rent_zestimate(self, html: str) -> int | None:
        """Extract Rent Zestimate value from Zillow page HTML."""
        # Method 1: Try __NEXT_DATA__
        next_data_match = re.search(
            r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>',
            html,
            re.DOTALL,
        )
        if next_data_match:
            try:
                data = json.loads(next_data_match.group(1))
                props = data.get("props", {}).get("pageProps", {})
                property_data = props.get("initialData", {}).get("property", {})
                rent_zestimate = property_data.get("rentZestimate")
                if rent_zestimate:
                    return int(rent_zestimate)
            except (json.JSONDecodeError, ValueError, TypeError, KeyError):
                pass

        # Method 2: Regex patterns for displayed rent
        patterns = [
            r'Rent Zestimate[®:\s]*\$([0-9,]+)/mo',
            r'"rentZestimate"\s*:\s*(\d+)',
            r'estimated rent[:\s]*\$([0-9,]+)',
            r'data-testid="rental-price"[^>]*>\$([0-9,]+)',
        ]
        for pattern in patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                try:
                    return int(match.group(1).replace(",", ""))
                except ValueError:
                    continue

        return None


# Singleton instance
zillow_scraper = ZillowScraper()
