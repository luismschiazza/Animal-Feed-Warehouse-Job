import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Types, model } from 'mongoose';
import { PolicyEngine } from '@/common/authorization/policy-engine.service';
import { PolicyAction, PolicyContext, PolicyResource } from '@/common/authorization/policy.types';
import { AccountStatus } from '@/common/enums/account-status.enum';
import { Role } from '@/common/enums/role.enum';
import {
  CreateProductDto,
  ProductCategory,
  SaleUnit,
  TargetSpecies,
} from '../dtos/validation/create-product.dto';
import { UpdateProductDto } from '../dtos/validation/update-product.dto';
import { Product, ProductSchema } from './product.schema';

const product = {
  sku: 'RAC-CAO-15KG',
  name: 'Ração para cão adulto',
  category: ProductCategory.FEED,
  targetSpecies: TargetSpecies.DOG,
  saleUnit: SaleUnit.UNIT,
  priceCents: 18990,
  packageWeightGrams: 15000,
};
const invalid = (data: object, type: new () => object = CreateProductDto) =>
  validateSync(plainToInstance(type, data), {
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
  });
describe('Product contracts and explicit policy', () => {
  it('accepts real feed fields and trimmed text, not school values or money strings', () => {
    expect(invalid(product)).toHaveLength(0);
    const dto = plainToInstance(CreateProductDto, { ...product, name: "  Ração d'Água  " });
    expect(dto.name).toBe("Ração d'Água");
  });
  it.each([
    { priceCents: 1.5 },
    { priceCents: '18990' },
    { priceCents: 0 },
    { priceCents: Number.MAX_SAFE_INTEGER },
    { name: ' ' },
    { sku: '$bad' },
    { sku: 'á' },
    { category: 'discipline' },
    { targetSpecies: 'student' },
    { saleUnit: 'class' },
    { packageWeightGrams: -1 },
    { packageWeightGrams: 3.2 },
    { brand: null },
    { status: null },
    { organizationId: new Types.ObjectId().toString() },
    { student: 'x' },
    { roles: ['SYSTEM_ADMIN'] },
    { stock: 99 },
  ])('rejects invalid data %j', (patch) => {
    expect(invalid({ ...product, ...patch }).length).toBeGreaterThan(0);
  });
  it('patch does not expose mutable SKU/unit or null/authority and allows a partial price', () => {
    expect(invalid({ priceCents: 20000 }, UpdateProductDto)).toHaveLength(0);
    for (const patch of [
      { sku: 'OTHER' },
      { saleUnit: 'kg' },
      { name: null },
      { priceCents: null },
      { archivedAt: new Date() },
    ])
      expect(invalid(patch, UpdateProductDto).length).toBeGreaterThan(0);
  });
  it('declares operator-only storage, tenant metadata and real scoped uniqueness including archives', () => {
    expect(ProductSchema.get('autoIndex')).toBe(false);
    expect(ProductSchema.get('autoCreate')).toBe(false);
    expect(ProductSchema.indexes()).toContainEqual([
      { organizationId: 1, sku: 1 },
      expect.objectContaining({ unique: true }),
    ]);
    for (const key of ['organizationId', 'ownerId', 'createdBy', 'sku', 'saleUnit'])
      expect(ProductSchema.path(key).options.immutable).toBe(true);
  });
  it('also enforces integer money/weight at ODM validation', async () => {
    const Model = model<Product>('ProductSchemaValidationOnly', ProductSchema);
    const data = {
      ...product,
      organizationId: new Types.ObjectId(),
      ownerId: new Types.ObjectId(),
      createdBy: new Types.ObjectId(),
    };
    await expect(new Model(data).validate()).resolves.toBeUndefined();
    await expect(new Model({ ...data, priceCents: 1.5 }).validate()).rejects.toThrow();
    await expect(new Model({ ...data, packageWeightGrams: 1.5 }).validate()).rejects.toThrow();
  });
  it.each(Object.values(Role))(
    'uses explicit product permissions for %s, not role inheritance',
    (role) => {
      const engine = new PolicyEngine();
      const context: PolicyContext = {
        subject: {
          id: 'actor',
          sessionId: 'sid',
          roles: [role],
          status: AccountStatus.ACTIVE,
          organizationId: 'A',
          membershipId: 'membership',
          organizationStatus: 'active',
          membershipStatus: 'active',
        },
        resource: { type: PolicyResource.PRODUCT, organizationId: 'A', accessState: 'active' },
        environment: { method: 'POST' },
      };
      for (const action of [
        PolicyAction.CREATE,
        PolicyAction.LIST,
        PolicyAction.READ,
        PolicyAction.UPDATE,
        PolicyAction.DELETE,
      ]) {
        const expected = [PolicyAction.LIST, PolicyAction.READ].includes(action)
          ? role !== Role.CUSTOMER
          : [Role.SYSTEM_ADMIN, Role.ORGANIZATION_OWNER, Role.MANAGER].includes(role);
        expect(engine.evaluate({ action, resource: PolicyResource.PRODUCT }, context).allowed).toBe(
          expected,
        );
        expect(
          engine.evaluate(
            { action, resource: PolicyResource.PRODUCT },
            { ...context, resource: { ...context.resource, organizationId: 'B' } },
          ).allowed,
        ).toBe(false);
      }
    },
  );
});
