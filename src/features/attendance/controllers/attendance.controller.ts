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
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { Roles } from '@/common/decorators/roles.decorator';
import { Role } from '@/common/enums/role.enum';
import { RolesGuard } from '@/common/guards/roles.guard';
import { ValidateObjectIdPipe } from '@/common/pipes/validate-object-id.pipe';
import { JwtAuthGuard } from '@/features/auth/guards/jwt-auth.guard';
import { AttendanceDto } from '../dtos/response/attendance.dto';
import { ResponseAttendanceArrayDto } from '../dtos/response/response-attendance-array.dto';
import { ResponseAttendanceSingleDto } from '../dtos/response/response-attendance-single.dto';
import { CreateAttendanceDto } from '../dtos/validation/create-attendance.dto';
import { UpdateAttendanceDto } from '../dtos/validation/update-attendance.dto';
import { AttendancesService } from '../services/attendance.service';

@Controller('attendances')
export class AttendancesController {
  constructor(private readonly attendancesService: AttendancesService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @ApiOkResponse({ type: ResponseAttendanceSingleDto })
  async create(@Request() req, @Body() dto: CreateAttendanceDto) {
    const attendance = await this.attendancesService.create(dto, req.user.id);
    return plainToInstance(AttendanceDto, attendance, {
      excludeExtraneousValues: true,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiOkResponse({ type: ResponseAttendanceArrayDto, isArray: true })
  async findAll() {
    const list = await this.attendancesService.findAll();
    return plainToInstance(AttendanceDto, list, {
      excludeExtraneousValues: true,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Get(':id')
  @ApiOkResponse({ type: ResponseAttendanceSingleDto })
  async findOne(@Param('id', ValidateObjectIdPipe) id: string) {
    const attendance = await this.attendancesService.findOneById(id);
    if (!attendance) throw new NotFoundException(`Attendance ${id} not found`);

    return plainToInstance(AttendanceDto, attendance, {
      excludeExtraneousValues: true,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
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

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
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
