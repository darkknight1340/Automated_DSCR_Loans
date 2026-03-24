"""External service adapters."""

from app.adapters.encompass import encompass_service
from app.adapters.datatree import datatree_avm, datatree_property
from app.adapters.propertyreach import property_reach
from app.adapters.rentcast import rentcast_service
from app.adapters.clear_capital import clear_capital_service
from app.adapters.zillow_scraper import zillow_scraper
from app.adapters.redfin_scraper import redfin_scraper
from app.adapters.base import AVMResult, RentEstimateResult, VerificationResult, DataSources

__all__ = [
    "encompass_service",
    "datatree_avm",
    "datatree_property",
    "property_reach",
    "rentcast_service",
    "clear_capital_service",
    "zillow_scraper",
    "redfin_scraper",
    "AVMResult",
    "RentEstimateResult",
    "VerificationResult",
    "DataSources",
]
