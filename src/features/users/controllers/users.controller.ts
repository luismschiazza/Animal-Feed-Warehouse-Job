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
import { ResponseUserArrayDto } from '../dtos/response/response-user-array.dto';
import { ResponseUserSingleDto } from '../dtos/response/response-user-single.dto';
import { UserDto } from '../dtos/response/user.dto';
import { CreateUserDto } from '../dtos/validation/create-user.dto';
import { UpdateUserDto } from '../dtos/validation/update-user.dto';
import { ExcludeOwnUserGuard } from '../guards/exclude-own-user.guard';
import { NotOwnUserGuard } from '../guards/not-own-user.guard';
import { UsersService } from '../services/users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOkResponse({ type: ResponseUserSingleDto })
  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ type: ResponseUserSingleDto })
  @Get('profile')
  async getProfile(@Request() req) {
    return plainToInstance(UserDto, req.user, { excludeExtraneousValues: true });
  }

  @UseGuards(JwtAuthGuard, RolesGuard, ExcludeOwnUserGuard)
  @Roles(Role.ADMIN)
  @ApiOkResponse({ type: ResponseUserArrayDto, isArray: true })
  @Get()
  async findAll(@Request() req) {
    return plainToInstance(UserDto, req.filteredUsers, { excludeExtraneousValues: true });
  }

  @UseGuards(JwtAuthGuard, RolesGuard, NotOwnUserGuard)
  @Roles(Role.ADMIN)
  @ApiOkResponse({ type: ResponseUserSingleDto })
  @Get(':id')
  async findOne(@Param('id', ValidateObjectIdPipe) id: string) {
    const user = await this.usersService.findOneById(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return plainToInstance(UserDto, user, { excludeExtraneousValues: true });
  }

  @UseGuards(JwtAuthGuard, RolesGuard, NotOwnUserGuard)
  @Roles(Role.ADMIN)
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

  @UseGuards(JwtAuthGuard, RolesGuard, NotOwnUserGuard)
  @Roles(Role.ADMIN)
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
