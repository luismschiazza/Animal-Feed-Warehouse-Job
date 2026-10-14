import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PolicyResource, PolicySubject } from '@/common/authorization/policy.types';
import { ScopedResourcesService } from '@/common/authorization/scoped-resources.service';
import { CreateMeetingDto } from '../dtos/validation/create-meeting.dto';
import { UpdateMeetingDto } from '../dtos/validation/update-meeting.dto';

@Injectable()
export class MeetingsService {
  constructor(
    private readonly resources: ScopedResourcesService,
    private readonly events: EventEmitter2,
  ) {}
  async create(dto: CreateMeetingDto, actor: PolicySubject) {
    const saved = await this.resources.create(PolicyResource.LEGACY_MEETING, dto, actor);
    this.events.emit('meeting.created', { record: saved, subject: actor });
    return saved;
  }
  findAll(actor: PolicySubject) {
    return this.resources.list(PolicyResource.LEGACY_MEETING, actor);
  }
  findOne(id: string, actor: PolicySubject) {
    return this.resources.get(PolicyResource.LEGACY_MEETING, id, actor);
  }
  update(id: string, dto: UpdateMeetingDto, actor: PolicySubject) {
    return this.resources.update(PolicyResource.LEGACY_MEETING, id, dto, actor);
  }
  delete(id: string, actor: PolicySubject) {
    return this.resources.delete(PolicyResource.LEGACY_MEETING, id, actor);
  }
}
