/**
 * PropertyReach API Adapter
 *
 * Integrates with PropertyReach API for:
 * - Property details (assessor data, characteristics)
 * - Owner information (skip trace)
 * - Mortgage/loan data
 * - Short-term rental (STR) detection
 *
 * API Documentation: https://www.propertyreach.com/property-api
 *
 * Data sources: County recordings, Assessor, Deed and Mortgage, Pre-Foreclosure
 * Update frequency: Daily
 */

// =============================================================================
// Configuration
// =============================================================================

export interface PropertyReachConfig {
  apiKey: string;
  baseUrl: string;
  timeout: number;
}

function getConfig(): PropertyReachConfig | null {
  const apiKey = process.env.PROPERTYREACH_API_KEY;

  if (!apiKey || apiKey === 'demo') {
    console.warn('PropertyReach API key not configured. Set PROPERTYREACH_API_KEY for real data.');
    return null;
  }

  return {
    apiKey,
    baseUrl: process.env.PROPERTYREACH_BASE_URL || 'https://api.propertyreach.com/v1',
    timeout: parseInt(process.env.PROPERTYREACH_TIMEOUT || '30000', 10),
  };
}

// =============================================================================
// Types
// =============================================================================

export interface PropertyReachAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export interface PropertyReachSearchRequest {
  address?: PropertyReachAddress;
  apn?: string;
  filters?: {
    equity?: { min?: number; max?: number };
    loanAmount?: { min?: number; max?: number };
    propertyType?: string[];
    ownerType?: ('INDIVIDUAL' | 'CORPORATION' | 'TRUST' | 'LLC')[];
  };
  limit?: number;
  offset?: number;
}

export interface PropertyReachProperty {
  id: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
    county: string;
    fips: string;
  };
  apn: string;
  characteristics: {
    propertyType: string;
    propertyUse: string;
    yearBuilt: number;
    squareFeet: number;
    lotSizeSqft: number;
    bedrooms: number;
    bathrooms: number;
    stories: number;
    units: number;
    pool: boolean;
    garage: boolean;
    garageSpaces: number;
  };
  assessment: {
    assessedValue: number;
    landValue: number;
    improvementValue: number;
    taxYear: number;
    annualTaxes: number;
  };
  marketValue: {
    estimatedValue: number;
    valueLow: number;
    valueHigh: number;
    pricePerSqFt: number;
    lastUpdated: string;
  };
  saleHistory: Array<{
    saleDate: string;
    salePrice: number;
    saleType: string;
    documentNumber: string;
    grantee: string;
    grantor: string;
  }>;
}

export interface PropertyReachOwner {
  names: string[];
  ownerType: 'INDIVIDUAL' | 'CORPORATION' | 'TRUST' | 'LLC' | 'OTHER';
  ownerOccupied: boolean;
  vestingType: string;
  mailingAddress: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  contact?: {
    emails: string[];
    phones: Array<{
      number: string;
      type: 'MOBILE' | 'LANDLINE' | 'VOIP';
      verified: boolean;
    }>;
  };
  demographics?: {
    age: number;
    lengthOfResidence: number;
    householdIncome: string;
  };
}

export interface PropertyReachMortgage {
  position: number; // 1 = first, 2 = second, etc.
  lenderName: string;
  originalAmount: number;
  currentBalance?: number;
  recordingDate: string;
  maturityDate?: string;
  loanType: string;
  interestRateType: 'FIXED' | 'ARM' | 'INTEREST_ONLY';
  interestRate?: number;
  monthlyPayment?: number;
  deedType: string;
  documentNumber: string;
}

export interface PropertyReachEquity {
  estimatedValue: number;
  totalMortgageBalance: number;
  estimatedEquity: number;
  equityPercent: number;
  ltvRatio: number;
}

export interface PropertyReachSTRAnalysis {
  isShortTermRental: boolean;
  confidence: number; // 0-100
  platforms: Array<{
    platform: 'AIRBNB' | 'VRBO' | 'BOOKING' | 'OTHER';
    listingUrl?: string;
    nightly: {
      avgRate: number;
      minRate: number;
      maxRate: number;
    };
    occupancy: {
      avgRate: number; // 0-100
      peakSeasonRate: number;
      offSeasonRate: number;
    };
    reviews: {
      count: number;
      avgRating: number;
    };
    lastActive: string;
  }>;
  estimatedAnnualRevenue?: number;
  estimatedMonthlyRevenue?: number;
  marketComps?: Array<{
    address: string;
    nightlyRate: number;
    occupancyRate: number;
    monthlyRevenue: number;
  }>;
}

export interface PropertyReachFullReport {
  property: PropertyReachProperty;
  owner: PropertyReachOwner;
  mortgages: PropertyReachMortgage[];
  equity: PropertyReachEquity;
  strAnalysis?: PropertyReachSTRAnalysis;
  preForeclosure?: {
    status: 'NOTICE_OF_DEFAULT' | 'LIS_PENDENS' | 'AUCTION_SCHEDULED' | 'REO';
    filingDate: string;
    auctionDate?: string;
    defaultAmount?: number;
  };
  lastUpdated: string;
}

// =============================================================================
// PropertyReach API Client
// =============================================================================

export class PropertyReachAdapter {
  private config: PropertyReachConfig | null;

  constructor() {
    this.config = getConfig();
  }

  private isConfigured(): boolean {
    return this.config !== null;
  }

  /**
   * Get comprehensive property report by address
   */
  async getPropertyReport(address: PropertyReachAddress): Promise<PropertyReachFullReport | null> {
    if (!this.isConfigured()) {
      console.log('PropertyReach not configured, returning null');
      return null;
    }
    try {
      return await this.callAPI<PropertyReachFullReport>('/property/report', {
        address,
        include: ['owner', 'mortgages', 'equity', 'str_analysis', 'pre_foreclosure'],
      });
    } catch (error) {
      console.error('PropertyReach property report failed:', error);
      return null;
    }
  }

  /**
   * Get property details only
   */
  async getPropertyDetails(address: PropertyReachAddress): Promise<PropertyReachProperty | null> {
    try {
      return await this.callAPI<PropertyReachProperty>('/property/details', { address });
    } catch (error) {
      console.error('PropertyReach property details failed:', error);
      return null;
    }
  }

  /**
   * Get owner information with skip trace (contact details)
   */
  async getOwnerInfo(address: PropertyReachAddress, skipTrace: boolean = false): Promise<PropertyReachOwner | null> {
    try {
      return await this.callAPI<PropertyReachOwner>('/property/owner', {
        address,
        skipTrace,
      });
    } catch (error) {
      console.error('PropertyReach owner lookup failed:', error);
      return null;
    }
  }

  /**
   * Get mortgage/loan information
   */
  async getMortgages(address: PropertyReachAddress): Promise<PropertyReachMortgage[]> {
    try {
      const response = await this.callAPI<{ mortgages: PropertyReachMortgage[] }>('/property/mortgages', { address });
      return response.mortgages || [];
    } catch (error) {
      console.error('PropertyReach mortgage lookup failed:', error);
      return [];
    }
  }

  /**
   * Get equity analysis
   */
  async getEquityAnalysis(address: PropertyReachAddress): Promise<PropertyReachEquity | null> {
    try {
      return await this.callAPI<PropertyReachEquity>('/property/equity', { address });
    } catch (error) {
      console.error('PropertyReach equity analysis failed:', error);
      return null;
    }
  }

  /**
   * Detect if property is a short-term rental (STR)
   * Returns STR platform listings, revenue estimates, and market comps
   */
  async detectSTR(address: PropertyReachAddress): Promise<PropertyReachSTRAnalysis | null> {
    try {
      return await this.callAPI<PropertyReachSTRAnalysis>('/property/str-analysis', { address });
    } catch (error) {
      console.error('PropertyReach STR detection failed:', error);
      return null;
    }
  }

  /**
   * Search properties by criteria
   */
  async searchProperties(request: PropertyReachSearchRequest): Promise<{
    properties: PropertyReachProperty[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      return await this.callAPI('/property/search', request);
    } catch (error) {
      console.error('PropertyReach property search failed:', error);
      return { properties: [], total: 0, hasMore: false };
    }
  }

  /**
   * Compute DSCR metrics for property
   * Combines PropertyReach data with loan terms to calculate DSCR
   */
  async computeDSCRInputs(
    address: PropertyReachAddress,
    loanAmount: number,
    interestRate: number,
    termMonths: number
  ): Promise<{
    grossMonthlyRent: number;
    monthlyTaxes: number;
    monthlyInsurance: number;
    monthlyHOA: number;
    isSTR: boolean;
    strMonthlyRevenue?: number;
    estimatedPITI: number;
    estimatedDSCR: number;
  } | null> {
    try {
      const report = await this.getPropertyReport(address);
      if (!report) return null;

      // Get STR analysis if available
      const strData = report.strAnalysis;

      // Calculate monthly P&I (simplified - 30-year amortization)
      const monthlyRate = interestRate / 100 / 12;
      const numPayments = termMonths;
      const monthlyPI = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
        (Math.pow(1 + monthlyRate, numPayments) - 1);

      // Get expense estimates
      const monthlyTaxes = report.property.assessment.annualTaxes / 12;
      const monthlyInsurance = (report.property.marketValue.estimatedValue * 0.0035) / 12; // ~0.35% annual
      const monthlyHOA = 0; // Would need HOA data source

      const estimatedPITI = monthlyPI + monthlyTaxes + monthlyInsurance + monthlyHOA;

      // Determine gross rent based on STR or LTR
      let grossMonthlyRent: number;
      if (strData?.isShortTermRental && strData.estimatedMonthlyRevenue) {
        grossMonthlyRent = strData.estimatedMonthlyRevenue;
      } else {
        // Estimate long-term rent as ~0.8% of value per month (rough estimate)
        grossMonthlyRent = report.property.marketValue.estimatedValue * 0.008;
      }

      const estimatedDSCR = grossMonthlyRent / estimatedPITI;

      return {
        grossMonthlyRent: Math.round(grossMonthlyRent),
        monthlyTaxes: Math.round(monthlyTaxes),
        monthlyInsurance: Math.round(monthlyInsurance),
        monthlyHOA,
        isSTR: strData?.isShortTermRental ?? false,
        strMonthlyRevenue: strData?.estimatedMonthlyRevenue,
        estimatedPITI: Math.round(estimatedPITI),
        estimatedDSCR: Math.round(estimatedDSCR * 100) / 100,
      };
    } catch (error) {
      console.error('DSCR computation failed:', error);
      return null;
    }
  }

  private async callAPI<T>(endpoint: string, body: unknown): Promise<T> {
    if (!this.config) {
      throw new Error('PropertyReach API not configured');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`PropertyReach API error ${response.status}: ${errorText}`);
      }

      return response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// Export singleton instance
export const propertyReach = new PropertyReachAdapter();
