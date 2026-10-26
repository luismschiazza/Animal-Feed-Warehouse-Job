import { Injectable } from '@nestjs/common';

/** Historical school fixtures are not warehouse provisioning. Disabled in ALL environments. */
@Injectable()
export class SeedService {
  private disabled(): never {
    throw new Error('Legacy demonstration seeds are disabled; use reviewed operator provisioning');
  }

  async seedDisciplines(_limit?: number): Promise<void> {
    void _limit;
    this.disabled();
  }
  async seedUsers(_limit?: number): Promise<void> {
    void _limit;
    this.disabled();
  }
  async seedAttendances(_limit?: number): Promise<void> {
    void _limit;
    this.disabled();
  }
  async seedMeeting(_limit?: number): Promise<void> {
    void _limit;
    this.disabled();
  }
  async seedGrade(_limit?: number): Promise<void> {
    void _limit;
    this.disabled();
  }
  async seedMailer(): Promise<void> {
    this.disabled();
  }
}
