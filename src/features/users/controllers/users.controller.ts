import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { Public, RequirePolicies } from '@/common/authorization/policy.decorators';
import { PolicyAction, PolicyResource } from '@/common/authorization/policy.types';
import { ValidateObjectIdPipe } from '@/common/pipes/validate-object-id.pipe';
import { ResponseUserArrayDto } from '../dtos/response/response-user-array.dto';
import { ResponseUserSingleDto } from '../dtos/response/response-user-single.dto';
import { ResponseUsersPageDto } from '../dtos/response/response-users-page.dto';
import { UserDto } from '../dtos/response/user.dto';
import { CreateUserDto } from '../dtos/validation/create-user.dto';
import { ListUsersPageDto } from '../dtos/validation/list-users-page.dto';
import { UpdateUserDto } from '../dtos/validation/update-user.dto';
import { ExcludeOwnUserGuard } from '../guards/exclude-own-user.guard';
import { NotOwnUserGuard } from '../guards/not-own-user.guard';
import { UsersService } from '../services/users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Public()
  @ApiOkResponse({ type: ResponseUserSingleDto })
  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @RequirePolicies({ action: PolicyAction.READ, resource: PolicyResource.PROFILE })
  @ApiOkResponse({ type: ResponseUserSingleDto })
  @Get('profile')
  async getProfile(@Request() req) {
    return plainToInstance(UserDto, req.user, { excludeExtraneousValues: true });
  }

  @UseGuards(ExcludeOwnUserGuard)
  @RequirePolicies({ action: PolicyAction.LIST, resource: PolicyResource.USER })
  @ApiOkResponse({ type: ResponseUserArrayDto, isArray: true })
  @Get()
  async findAll(@Request() req) {
    return plainToInstance(UserDto, req.filteredUsers, { excludeExtraneousValues: true });
  }

  @RequirePolicies({ action: PolicyAction.LIST, resource: PolicyResource.USER })
  @ApiOkResponse({ type: ResponseUsersPageDto })
  @Get('page')
  async findPage(@Request() req, @Query() query: ListUsersPageDto) {
    const { items, nextCursor } = await this.usersService.findPage(
      req.user,
      query.limit === undefined ? 50 : Number(query.limit),
      query.after,
    );
    return {
      items: plainToInstance(UserDto, items, { excludeExtraneousValues: true }),
      nextCursor,
    };
  }

  @UseGuards(NotOwnUserGuard)
  @RequirePolicies({ action: PolicyAction.READ, resource: PolicyResource.USER })
  @ApiOkResponse({ type: ResponseUserSingleDto })
  @Get(':id')
  async findOne(@Request() req, @Param('id', ValidateObjectIdPipe) id: string) {
    const user = await this.usersService.findScopedAccount(id, req.user);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return plainToInstance(UserDto, user, { excludeExtraneousValues: true });
  }

  @UseGuards(NotOwnUserGuard)
  @RequirePolicies({ action: PolicyAction.UPDATE, resource: PolicyResource.USER })
  @ApiOkResponse({ type: ResponseUserSingleDto })
  @Patch(':id')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async update(
    @Param('id', ValidateObjectIdPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    const user = await this.usersService.update(id, updateUserDto);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return plainToInstance(UserDto, user, { excludeExtraneousValues: true });
  }

  @UseGuards(NotOwnUserGuard)
  @RequirePolicies({ action: PolicyAction.DELETE, resource: PolicyResource.USER })
  @ApiOkResponse({ type: ResponseUserSingleDto })
  @Delete(':id')
  async delete(@Param('id', ValidateObjectIdPipe) id: string) {
    const user = await this.usersService.delete(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return plainToInstance(UserDto, user, { excludeExtraneousValues: true });
  }
}
