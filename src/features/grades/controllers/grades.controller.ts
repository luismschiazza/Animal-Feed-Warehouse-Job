import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Request,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { RequirePolicies } from '@/common/authorization/policy.decorators';
import { PolicyAction, PolicyResource } from '@/common/authorization/policy.types';
import { ValidateObjectIdPipe } from '@/common/pipes/validate-object-id.pipe';
import { GradeDto } from '../dtos/response/grade.dto';
import { ResponseGradeArrayDto } from '../dtos/response/response-grade-array.dtp';
import { ResponseGradeSingleDto } from '../dtos/response/response-grade-single.dto';
import { CreateGradeDto } from '../dtos/validation/create-grade.dto';
import { UpdateGradeDto } from '../dtos/validation/update-grade.dto';
import { GradesService } from '../services/grades.service';

@Controller('grades')
export class GradesController {
  constructor(private readonly gradesService: GradesService) {}

  @RequirePolicies({ action: PolicyAction.CREATE, resource: PolicyResource.LEGACY_GRADE })
  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @ApiOkResponse({ type: ResponseGradeSingleDto })
  async create(@Request() req, @Body() dto: CreateGradeDto) {
    const grade = await this.gradesService.create(dto, req.user);

    return plainToInstance(GradeDto, grade, {
      excludeExtraneousValues: true,
    });
  }

  @RequirePolicies({ action: PolicyAction.LIST, resource: PolicyResource.LEGACY_GRADE })
  @Get()
  @ApiOkResponse({ type: ResponseGradeArrayDto })
  async findAll(@Request() req) {
    const list = await this.gradesService.findAll(req.user);

    return plainToInstance(GradeDto, list, {
      excludeExtraneousValues: true,
    });
  }

  @RequirePolicies({ action: PolicyAction.READ, resource: PolicyResource.LEGACY_GRADE })
  @Get(':id')
  @ApiOkResponse({ type: ResponseGradeSingleDto })
  async findOne(@Request() req, @Param('id', ValidateObjectIdPipe) id: string) {
    const grade = await this.gradesService.findOne(id, req.user);
    if (!grade) throw new NotFoundException(`Grade ${id} not found`);

    return plainToInstance(GradeDto, grade, {
      excludeExtraneousValues: true,
    });
  }

  @RequirePolicies({ action: PolicyAction.UPDATE, resource: PolicyResource.LEGACY_GRADE })
  @Patch(':id')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @ApiOkResponse({ type: ResponseGradeSingleDto })
  async update(
    @Request() req,
    @Param('id', ValidateObjectIdPipe) id: string,
    @Body() dto: UpdateGradeDto,
  ) {
    const updated = await this.gradesService.update(id, dto, req.user);
    if (!updated) throw new NotFoundException(`Grade ${id} not found`);

    return plainToInstance(GradeDto, updated, {
      excludeExtraneousValues: true,
    });
  }

  @RequirePolicies({ action: PolicyAction.DELETE, resource: PolicyResource.LEGACY_GRADE })
  @Delete(':id')
  @ApiOkResponse({ type: ResponseGradeSingleDto })
  async delete(@Request() req, @Param('id', ValidateObjectIdPipe) id: string) {
    const deleted = await this.gradesService.delete(id, req.user);
    if (!deleted) throw new NotFoundException(`Grade ${id} not found`);

    return plainToInstance(GradeDto, deleted, {
      excludeExtraneousValues: true,
    });
  }
}
