import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PolicyResource, PolicySubject } from '@/common/authorization/policy.types';
import { ScopedResourcesService } from '@/common/authorization/scoped-resources.service';
import { CreateAttendanceDto } from '../dtos/validation/create-attendance.dto';
import { UpdateAttendanceDto } from '../dtos/validation/update-attendance.dto';

@Injectable()
export class AttendancesService {
  constructor(
    private readonly resources: ScopedResourcesService,
    private readonly events: EventEmitter2,
  ) {}
  async create(dto: CreateAttendanceDto, actor: PolicySubject) {
    const saved = await this.resources.create(PolicyResource.LEGACY_ATTENDANCE, dto, actor);
    this.events.emit('attendance.created', { record: saved, subject: actor });
    return saved;
  }
  findAll(actor: PolicySubject) {
    return this.resources.list(PolicyResource.LEGACY_ATTENDANCE, actor);
  }
  findOneById(id: string, actor: PolicySubject) {
    return this.resources.get(PolicyResource.LEGACY_ATTENDANCE, id, actor);
  }
  update(id: string, dto: UpdateAttendanceDto, actor: PolicySubject) {
    return this.resources.update(PolicyResource.LEGACY_ATTENDANCE, id, dto, actor);
  }
  delete(id: string, actor: PolicySubject) {
    return this.resources.delete(PolicyResource.LEGACY_ATTENDANCE, id, actor);
  }
}
