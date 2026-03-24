"""Repository instances."""

from app.db.repositories.leads import LeadRepository
from app.db.repositories.borrowers import BorrowerRepository
from app.db.repositories.properties import PropertyRepository
from app.db.repositories.applications import ApplicationRepository
from app.db.repositories.avm import AVMRepository
from app.db.repositories.decisions import DecisionRepository
from app.db.repositories.offers import OfferRepository
from app.db.repositories.api_responses import APIResponseRepository

lead_repo = LeadRepository()
borrower_repo = BorrowerRepository()
property_repo = PropertyRepository()
application_repo = ApplicationRepository()
avm_repo = AVMRepository()
decision_repo = DecisionRepository()
offer_repo = OfferRepository()
api_response_repo = APIResponseRepository()
