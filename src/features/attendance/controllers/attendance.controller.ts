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
import { AttendanceDto } from '../dtos/response/attendance.dto';
import { ResponseAttendanceArrayDto } from '../dtos/response/response-attendance-array.dto';
import { ResponseAttendanceSingleDto } from '../dtos/response/response-attendance-single.dto';
import { CreateAttendanceDto } from '../dtos/validation/create-attendance.dto';
import { UpdateAttendanceDto } from '../dtos/validation/update-attendance.dto';
import { AttendancesService } from '../services/attendance.service';

@Controller('attendances')
export class AttendancesController {
  constructor(private readonly attendancesService: AttendancesService) {}

  @RequirePolicies({ action: PolicyAction.CREATE, resource: PolicyResource.LEGACY_ATTENDANCE })
  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @ApiOkResponse({ type: ResponseAttendanceSingleDto })
  async create(@Request() req, @Body() dto: CreateAttendanceDto) {
    const attendance = await this.attendancesService.create(dto, req.user.id);
    return plainToInstance(AttendanceDto, attendance, {
      excludeExtraneousValues: true,
    });
  }

  @RequirePolicies({ action: PolicyAction.LIST, resource: PolicyResource.LEGACY_ATTENDANCE })
  @Get()
  @ApiOkResponse({ type: ResponseAttendanceArrayDto, isArray: true })
  async findAll() {
    const list = await this.attendancesService.findAll();
    return plainToInstance(AttendanceDto, list, {
      excludeExtraneousValues: true,
    });
  }

  @RequirePolicies({ action: PolicyAction.READ, resource: PolicyResource.LEGACY_ATTENDANCE })
  @Get(':id')
  @ApiOkResponse({ type: ResponseAttendanceSingleDto })
  async findOne(@Param('id', ValidateObjectIdPipe) id: string) {
    const attendance = await this.attendancesService.findOneById(id);
    if (!attendance) throw new NotFoundException(`Attendance ${id} not found`);

    return plainToInstance(AttendanceDto, attendance, {
      excludeExtraneousValues: true,
    });
  }

  @RequirePolicies({ action: PolicyAction.UPDATE, resource: PolicyResource.LEGACY_ATTENDANCE })
  @Patch(':id')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @ApiOkResponse({ type: ResponseAttendanceSingleDto })
  async update(@Param('id', ValidateObjectIdPipe) id: string, @Body() dto: UpdateAttendanceDto) {
    const updated = await this.attendancesService.update(id, dto);
    if (!updated) throw new NotFoundException(`Attendance ${id} not found`);

    return plainToInstance(AttendanceDto, updated, {
      excludeExtraneousValues: true,
    });
  }

  @RequirePolicies({ action: PolicyAction.DELETE, resource: PolicyResource.LEGACY_ATTENDANCE })
  @Delete(':id')
  @ApiOkResponse({ type: ResponseAttendanceSingleDto })
  async delete(@Param('id', ValidateObjectIdPipe) id: string) {
    const deleted = await this.attendancesService.delete(id);
    if (!deleted) throw new NotFoundException(`Attendance ${id} not found`);

    return plainToInstance(AttendanceDto, deleted, {
      excludeExtraneousValues: true,
    });
  }
}
