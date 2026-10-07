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
import { MeetingDto } from '../dtos/response/meeting.dto';
import { ResponseMeetingArrayDto } from '../dtos/response/response-meeting-array.dto';
import { ResponseMeetingSingleDto } from '../dtos/response/response-meeting-single.dto';
import { CreateMeetingDto } from '../dtos/validation/create-meeting.dto';
import { UpdateMeetingDto } from '../dtos/validation/update-meeting.dto';
import { MeetingsService } from '../services/meeting.service';

@Controller('meetings')
export class MeetingsController {
  constructor(private readonly meetingsService: MeetingsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @ApiOkResponse({ type: ResponseMeetingSingleDto })
  async create(@Request() req, @Body() dto: CreateMeetingDto) {
    const meeting = await this.meetingsService.create(dto, req.user.id);
    return plainToInstance(MeetingDto, meeting, {
      excludeExtraneousValues: true,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiOkResponse({ type: ResponseMeetingArrayDto })
  async findAll() {
    const list = await this.meetingsService.findAll();
    return plainToInstance(MeetingDto, list, {
      excludeExtraneousValues: true,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Get(':id')
  @ApiOkResponse({ type: ResponseMeetingSingleDto })
  async findOne(@Param('id', ValidateObjectIdPipe) id: string) {
    const meeting = await this.meetingsService.findOne(id);
    if (!meeting) throw new NotFoundException(`Meeting ${id} not found`);

    return plainToInstance(MeetingDto, meeting, {
      excludeExtraneousValues: true,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Patch(':id')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @ApiOkResponse({ type: ResponseMeetingSingleDto })
  async update(@Param('id', ValidateObjectIdPipe) id: string, @Body() dto: UpdateMeetingDto) {
    const updated = await this.meetingsService.update(id, dto);
    if (!updated) throw new NotFoundException(`Meeting ${id} not found`);

    return plainToInstance(MeetingDto, updated, {
      excludeExtraneousValues: true,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Delete(':id')
  @ApiOkResponse({ type: ResponseMeetingSingleDto })
  async delete(@Param('id', ValidateObjectIdPipe) id: string) {
    const deleted = await this.meetingsService.delete(id);
    if (!deleted) throw new NotFoundException(`Meeting ${id} not found`);

    return plainToInstance(MeetingDto, deleted, {
      excludeExtraneousValues: true,
    });
  }
}
