"""
Redfin Web Scraper for AVM/Rent Verification

Scrapes Redfin property pages to extract Redfin Estimate values
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

logger = logging.getLogger("redfin")
logger.setLevel(logging.DEBUG)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setLevel(logging.DEBUG)
    handler.setFormatter(logging.Formatter('%(message)s'))
    logger.addHandler(handler)

# Default delay between requests (milliseconds)
DELAY_MS = int(os.getenv("REDFIN_SCRAPE_DELAY_MS", "2000"))


class RedfinScraper:
    """Scrapes Redfin for Redfin Estimate values."""

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
        """Build Redfin search URL from address components."""
        # Redfin uses search-based URL resolution
        # Format: https://www.redfin.com/stingray/do/query-location?al=1&location=123+Main+St,+City,+ST+12345
        addr = f"{street}, {city}, {state} {zip_code}"
        return f"https://www.redfin.com/stingray/do/query-location?al=1&location={quote(addr)}"

    def _get_headers(self) -> dict[str, str]:
        """Get headers that mimic a browser request."""
        return {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/json",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Cache-Control": "max-age=0",
        }

    async def _get_property_url(
        self,
        client: httpx.AsyncClient,
        street: str,
        city: str,
        state: str,
        zip_code: str,
    ) -> str | None:
        """Resolve address to Redfin property page URL."""
        search_url = self._build_url(street, city, state, zip_code)

        try:
            resp = await client.get(
                search_url,
                headers={
                    **self._get_headers(),
                    "Accept": "application/json",
                },
            )

            if resp.status_code != 200:
                return None

            # Redfin returns JSON with property URL
            text = resp.text

            # Response may have a JSONP prefix like "{}&&"
            if text.startswith("{}&&"):
                text = text[4:]

            data = json.loads(text)

            # Extract property URL from response
            payload = data.get("payload", {})
            exact_match = payload.get("exactMatch", {})
            url = exact_match.get("url")

            if url:
                return f"https://www.redfin.com{url}"

            # Try getting from sections
            sections = payload.get("sections", [])
            for section in sections:
                rows = section.get("rows", [])
                for row in rows:
                    url = row.get("url")
                    if url:
                        return f"https://www.redfin.com{url}"

        except (json.JSONDecodeError, KeyError, TypeError):
            pass

        return None

    async def verify_value(
        self,
        street: str,
        city: str,
        state: str,
        zip_code: str,
        expected_value: int,  # cents
    ) -> VerificationResult:
        """
        Fetch Redfin Estimate and compare with expected value.

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

        logger.debug(f"[REDFIN] Verifying AVM for {street}, {city}, {state} {zip_code}")
        logger.debug(f"[REDFIN] Expected value: ${expected_value / 100:,.0f}")

        try:
            async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
                # First resolve the property URL
                logger.debug(f"[REDFIN] Resolving property URL...")
                property_url = await self._get_property_url(
                    client, street, city, state, zip_code
                )

                if not property_url:
                    logger.debug(f"[REDFIN] ✗ Property not found")
                    return VerificationResult(
                        source="Redfin",
                        found_value=None,
                        expected_value=expected_value,
                        error="Property not found on Redfin",
                    )

                logger.debug(f"[REDFIN] Found URL: {property_url}")

                # Fetch the property page
                resp = await client.get(property_url, headers=self._get_headers())

                logger.debug(f"[REDFIN] Response status: {resp.status_code}")

                if resp.status_code != 200:
                    logger.debug(f"[REDFIN] ✗ HTTP error: {resp.status_code}")
                    return VerificationResult(
                        source="Redfin",
                        found_value=None,
                        expected_value=expected_value,
                        error=f"HTTP {resp.status_code}",
                    )

                html = resp.text
                estimate = self._extract_estimate(html)

                if estimate is None:
                    logger.debug(f"[REDFIN] ✗ Estimate not found in HTML ({len(html)} bytes)")
                    return VerificationResult(
                        source="Redfin",
                        found_value=None,
                        expected_value=expected_value,
                        error="Redfin Estimate not found on page",
                    )

                estimate_cents = int(estimate * 100)
                diff_pct = (
                    ((estimate_cents - expected_value) / expected_value) * 100
                    if expected_value
                    else 0
                )

                match = abs(diff_pct) < 15
                match_str = "✓ MATCH" if match else "✗ NO MATCH"
                logger.info(
                    f"[REDFIN] {match_str} - Estimate: ${estimate:,.0f} (diff: {diff_pct:+.1f}%)"
                )

                return VerificationResult(
                    source="Redfin",
                    found_value=estimate_cents,
                    expected_value=expected_value,
                    diff_pct=round(diff_pct, 1),
                    match=match,
                )

        except httpx.TimeoutException:
            return VerificationResult(
                source="Redfin",
                found_value=None,
                expected_value=expected_value,
                error="Request timeout",
            )
        except Exception as e:
            logger.warning(f"Redfin scrape failed: {e}")
            return VerificationResult(
                source="Redfin",
                found_value=None,
                expected_value=expected_value,
                error=str(e),
            )

    def _extract_estimate(self, html: str) -> float | None:
        """Extract Redfin Estimate value from property page HTML."""
        # Method 1: Try finding in script data
        script_match = re.search(
            r'<script[^>]*>window\.__reactServerState\s*=\s*({.*?})\s*</script>',
            html,
            re.DOTALL,
        )
        if script_match:
            try:
                data = json.loads(script_match.group(1))
                # Navigate Redfin's data structure
                for key, value in data.items():
                    if isinstance(value, dict):
                        estimate = value.get("predictedValue") or value.get("avm")
                        if estimate:
                            return float(estimate)
            except (json.JSONDecodeError, ValueError, TypeError):
                pass

        # Method 2: Try initial data script
        init_match = re.search(
            r'<script[^>]*id="initial-state"[^>]*>(.*?)</script>',
            html,
            re.DOTALL,
        )
        if init_match:
            try:
                data = json.loads(init_match.group(1))
                # Look for estimate in various places
                if "propertyData" in data:
                    prop = data["propertyData"]
                    estimate = prop.get("predictedValue") or prop.get("avm", {}).get("value")
                    if estimate:
                        return float(estimate)
            except (json.JSONDecodeError, ValueError, TypeError):
                pass

        # Method 3: Regex patterns for displayed estimate
        patterns = [
            r'Redfin Estimate[:\s]*\$([0-9,]+)',
            r'"predictedValue"\s*:\s*(\d+)',
            r'"avm"\s*:\s*\{\s*"value"\s*:\s*(\d+)',
            r'data-rf-test-id="avmLdpPrice"[^>]*>\$([0-9,]+)',
            r'class="[^"]*EstimatedValue[^"]*"[^>]*>\$([0-9,]+)',
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
        Fetch Redfin Rental Estimate and compare with expected rent.

        Note: Redfin's rental estimates are less prominent than Zillow's.
        May not be available for all properties.

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

        logger.debug(f"[REDFIN] Verifying rent for {street}, {city}, {state} {zip_code}")
        logger.debug(f"[REDFIN] Expected rent: ${expected_rent:,}/mo")

        try:
            async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
                logger.debug(f"[REDFIN] Resolving property URL...")
                property_url = await self._get_property_url(
                    client, street, city, state, zip_code
                )

                if not property_url:
                    logger.debug(f"[REDFIN] ✗ Property not found")
                    return VerificationResult(
                        source="Redfin",
                        found_value=None,
                        expected_value=expected_rent,
                        error="Property not found on Redfin",
                    )

                logger.debug(f"[REDFIN] Found URL: {property_url}")
                resp = await client.get(property_url, headers=self._get_headers())

                logger.debug(f"[REDFIN] Response status: {resp.status_code}")

                if resp.status_code != 200:
                    logger.debug(f"[REDFIN] ✗ HTTP error: {resp.status_code}")
                    return VerificationResult(
                        source="Redfin",
                        found_value=None,
                        expected_value=expected_rent,
                        error=f"HTTP {resp.status_code}",
                    )

                html = resp.text
                rent_estimate = self._extract_rent_estimate(html)

                if rent_estimate is None:
                    logger.debug(f"[REDFIN] ✗ Rent estimate not found in HTML ({len(html)} bytes)")
                    return VerificationResult(
                        source="Redfin",
                        found_value=None,
                        expected_value=expected_rent,
                        error="Rental estimate not found on page",
                    )

                diff_pct = (
                    ((rent_estimate - expected_rent) / expected_rent) * 100
                    if expected_rent
                    else 0
                )

                match = abs(diff_pct) < 15
                match_str = "✓ MATCH" if match else "✗ NO MATCH"
                logger.info(
                    f"[REDFIN] {match_str} - Rent Estimate: ${rent_estimate:,}/mo (diff: {diff_pct:+.1f}%)"
                )

                return VerificationResult(
                    source="Redfin",
                    found_value=rent_estimate,
                    expected_value=expected_rent,
                    diff_pct=round(diff_pct, 1),
                    match=abs(diff_pct) < 15,
                )

        except httpx.TimeoutException:
            return VerificationResult(
                source="Redfin",
                found_value=None,
                expected_value=expected_rent,
                error="Request timeout",
            )
        except Exception as e:
            logger.warning(f"Redfin rent scrape failed: {e}")
            return VerificationResult(
                source="Redfin",
                found_value=None,
                expected_value=expected_rent,
                error=str(e),
            )

    def _extract_rent_estimate(self, html: str) -> int | None:
        """Extract rental estimate from Redfin page HTML."""
        # Redfin rental estimates are less structured
        # Try common patterns

        # Method 1: Look for rental estimate in data
        patterns = [
            r'"rentalEstimate"\s*:\s*(\d+)',
            r'"rentValue"\s*:\s*(\d+)',
            r'Rental Estimate[:\s]*\$([0-9,]+)',
            r'estimated rent[:\s]*\$([0-9,]+)/mo',
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
redfin_scraper = RedfinScraper()
