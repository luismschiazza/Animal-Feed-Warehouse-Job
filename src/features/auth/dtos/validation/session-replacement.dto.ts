import { IsMongoId, IsOptional, IsString, IsUUID, Length } from 'class-validator';

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
