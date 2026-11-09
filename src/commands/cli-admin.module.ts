import { Module } from '@nestjs/common';
import { GenerateJwtSecretCommand } from './generate-jwt-secret.command';

// Explicit filesystem-only command. Never import AppModule, ConfigModule or database modules.
@Module({ providers: [GenerateJwtSecretCommand] })
export class CliAdminModule {}
