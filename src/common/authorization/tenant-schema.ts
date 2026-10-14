import { Schema, SchemaTypes } from 'mongoose';

export function addTenantFields(
  schema: Schema,
  users: string[] = [],
  disciplines: string[] = [],
  userArrays: string[] = [],
) {
  schema.add({
    organizationId: {
      type: SchemaTypes.ObjectId,
      ref: 'Organization',
      required: true,
      immutable: true,
    },
    ownerId: { type: SchemaTypes.ObjectId, ref: 'User', required: true, immutable: true },
    createdBy: { type: SchemaTypes.ObjectId, ref: 'User', required: true, immutable: true },
    accessState: { type: String, enum: ['active', 'locked'], required: true, default: 'active' },
  });
  for (const field of users)
    schema.add({
      [field]: {
        type: SchemaTypes.ObjectId,
        ref: 'User',
        required: true,
        immutable: ['createdBy', 'recordedBy'].includes(field),
      },
    });
  for (const field of disciplines)
    schema.add({ [field]: { type: SchemaTypes.ObjectId, ref: 'Discipline', required: true } });
  for (const field of userArrays)
    schema.add({ [field]: { type: [SchemaTypes.ObjectId], ref: 'User', default: [] } });
  schema.index({ organizationId: 1, _id: 1 });
}
