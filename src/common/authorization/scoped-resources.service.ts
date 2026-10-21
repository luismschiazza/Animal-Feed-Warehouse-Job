import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { AuthSessionsService } from '@/features/auth/services/auth-sessions.service';
import { OrganizationAccessService } from '@/features/organizations/services/organization-access.service';
import { AuditEvent } from '../audit/security-audit.schema';
import { SecurityAuditService } from '../audit/security-audit.service';
import { AccountStatus } from '../enums/account-status.enum';
import { PolicyEngine } from './policy-engine.service';
import {
  PolicyAction,
  PolicyResource,
  PolicyResourceAttributes,
  PolicySubject,
} from './policy.types';

const models: Partial<Record<PolicyResource, string>> = {
  [PolicyResource.LEGACY_DISCIPLINE]: 'Discipline',
  [PolicyResource.LEGACY_ATTENDANCE]: 'Attendance',
  [PolicyResource.LEGACY_GRADE]: 'Grade',
  [PolicyResource.LEGACY_MEETING]: 'Meeting',
};
const fields: Partial<Record<PolicyResource, string[]>> = {
  [PolicyResource.LEGACY_DISCIPLINE]: ['name'],
  [PolicyResource.LEGACY_ATTENDANCE]: ['student', 'discipline', 'date', 'status'],
  [PolicyResource.LEGACY_GRADE]: ['student', 'discipline', 'value', 'type', 'term', 'comments'],
  [PolicyResource.LEGACY_MEETING]: ['title', 'description', 'start_at', 'end_at', 'participants'],
};

@Injectable()
export class ScopedResourcesService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly sessions: AuthSessionsService,
    private readonly organizations: OrganizationAccessService,
    private readonly engine: PolicyEngine,
    private readonly audit: SecurityAuditService,
  ) {}

  private model(resource: PolicyResource): Model<any> {
    const name = models[resource];
    if (!name || !this.connection.models[name]) throw this.denied();
    return this.connection.models[name];
  }
  private oid(value: unknown) {
    if (typeof value !== 'string' || !/^[a-f0-9]{24}$/i.test(value)) throw this.denied();
    return new Types.ObjectId(value);
  }
  private denied() {
    return new ForbiddenException('Resource access denied');
  }

  private async current(subject: PolicySubject): Promise<PolicySubject> {
    if (!subject?.organizationId) throw this.denied();
    const session = await this.sessions.findActive(subject.sessionId, subject.id);
    if (session.organizationId?.toString() !== subject.organizationId) throw this.denied();
    const account = await this.connection.models.User.findOne({
      _id: this.oid(subject.id),
      status: AccountStatus.ACTIVE,
    })
      .select('_id')
      .lean();
    if (!account) throw this.denied();
    const access = await this.organizations.requireActiveMembership(
      subject.id,
      subject.organizationId,
    );
    return {
      ...subject,
      ...access,
      status: AccountStatus.ACTIVE,
      organizationStatus: 'active',
      membershipStatus: 'active',
    };
  }

  private async userRow(id: string, organizationId: string) {
    const membership = await this.organizations.requireActiveMembership(id, organizationId);
    const user = await this.connection.models.User.findOne({
      _id: this.oid(id),
      status: AccountStatus.ACTIVE,
    })
      .select('_id name email status createdAt updatedAt')
      .lean<any>();
    if (!user) throw this.denied();
    return { ...user, id: id.toLowerCase(), roles: membership.roles };
  }

  async authorize(
    resource: PolicyResource,
    action: PolicyAction,
    subject: PolicySubject,
    id?: string,
  ) {
    let actor: PolicySubject;
    try {
      actor = await this.current(subject);
      const result = await this.authorizeResolved(resource, action, actor, id);
      await this.audit.record(AuditEvent.AUTHORIZATION, 'allowed', 'service', actor, {
        resource,
        action,
        targetId: id,
      });
      return result;
    } catch (error) {
      await this.audit.record(
        AuditEvent.AUTHORIZATION,
        this.audit.result(error),
        'service',
        actor,
        { resource, action, targetId: id },
      );
      throw error;
    }
  }

  private async authorizeResolved(
    resource: PolicyResource,
    action: PolicyAction,
    actor: PolicySubject,
    id?: string,
  ) {
    let row: any;
    const attributes: PolicyResourceAttributes = {
      type: resource,
      organizationId: actor.organizationId,
      accessState: 'active',
    };
    if (action !== PolicyAction.CREATE && action !== PolicyAction.LIST) {
      if (!id) throw this.denied();
      row =
        resource === PolicyResource.USER
          ? await this.userRow(id, actor.organizationId)
          : await this.model(resource)
              .findOne({
                _id: this.oid(id),
                organizationId: this.oid(actor.organizationId),
                ownerId: { $type: 'objectId' },
                createdBy: { $type: 'objectId' },
              })
              .lean();
      if (!row) throw this.denied();
      attributes.id = id;
      attributes.ownerId = resource === PolicyResource.USER ? id : row.ownerId?.toString();
      attributes.creatorId =
        resource === PolicyResource.USER ? undefined : row.createdBy?.toString();
      attributes.accessState = resource === PolicyResource.USER ? 'active' : row.accessState;
      // For stored resources this comes from the matching DB row, never the request body.
      attributes.organizationId =
        resource === PolicyResource.USER ? actor.organizationId : row.organizationId?.toString();
    }
    if (
      !this.engine.evaluate(
        { resource, action },
        { subject: actor, resource: attributes, environment: { method: action } },
      ).allowed
    )
      throw this.denied();
    return { actor, attributes, row };
  }

  async list(resource: PolicyResource, subject: PolicySubject) {
    const { actor } = await this.authorize(resource, PolicyAction.LIST, subject);
    if (resource === PolicyResource.USER) {
      const members = await this.connection.models.OrganizationMembership.find({
        organizationId: this.oid(actor.organizationId),
        status: 'active',
      }).lean();
      const users = await this.connection.models.User.find({
        _id: { $in: members.map((m) => m.userId) },
        status: AccountStatus.ACTIVE,
      })
        .select('_id name email status createdAt updatedAt')
        .lean();
      return users
        .filter((u) => u._id.toString() !== actor.id)
        .map((u) => ({
          ...u,
          id: u._id.toString(),
          roles: members.find((m) => m.userId.toString() === u._id.toString())?.roles,
        }));
    }
    return this.model(resource)
      .find({
        organizationId: this.oid(actor.organizationId),
        ownerId: { $type: 'objectId' },
        createdBy: { $type: 'objectId' },
        accessState: { $in: ['active', 'locked'] },
      })
      .exec();
  }
  async get(resource: PolicyResource, id: string, subject: PolicySubject) {
    const { actor, row } = await this.authorize(resource, PolicyAction.READ, subject, id);
    if (resource === PolicyResource.USER) return row;
    return this.model(resource)
      .findOne({
        _id: this.oid(id),
        organizationId: this.oid(actor.organizationId),
        ownerId: { $type: 'objectId' },
        createdBy: { $type: 'objectId' },
        accessState: { $in: ['active', 'locked'] },
      })
      .exec();
  }

  // Internal events retain the authenticated actor; all data/recipients are reloaded.
  // No synthetic identity, global lookup, or trust in an event's supplied references.
  async notification(
    resource: PolicyResource,
    event: { record: { id: string }; subject: PolicySubject },
  ) {
    if (
      ![
        PolicyResource.LEGACY_GRADE,
        PolicyResource.LEGACY_ATTENDANCE,
        PolicyResource.LEGACY_MEETING,
      ].includes(resource)
    )
      throw this.denied();
    const { actor, row } = await this.authorize(
      resource,
      PolicyAction.READ,
      event?.subject,
      event?.record?.id,
    );
    const org = actor.organizationId;
    const student = row.student ? await this.userRow(row.student.toString(), org) : undefined;
    const participants = await Promise.all(
      (row.participants ?? []).map((id) => this.userRow(id.toString(), org)),
    );
    const discipline: any = row.discipline
      ? await this.model(PolicyResource.LEGACY_DISCIPLINE)
          .findOne({
            _id: row.discipline,
            organizationId: this.oid(org),
            ownerId: { $type: 'objectId' },
            createdBy: { $type: 'objectId' },
            accessState: { $in: ['active', 'locked'] },
          })
          .lean()
      : undefined;
    if (row.discipline && !discipline) throw this.denied();
    const filter = {
      organizationId: this.oid(org),
      ownerId: { $type: 'objectId' },
      createdBy: { $type: 'objectId' },
      accessState: { $in: ['active', 'locked'] },
      student: row.student,
      discipline: row.discipline,
    };
    const totalClasses =
      resource === PolicyResource.LEGACY_ATTENDANCE
        ? await this.model(resource).countDocuments(filter)
        : 0;
    const totalPresent =
      resource === PolicyResource.LEGACY_ATTENDANCE
        ? await this.model(resource).countDocuments({ ...filter, status: 'PRESENT' })
        : 0;
    return { record: row, student, participants, discipline, totalClasses, totalPresent };
  }

  private payload(resource: PolicyResource, dto: Record<string, any>) {
    const allowed = fields[resource];
    if (!allowed) throw this.denied();
    for (const forbidden of [
      'organizationId',
      'ownerId',
      'accessState',
      'createdBy',
      'recordedBy',
      'roles',
    ]) {
      if (Object.prototype.hasOwnProperty.call(dto, forbidden)) throw this.denied();
    }
    return Object.fromEntries(
      allowed.filter((key) => dto[key] !== undefined).map((key) => [key, dto[key]]),
    );
  }
  private async references(
    resource: PolicyResource,
    data: Record<string, any>,
    organizationId: string,
  ) {
    for (const key of ['student'])
      if (data[key] !== undefined) {
        await this.userRow(data[key], organizationId);
        data[key] = this.oid(data[key]);
      }
    if (data.participants !== undefined) {
      if (!Array.isArray(data.participants) || data.participants.length > 100) throw this.denied();
      for (const id of data.participants) await this.userRow(id, organizationId);
      data.participants = data.participants.map((id) => this.oid(id));
    }
    if (data.discipline !== undefined) {
      const match = await this.model(PolicyResource.LEGACY_DISCIPLINE)
        .findOne({
          _id: this.oid(data.discipline),
          organizationId: this.oid(organizationId),
          accessState: 'active',
          ownerId: { $type: 'objectId' },
          createdBy: { $type: 'objectId' },
        })
        .select('_id')
        .lean();
      if (!match) throw this.denied();
      data.discipline = this.oid(data.discipline);
    }
    if (resource === PolicyResource.LEGACY_MEETING) {
      const start = new Date(data.start_at),
        end = new Date(data.end_at);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start)
        throw new BadRequestException('Invalid meeting dates');
      const conflict = await this.model(resource).exists({
        organizationId: this.oid(organizationId),
        start_at: { $lt: end },
        end_at: { $gt: start },
        ...(data._id ? { _id: { $ne: data._id } } : {}),
      });
      if (conflict) throw new BadRequestException('Schedule conflict');
      data.start_at = start;
      data.end_at = end;
      delete data._id;
    }
  }
  async create(resource: PolicyResource, dto: Record<string, any>, subject: PolicySubject) {
    const { actor } = await this.authorize(resource, PolicyAction.CREATE, subject);
    const data = this.payload(resource, dto);
    await this.references(resource, data, actor.organizationId);
    const metadata: Record<string, any> = {
      organizationId: this.oid(actor.organizationId),
      ownerId: this.oid(actor.id),
      createdBy: this.oid(actor.id),
      accessState: 'active',
    };
    if (resource === PolicyResource.LEGACY_GRADE || resource === PolicyResource.LEGACY_ATTENDANCE)
      metadata.recordedBy = this.oid(actor.id);
    if (resource === PolicyResource.LEGACY_MEETING) metadata.createdBy = this.oid(actor.id);
    return this.model(resource).create({ ...data, ...metadata });
  }
  async update(
    resource: PolicyResource,
    id: string,
    dto: Record<string, any>,
    subject: PolicySubject,
  ) {
    const { actor, row } = await this.authorize(resource, PolicyAction.UPDATE, subject, id);
    const data = this.payload(resource, dto);
    if (resource === PolicyResource.LEGACY_MEETING) {
      data.start_at ??= row.start_at;
      data.end_at ??= row.end_at;
      data._id = row._id;
    }
    await this.references(resource, data, actor.organizationId);
    const result = await this.model(resource)
      .findOneAndUpdate(
        {
          _id: this.oid(id),
          organizationId: this.oid(actor.organizationId),
          ownerId: row.ownerId,
          createdBy: row.createdBy,
          accessState: 'active',
        },
        { $set: { ...data, updatedAt: new Date() } },
        { new: true, runValidators: true },
      )
      .exec();
    if (!result) throw this.denied();
    return result;
  }
  async delete(resource: PolicyResource, id: string, subject: PolicySubject) {
    const { actor, row } = await this.authorize(resource, PolicyAction.DELETE, subject, id);
    const result = await this.model(resource)
      .findOneAndDelete({
        _id: this.oid(id),
        organizationId: this.oid(actor.organizationId),
        ownerId: row.ownerId,
        createdBy: row.createdBy,
        accessState: 'active',
      })
      .exec();
    if (!result) throw this.denied();
    return result;
  }
}
