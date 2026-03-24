"""Test script for Encompass API integration."""
import asyncio
import os
import sys

# Load env manually
with open(".env") as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, val = line.split("=", 1)
            os.environ[key] = val

from app.adapters.encompass import encompass_client, EncompassRealClient


async def main():
    print("=" * 60)
    print("Encompass API Test")
    print("=" * 60)

    # Check if we have a real client
    if not isinstance(encompass_client, EncompassRealClient):
        print("ERROR: Using stub client. Check your credentials in .env")
        return

    print(f"Base URL: {encompass_client.base_url}")
    print(f"Username: {encompass_client.username}")
    print(f"Loan Folder: {encompass_client.loan_folder}")
    print()

    # Test 1: Authentication
    print("1. Testing authentication...")
    try:
        token = await encompass_client._get_access_token()
        print(f"   OK - Got token: {token[:20]}...")
    except Exception as e:
        print(f"   FAILED - {e}")
        return
    print()

    # Check if a loan GUID was provided as argument
    loan_guid = sys.argv[1] if len(sys.argv) > 1 else None

    if loan_guid:
        # Test with specific loan GUID
        print(f"2. Getting loan details for GUID: {loan_guid}")
        try:
            loan = await encompass_client.get_loan(loan_guid)
            print(f"   Loan Number: {loan.get('loanNumber') or loan.get('loanIdNumber')}")
            borrower = loan.get('applications', [{}])[0].get('borrower', {})
            print(f"   Borrower: {borrower.get('firstName', 'N/A')} {borrower.get('lastName', '')}")
            print(f"   Loan Amount: ${loan.get('loanAmount', 0):,.2f}")
            prop = loan.get('property', {})
            print(f"   Property: {prop.get('streetAddress', 'N/A')}, {prop.get('city', '')}, {prop.get('state', '')}")
        except Exception as e:
            print(f"   FAILED - {e}")
        print()

        # Test 3: Read specific fields
        print(f"3. Reading fields from loan...")
        try:
            fields = await encompass_client.read_fields(loan_guid, [
                "364",  # Loan ID Number
                "1014", # Interest Rate
                "1109", # Loan Amount
                "4",    # Borrower First Name
                "36",   # Borrower Last Name
                "Log.MS.CurrentMilestone",
            ])
            print(f"   Loan ID (364): {fields.get('364')}")
            print(f"   Rate (1014): {fields.get('1014')}")
            print(f"   Amount (1109): {fields.get('1109')}")
            print(f"   Borrower (4, 36): {fields.get('4')} {fields.get('36')}")
            print(f"   Milestone: {fields.get('Log.MS.CurrentMilestone')}")
        except Exception as e:
            print(f"   FAILED - {e}")
    else:
        # Try searching for loans
        print("2. Searching for recent loans (pipeline API)...")
        try:
            results = await encompass_client.search_loans({
                "fields": ["Loan.LoanNumber", "Loan.LoanFolder", "Loan.BorrowerName"],
            })
            print(f"   Found {len(results)} loans")
            for i, loan in enumerate(results[:5]):
                print(f"   - {loan.get('loanGuid', 'N/A')[:8]}... | {loan.get('fields', {})}")
        except Exception as e:
            print(f"   FAILED - {e}")
            print()
            print("   NOTE: Pipeline search may require additional permissions.")
            print("   Try running with a specific loan GUID:")
            print("   python test_encompass.py <loan-guid>")

    print()
    print("=" * 60)
    print("Test complete!")


if __name__ == "__main__":
    asyncio.run(main())
