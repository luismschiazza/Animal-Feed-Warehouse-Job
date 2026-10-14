import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { RequirePolicies } from '@/common/authorization/policy.decorators';
import { PolicyAction, PolicyResource } from '@/common/authorization/policy.types';
import { ValidateObjectIdPipe } from '@/common/pipes/validate-object-id.pipe';
import { DisciplineDto } from '../dtos/response/discipline.dto';
import { ResponseDisciplineArrayDto } from '../dtos/response/response-discipline-array.dto';
import { ResponseDisciplineSingleDto } from '../dtos/response/response-discipline-single.dto';
import { CreateDisciplineDto } from '../dtos/validation/create-discipline.dto';
import { UpdateDisciplineDto } from '../dtos/validation/update-discipline.dto';
import { DisciplinesService } from '../services/disciplines.service';

@Controller('disciplines')
export class DisciplinesController {
  constructor(private readonly disciplinesService: DisciplinesService) {}

  @RequirePolicies({ action: PolicyAction.CREATE, resource: PolicyResource.LEGACY_DISCIPLINE })
  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @ApiOkResponse({ type: ResponseDisciplineSingleDto })
  async create(@Body() createDisciplineDto: CreateDisciplineDto) {
    const discipline = await this.disciplinesService.create(createDisciplineDto);
    return plainToInstance(DisciplineDto, discipline, {
      excludeExtraneousValues: true,
    });
  }

  @RequirePolicies({ action: PolicyAction.LIST, resource: PolicyResource.LEGACY_DISCIPLINE })
  @Get()
  @ApiOkResponse({ type: ResponseDisciplineArrayDto, isArray: true })
  async findAll() {
    const disciplines = await this.disciplinesService.findAll();
    return plainToInstance(DisciplineDto, disciplines, {
      excludeExtraneousValues: true,
    });
  }

  @RequirePolicies({ action: PolicyAction.READ, resource: PolicyResource.LEGACY_DISCIPLINE })
  @Get(':id')
  @ApiOkResponse({ type: ResponseDisciplineSingleDto })
  async findOne(@Param('id', ValidateObjectIdPipe) id: string) {
    const discipline = await this.disciplinesService.findOneById(id);
    if (!discipline) {
      throw new NotFoundException(`Discipline with ID ${id} not found`);
    }
    return plainToInstance(DisciplineDto, discipline, {
      excludeExtraneousValues: true,
    });
  }

  @RequirePolicies({ action: PolicyAction.UPDATE, resource: PolicyResource.LEGACY_DISCIPLINE })
  @Patch(':id')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @ApiOkResponse({ type: ResponseDisciplineSingleDto })
  async update(
    @Param('id', ValidateObjectIdPipe) id: string,
    @Body() updateDisciplineDto: UpdateDisciplineDto,
  ) {
    const discipline = await this.disciplinesService.update(id, updateDisciplineDto);
    if (!discipline) {
      throw new NotFoundException(`Discipline with ID ${id} not found`);
    }
    return plainToInstance(DisciplineDto, discipline, {
      excludeExtraneousValues: true,
    });
  }

  @RequirePolicies({ action: PolicyAction.DELETE, resource: PolicyResource.LEGACY_DISCIPLINE })
  @Delete(':id')
  @ApiOkResponse({ type: ResponseDisciplineSingleDto })
  async delete(@Param('id', ValidateObjectIdPipe) id: string) {
    const deleted = await this.disciplinesService.delete(id);
    if (!deleted) {
      throw new NotFoundException(`Discipline with ID ${id} not found`);
    }
    return plainToInstance(DisciplineDto, deleted, {
      excludeExtraneousValues: true,
    });
  }
}
