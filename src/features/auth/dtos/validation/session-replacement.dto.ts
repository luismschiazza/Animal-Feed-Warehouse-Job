import { IsMongoId, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { LoginRequestDto } from './login-request.dto';

export class StartSessionReplacementDto extends LoginRequestDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  recoveryChallenge?: string;
}
export class RecoverSessionReplacementDto extends LoginRequestDto {
  @IsMongoId()
  organizationId: string;
  @IsUUID('4')
  flowId: string;
  @IsUUID('4')
  recoveryRequestId: string;
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  recoveryVerifier: string;
}

export class SessionReplacementDto {
  @IsString()
  @Length(84, 84)
  replacementToken: string;
}
export class ListSessionReplacementDto extends SessionReplacementDto {
  @IsOptional()
  @IsMongoId()
  before?: string;
}
export class ConfirmSessionReplacementDto extends SessionReplacementDto {
  @IsUUID('4')
  sessionId: string;
}
