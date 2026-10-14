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
import { MeetingDto } from '../dtos/response/meeting.dto';
import { ResponseMeetingArrayDto } from '../dtos/response/response-meeting-array.dto';
import { ResponseMeetingSingleDto } from '../dtos/response/response-meeting-single.dto';
import { CreateMeetingDto } from '../dtos/validation/create-meeting.dto';
import { UpdateMeetingDto } from '../dtos/validation/update-meeting.dto';
import { MeetingsService } from '../services/meeting.service';

@Controller('meetings')
export class MeetingsController {
  constructor(private readonly meetingsService: MeetingsService) {}

  @RequirePolicies({ action: PolicyAction.CREATE, resource: PolicyResource.LEGACY_MEETING })
  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @ApiOkResponse({ type: ResponseMeetingSingleDto })
  async create(@Request() req, @Body() dto: CreateMeetingDto) {
    const meeting = await this.meetingsService.create(dto, req.user.id);
    return plainToInstance(MeetingDto, meeting, {
      excludeExtraneousValues: true,
    });
  }

  @RequirePolicies({ action: PolicyAction.LIST, resource: PolicyResource.LEGACY_MEETING })
  @Get()
  @ApiOkResponse({ type: ResponseMeetingArrayDto })
  async findAll() {
    const list = await this.meetingsService.findAll();
    return plainToInstance(MeetingDto, list, {
      excludeExtraneousValues: true,
    });
  }

  @RequirePolicies({ action: PolicyAction.READ, resource: PolicyResource.LEGACY_MEETING })
  @Get(':id')
  @ApiOkResponse({ type: ResponseMeetingSingleDto })
  async findOne(@Param('id', ValidateObjectIdPipe) id: string) {
    const meeting = await this.meetingsService.findOne(id);
    if (!meeting) throw new NotFoundException(`Meeting ${id} not found`);

    return plainToInstance(MeetingDto, meeting, {
      excludeExtraneousValues: true,
    });
  }

  @RequirePolicies({ action: PolicyAction.UPDATE, resource: PolicyResource.LEGACY_MEETING })
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

  @RequirePolicies({ action: PolicyAction.DELETE, resource: PolicyResource.LEGACY_MEETING })
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
