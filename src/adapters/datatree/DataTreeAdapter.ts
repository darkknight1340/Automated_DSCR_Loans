/**
 * DataTree API Adapter
 *
 * Integrates with First American's DataTree/Digital Gateway API for:
 * - AVM (Automated Valuation Model)
 * - Property data
 * - Ownership information
 *
 * API Documentation: https://developer.firstam.io/api/docs
 *
 * Authentication: App ID + App Key headers
 * Format: JSON
 */

import { v4 as uuidv4 } from 'uuid';
import type { IAVMVendor, Address, AVMReport, AVMConfidence } from '../../services/valuation/ValuationService.js';

// =============================================================================
// Configuration
// =============================================================================

export interface DataTreeConfig {
  appId: string;
  appKey: string;
  baseUrl: string;
  timeout: number;
}

function getConfig(): DataTreeConfig | null {
  const appId = process.env.DATATREE_APP_ID;
  const appKey = process.env.DATATREE_APP_KEY;

  if (!appId || !appKey || appId === 'demo' || appKey === 'demo') {
    console.warn('DataTree API credentials not configured. Set DATATREE_APP_ID and DATATREE_APP_KEY for real data.');
    return null;
  }

  return {
    appId,
    appKey,
    baseUrl: process.env.DATATREE_BASE_URL || 'https://api.firstam.io',
    timeout: parseInt(process.env.DATATREE_TIMEOUT || '30000', 10),
  };
}

// =============================================================================
// Types
// =============================================================================

export interface DataTreeAVMRequest {
  address: {
    streetAddress: string;
    city: string;
    state: string;
    zip: string;
  };
  productType?: 'PROCISION_POWER' | 'PROCISION_PREMIER' | 'STANDARD';
}

export interface DataTreeAVMResponse {
  orderId: string;
  status: 'SUCCESS' | 'NO_VALUE' | 'ERROR';
  avm?: {
    estimatedValue: number;
    valueLow: number;
    valueHigh: number;
    confidenceScore: number; // 0-100
    fsd: number; // Forecast Standard Deviation
    valueAsOfDate: string;
  };
  property?: {
    propertyType: string;
    yearBuilt: number;
    squareFeet: number;
    lotSize: number;
    bedrooms: number;
    bathrooms: number;
    stories: number;
  };
  saleHistory?: {
    lastSaleDate: string;
    lastSalePrice: number;
  };
  comparables?: Array<{
    address: string;
    distance: number;
    saleDate: string;
    salePrice: number;
    squareFeet: number;
    bedrooms: number;
    bathrooms: number;
    similarity: number;
  }>;
  error?: {
    code: string;
    message: string;
  };
}

export interface DataTreePropertyRequest {
  address: {
    streetAddress: string;
    city: string;
    state: string;
    zip: string;
  };
  includeOwnership?: boolean;
  includeAssessment?: boolean;
  includeMortgage?: boolean;
}

export interface DataTreePropertyResponse {
  property: {
    apn: string;
    address: {
      streetAddress: string;
      city: string;
      state: string;
      zip: string;
      county: string;
    };
    characteristics: {
      propertyType: string;
      yearBuilt: number;
      squareFeet: number;
      lotSizeSqft: number;
      bedrooms: number;
      bathrooms: number;
      stories: number;
      units: number;
    };
  };
  ownership?: {
    ownerNames: string[];
    ownerType: 'INDIVIDUAL' | 'CORPORATION' | 'TRUST' | 'LLC';
    mailingAddress: {
      streetAddress: string;
      city: string;
      state: string;
      zip: string;
    };
    ownerOccupied: boolean;
    vestingType: string;
    acquisitionDate: string;
    acquisitionPrice: number;
  };
  assessment?: {
    assessedValue: number;
    landValue: number;
    improvementValue: number;
    taxYear: number;
    annualTaxAmount: number;
  };
  mortgages?: Array<{
    lenderName: string;
    originalAmount: number;
    recordingDate: string;
    loanType: string;
    interestRateType: 'FIXED' | 'ARM';
    maturityDate?: string;
  }>;
}

// =============================================================================
// DataTree AVM Vendor Implementation
// =============================================================================

export class DataTreeAVMVendor implements IAVMVendor {
  name = 'DataTree';
  productCode = 'PROCISION_POWER';
  priority = 1;

  private config: DataTreeConfig | null;

  constructor() {
    this.config = getConfig();
  }

  private isConfigured(): boolean {
    return this.config !== null;
  }

  async orderAVM(address: Address): Promise<{
    success: boolean;
    orderId: string;
    report?: AVMReport;
    error?: { code: string; message: string };
  }> {
    const orderId = uuidv4();

    if (!this.isConfigured()) {
      return {
        success: false,
        orderId,
        error: { code: 'NOT_CONFIGURED', message: 'DataTree API not configured' },
      };
    }

    try {
      const response = await this.callAPI<DataTreeAVMResponse>('/valuation/avm', {
        address: {
          streetAddress: address.street + (address.unit ? ` ${address.unit}` : ''),
          city: address.city,
          state: address.state,
          zip: address.zipCode,
        },
        productType: 'PROCISION_POWER',
      });

      if (response.status === 'ERROR' || response.error) {
        return {
          success: false,
          orderId,
          error: response.error || { code: 'UNKNOWN', message: 'AVM request failed' },
        };
      }

      if (response.status === 'NO_VALUE' || !response.avm) {
        return {
          success: false,
          orderId,
          error: { code: 'NO_VALUE', message: 'No AVM value available for this property' },
        };
      }

      // Map confidence score to level
      const confidenceLevel = this.mapConfidenceLevel(response.avm.confidenceScore);

      const report: AVMReport = {
        id: uuidv4(),
        applicationId: '',
        propertyId: '',
        address,
        vendorName: this.name,
        vendorOrderId: response.orderId || orderId,
        vendorProductCode: this.productCode,
        orderDate: new Date(),
        completedDate: new Date(),
        status: 'COMPLETED',
        estimatedValue: Math.round(response.avm.estimatedValue * 100), // Convert to cents
        confidenceScore: response.avm.confidenceScore,
        confidenceLevel,
        valueLow: Math.round(response.avm.valueLow * 100),
        valueHigh: Math.round(response.avm.valueHigh * 100),
        valueRange: Math.round((response.avm.valueHigh - response.avm.valueLow) * 100),
        propertyCharacteristics: response.property ? {
          propertyType: this.mapPropertyType(response.property.propertyType),
          yearBuilt: response.property.yearBuilt,
          squareFeet: response.property.squareFeet,
          lotSize: response.property.lotSize,
          bedrooms: response.property.bedrooms,
          bathrooms: response.property.bathrooms,
          stories: response.property.stories,
        } : undefined,
        lastSaleDate: response.saleHistory ? new Date(response.saleHistory.lastSaleDate) : undefined,
        lastSalePrice: response.saleHistory ? Math.round(response.saleHistory.lastSalePrice * 100) : undefined,
        comparables: response.comparables?.map(comp => ({
          address: comp.address,
          distance: comp.distance,
          saleDate: new Date(comp.saleDate),
          salePrice: Math.round(comp.salePrice * 100),
          squareFeet: comp.squareFeet,
          pricePerSqFt: comp.squareFeet ? Math.round((comp.salePrice / comp.squareFeet) * 100) : undefined,
          bedrooms: comp.bedrooms,
          bathrooms: comp.bathrooms,
          similarity: comp.similarity,
        })),
        cascadePosition: 0,
        isCascadeFallback: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      return {
        success: true,
        orderId: report.vendorOrderId,
        report,
      };
    } catch (error) {
      return {
        success: false,
        orderId,
        error: {
          code: 'API_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  async getReport(orderId: string): Promise<AVMReport | null> {
    // DataTree provides synchronous responses, so this is a no-op
    // In production, you might cache reports and retrieve them here
    console.log(`getReport called for orderId: ${orderId}`);
    return null;
  }

  private async callAPI<T>(endpoint: string, body: unknown): Promise<T> {
    if (!this.config) {
      throw new Error('DataTree API not configured');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-App-Id': this.config.appId,
          'X-App-Key': this.config.appKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DataTree API error ${response.status}: ${errorText}`);
      }

      return response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private mapConfidenceLevel(score: number): AVMConfidence {
    if (score >= 80) return 'HIGH';
    if (score >= 60) return 'MEDIUM';
    if (score >= 40) return 'LOW';
    return 'NO_VALUE';
  }

  private mapPropertyType(type: string): 'SFR' | 'CONDO' | 'TOWNHOUSE' | '2_4_UNIT' | 'MULTIFAMILY' {
    const normalized = type.toUpperCase();
    if (normalized.includes('CONDO')) return 'CONDO';
    if (normalized.includes('TOWN')) return 'TOWNHOUSE';
    if (normalized.includes('MULTI') || normalized.includes('PLEX')) return 'MULTIFAMILY';
    if (normalized.includes('DUPLEX') || normalized.includes('TRIPLEX') || normalized.includes('QUAD')) return '2_4_UNIT';
    return 'SFR';
  }
}

// =============================================================================
// DataTree Property Service
// =============================================================================

export class DataTreePropertyService {
  private config: DataTreeConfig | null;

  constructor() {
    this.config = getConfig();
  }

  private isConfigured(): boolean {
    return this.config !== null;
  }

  async getPropertyData(address: Address): Promise<DataTreePropertyResponse | null> {
    if (!this.isConfigured()) {
      console.log('DataTree not configured, returning null');
      return null;
    }
    try {
      const response = await this.callAPI<DataTreePropertyResponse>('/property/details', {
        address: {
          streetAddress: address.street + (address.unit ? ` ${address.unit}` : ''),
          city: address.city,
          state: address.state,
          zip: address.zipCode,
        },
        includeOwnership: true,
        includeAssessment: true,
        includeMortgage: true,
      });

      return response;
    } catch (error) {
      console.error('DataTree property lookup failed:', error);
      return null;
    }
  }

  private async callAPI<T>(endpoint: string, body: unknown): Promise<T> {
    if (!this.config) {
      throw new Error('DataTree API not configured');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-App-Id': this.config.appId,
          'X-App-Key': this.config.appKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DataTree API error ${response.status}: ${errorText}`);
      }

      return response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// Export singleton instances
export const dataTreeAVM = new DataTreeAVMVendor();
export const dataTreeProperty = new DataTreePropertyService();
