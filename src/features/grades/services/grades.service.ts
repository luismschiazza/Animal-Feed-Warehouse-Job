import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PolicyResource, PolicySubject } from '@/common/authorization/policy.types';
import { ScopedResourcesService } from '@/common/authorization/scoped-resources.service';
import { CreateGradeDto } from '../dtos/validation/create-grade.dto';
import { UpdateGradeDto } from '../dtos/validation/update-grade.dto';

@Injectable()
export class GradesService {
  constructor(
    private readonly resources: ScopedResourcesService,
    private readonly events: EventEmitter2,
  ) {}
  async create(dto: CreateGradeDto, actor: PolicySubject) {
    const saved = await this.resources.create(PolicyResource.LEGACY_GRADE, dto, actor);
    this.events.emit('grade.created', { record: saved, subject: actor });
    return saved;
  }
  findAll(actor: PolicySubject) {
    return this.resources.list(PolicyResource.LEGACY_GRADE, actor);
  }
  findOne(id: string, actor: PolicySubject) {
    return this.resources.get(PolicyResource.LEGACY_GRADE, id, actor);
  }
  update(id: string, dto: UpdateGradeDto, actor: PolicySubject) {
    return this.resources.update(PolicyResource.LEGACY_GRADE, id, dto, actor);
  }
  delete(id: string, actor: PolicySubject) {
    return this.resources.delete(PolicyResource.LEGACY_GRADE, id, actor);
  }
}
