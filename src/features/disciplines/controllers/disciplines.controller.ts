import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
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
import { DisciplineDto } from '../dtos/response/discipline.dto';
import { ResponseDisciplineArrayDto } from '../dtos/response/response-discipline-array.dto';
import { ResponseDisciplineSingleDto } from '../dtos/response/response-discipline-single.dto';
import { CreateDisciplineDto } from '../dtos/validation/create-discipline.dto';
import { UpdateDisciplineDto } from '../dtos/validation/update-discipline.dto';
import { DisciplinesService } from '../services/disciplines.service';

@Controller('disciplines')
export class DisciplinesController {
  constructor(private readonly disciplinesService: DisciplinesService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.COORDINATOR)
  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @ApiOkResponse({ type: ResponseDisciplineSingleDto })
  async create(@Body() createDisciplineDto: CreateDisciplineDto) {
    const discipline = await this.disciplinesService.create(createDisciplineDto);
    return plainToInstance(DisciplineDto, discipline, {
      excludeExtraneousValues: true,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiOkResponse({ type: ResponseDisciplineArrayDto, isArray: true })
  async findAll() {
    const disciplines = await this.disciplinesService.findAll();
    return plainToInstance(DisciplineDto, disciplines, {
      excludeExtraneousValues: true,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.COORDINATOR)
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

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.COORDINATOR)
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

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.COORDINATOR)
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
