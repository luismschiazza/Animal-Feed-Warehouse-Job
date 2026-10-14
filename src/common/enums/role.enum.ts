/**
 * Stable business roles used as an input to authorization policies.
 *
 * Roles alone must not authorize access to a specific record. Resource ownership,
 * organization membership and other attributes will be evaluated by ABAC/PBAC
 * policies in subsequent work.
 */
export enum Role {
  SYSTEM_ADMIN = 'SYSTEM_ADMIN',
  ORGANIZATION_OWNER = 'ORGANIZATION_OWNER',
  MANAGER = 'MANAGER',
  INVENTORY_OPERATOR = 'INVENTORY_OPERATOR',
  SALES_ASSOCIATE = 'SALES_ASSOCIATE',
  CASHIER = 'CASHIER',
  PURCHASING_AGENT = 'PURCHASING_AGENT',
  FINANCIAL_ANALYST = 'FINANCIAL_ANALYST',
  AUDITOR = 'AUDITOR',
  CUSTOMER = 'CUSTOMER',
}
