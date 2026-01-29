import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, borrower, property, dscr } = body;

    if (!token) {
      return NextResponse.json(
        { error: 'Missing offer token' },
        { status: 400 }
      );
    }

    // Step 1: Create or update the application in our system
    const applicationResponse = await fetch(`${API_BASE_URL}/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadId: token,
        borrower: {
          borrowerType: 'INDIVIDUAL',
          firstName: borrower.firstName,
          lastName: borrower.lastName,
          email: borrower.email,
          phone: borrower.phone,
        },
        property: {
          address: property.address,
          unit: property.unit,
          city: property.city,
          state: property.state,
          zip: property.zip,
          propertyType: mapPropertyType(property.type),
          yearBuilt: property.yearBuilt,
          squareFeet: property.squareFeet,
          bedrooms: property.bedrooms,
          bathrooms: property.bathrooms,
          currentMonthlyRent: dscr.monthlyRent,
        },
        loanPurpose: 'PURCHASE',
        loanAmount: body.loan?.amount || 0,
        estimatedValue: property.appraisedValue,
      }),
    });

    if (!applicationResponse.ok) {
      const errorData = await applicationResponse.json().catch(() => ({}));
      console.error('Failed to create application:', errorData);
      return NextResponse.json(
        { error: 'Failed to create application', details: errorData },
        { status: 500 }
      );
    }

    const application = await applicationResponse.json();

    // Step 2: Create loan in Encompass
    const encompassResponse = await fetch(
      `${API_BASE_URL}/applications/${application.id}/encompass/create`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (!encompassResponse.ok) {
      const errorData = await encompassResponse.json().catch(() => ({}));
      console.error('Failed to create Encompass loan:', errorData);
      // Don't fail the whole request - application was created
      return NextResponse.json({
        success: true,
        applicationId: application.id,
        encompassSync: false,
        message: 'Application created but Encompass sync failed',
      });
    }

    const encompassData = await encompassResponse.json();

    // Step 3: Sync the verified data to Encompass
    const syncResponse = await fetch(
      `${API_BASE_URL}/applications/${application.id}/encompass/sync`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const syncData = await syncResponse.json().catch(() => ({}));

    // Step 4: Advance milestone to "Application" or "Submitted"
    await fetch(
      `${API_BASE_URL}/applications/${application.id}/encompass/milestone`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          milestone: 'Application',
          reason: 'Borrower verified information via landing page',
        }),
      }
    );

    return NextResponse.json({
      success: true,
      applicationId: application.id,
      encompassLoanGuid: encompassData.loanGuid,
      encompassLoanNumber: encompassData.loanNumber,
      encompassSync: true,
      syncStatus: syncData.syncStatus,
    });
  } catch (error) {
    console.error('Error verifying offer:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

function mapPropertyType(type: string): string {
  const mapping: Record<string, string> = {
    'Single Family Residence': 'SFR',
    'Condo': 'CONDO',
    'Townhouse': 'TOWNHOUSE',
    'Duplex': 'DUPLEX',
    'Triplex': 'TRIPLEX',
    'Fourplex': 'FOURPLEX',
    'Multi-Family (5+)': 'MULTIFAMILY',
  };
  return mapping[type] || 'SFR';
}
