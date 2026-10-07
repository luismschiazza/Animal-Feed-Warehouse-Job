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
import { GradeDto } from '../dtos/response/grade.dto';
import { ResponseGradeArrayDto } from '../dtos/response/response-grade-array.dtp';
import { ResponseGradeSingleDto } from '../dtos/response/response-grade-single.dto';
import { CreateGradeDto } from '../dtos/validation/create-grade.dto';
import { UpdateGradeDto } from '../dtos/validation/update-grade.dto';
import { GradesService } from '../services/grades.service';

@Controller('grades')
export class GradesController {
  constructor(private readonly gradesService: GradesService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @ApiOkResponse({ type: ResponseGradeSingleDto })
  async create(@Request() req, @Body() dto: CreateGradeDto) {
    const grade = await this.gradesService.create(dto, req.user.id);

    return plainToInstance(GradeDto, grade, {
      excludeExtraneousValues: true,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiOkResponse({ type: ResponseGradeArrayDto })
  async findAll() {
    const list = await this.gradesService.findAll();

    return plainToInstance(GradeDto, list, {
      excludeExtraneousValues: true,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  @ApiOkResponse({ type: ResponseGradeSingleDto })
  async findOne(@Param('id', ValidateObjectIdPipe) id: string) {
    const grade = await this.gradesService.findOne(id);
    if (!grade) throw new NotFoundException(`Grade ${id} not found`);

    return plainToInstance(GradeDto, grade, {
      excludeExtraneousValues: true,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Patch(':id')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @ApiOkResponse({ type: ResponseGradeSingleDto })
  async update(@Param('id', ValidateObjectIdPipe) id: string, @Body() dto: UpdateGradeDto) {
    const updated = await this.gradesService.update(id, dto);
    if (!updated) throw new NotFoundException(`Grade ${id} not found`);

    return plainToInstance(GradeDto, updated, {
      excludeExtraneousValues: true,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Delete(':id')
  @ApiOkResponse({ type: ResponseGradeSingleDto })
  async delete(@Param('id', ValidateObjectIdPipe) id: string) {
    const deleted = await this.gradesService.delete(id);
    if (!deleted) throw new NotFoundException(`Grade ${id} not found`);

    return plainToInstance(GradeDto, deleted, {
      excludeExtraneousValues: true,
    });
  }
}
