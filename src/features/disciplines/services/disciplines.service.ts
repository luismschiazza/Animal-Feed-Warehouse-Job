import { Injectable } from '@nestjs/common';
import { PolicyResource, PolicySubject } from '@/common/authorization/policy.types';
import { ScopedResourcesService } from '@/common/authorization/scoped-resources.service';
import { CreateDisciplineDto } from '../dtos/validation/create-discipline.dto';
import { UpdateDisciplineDto } from '../dtos/validation/update-discipline.dto';

@Injectable()
export class DisciplinesService {
  constructor(private readonly resources: ScopedResourcesService) {}
  create(dto: CreateDisciplineDto, actor: PolicySubject) {
    return this.resources.create(PolicyResource.LEGACY_DISCIPLINE, dto, actor);
  }
  findAll(actor: PolicySubject) {
    return this.resources.list(PolicyResource.LEGACY_DISCIPLINE, actor);
  }
  findOneById(id: string, actor: PolicySubject) {
    return this.resources.get(PolicyResource.LEGACY_DISCIPLINE, id, actor);
  }
  update(id: string, dto: UpdateDisciplineDto, actor: PolicySubject) {
    return this.resources.update(PolicyResource.LEGACY_DISCIPLINE, id, dto, actor);
  }
  delete(id: string, actor: PolicySubject) {
    return this.resources.delete(PolicyResource.LEGACY_DISCIPLINE, id, actor);
  }
}
